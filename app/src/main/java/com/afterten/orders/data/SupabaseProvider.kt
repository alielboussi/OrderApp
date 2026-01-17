@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package com.afterten.orders.data

import android.content.Context
import com.afterten.orders.BuildConfig
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.headers
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNames
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.builtins.ListSerializer
import io.ktor.client.statement.HttpResponse
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.PostgresAction
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import android.util.Log
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import kotlin.system.measureTimeMillis
import io.ktor.client.call.body
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import com.afterten.orders.data.RoleGuards
import kotlin.text.Charsets

class SupabaseProvider(context: Context) {
    // Allow overriding the default Orders backend with the warehouse backoffice endpoint when provided.
    val supabaseUrl: String = BuildConfig.WAREHOUSE_BACKOFFICE_URL.takeIf { it.isNotBlank() }
        ?: BuildConfig.SUPABASE_URL
    val supabaseAnonKey: String = BuildConfig.SUPABASE_ANON_KEY

    // Ktor client for custom RPC calls (e.g., outlet_login)
    val http = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                encodeDefaults = true
            })
        }
        install(Logging) {
            level = LogLevel.INFO
        }
    }

    // Supabase client for Realtime (v2 API)
    private val realtimeClient = createSupabaseClient(supabaseUrl, supabaseAnonKey) {
        install(Realtime)
    }

    // Track current JWT and active channels to support token refresh and auto-resubscribe
    @Volatile private var currentJwt: String? = null
    @Volatile private var ordersChannel: io.github.jan.supabase.realtime.RealtimeChannel? = null
    private val _ordersEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val ordersEvents: SharedFlow<Unit> = _ordersEvents.asSharedFlow()

    data class RealtimeSubscriptionHandle(
        private val job: Job,
        private val onClose: suspend () -> Unit
    ) {
        fun close() {
            CoroutineScope(Dispatchers.IO).launch {
                runCatching { onClose() }
            }
            runCatching { job.cancel() }
        }
    }

    /** Subscribe to Postgres changes on public.orders for the outlet; triggers on any insert/update */
    fun subscribeOrders(
        jwt: String,
        outletId: String?,
        onEvent: () -> Unit
    ): RealtimeSubscriptionHandle {
        val scope = CoroutineScope(Dispatchers.IO)
        val channelName = outletId?.takeIf { it.isNotBlank() }?.let { "orders_$it" } ?: "orders_all"
        val channel = realtimeClient.realtime.channel(channelName)
        ordersChannel = channel
        currentJwt = jwt
        val job = scope.launch {
            // Provide JWT to this channel for RLS
            try { channel.updateAuth(jwt) } catch (t: Throwable) { Log.w("Realtime", "updateAuth initial failed: ${t.message}") }
            // Build a flow of changes filtered by outlet
            val flowOrders = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                table = "orders"
                outletId?.takeIf { it.isNotBlank() }?.let { filter("outlet_id", FilterOperator.EQ, it) }
            }
            // Also listen to order_items changes to reflect supervisor edits immediately
            val flowItems = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                table = "order_items"
                // Optional: omit filter to let RLS scope events; or add a column outlet_id if present
            }
            // Subscribe and start collecting
            Log.d("Realtime", "Subscribing to orders changes for outlet=${outletId ?: "<all>"}")
            channel.subscribe()
            launch {
                flowOrders.collect {
                    Log.d("Realtime", "orders change event received (outlet=${outletId ?: "<all>"})")
                    onEvent()
                }
            }
            launch {
                flowItems.collect {
                    Log.d("Realtime", "order_items change event received")
                    onEvent()
                }
            }
        }
        return RealtimeSubscriptionHandle(job) {
            Log.d("Realtime", "Unsubscribing from orders (outlet=$outletId)")
            channel.unsubscribe()
            if (ordersChannel === channel) ordersChannel = null
        }
    }

    /** Update JWT on active realtime channels (call when token refreshes) */
    fun updateRealtimeAuth(newJwt: String) {
        currentJwt = newJwt
        ordersChannel?.let { ch ->
            CoroutineScope(Dispatchers.IO).launch {
                try { ch.updateAuth(newJwt) } catch (t: Throwable) { Log.w("Realtime", "updateAuth failed: ${t.message}") }
            }
        }
    }

    fun emitOrdersChanged() {
        _ordersEvents.tryEmit(Unit)
    }

    // Optional: mark order modified by supervisor (server RPC sets flags/columns used for badge)
    suspend fun markOrderModified(jwt: String, orderId: String, supervisorName: String) {
        val endpoint = "$supabaseUrl/rest/v1/rpc/mark_order_modified"
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(mapOf("p_order_id" to orderId, "p_supervisor_name" to supervisorName))
        }
        val code = resp.status.value
        if (code !in 200..299) {
            val txt = runCatching { resp.bodyAsText() }.getOrNull()
            throw IllegalStateException("mark_order_modified failed: HTTP $code ${txt ?: ""}")
        }
    }

    suspend fun rpcLogin(email: String, password: String): String {
        require(supabaseUrl.isNotBlank() && supabaseAnonKey.isNotBlank()) {
            "SUPABASE_URL/ANON_KEY not configured"
        }
        // 1) Password grant with Supabase Auth to obtain a real JWT
        @Serializable
        data class AuthTokenResp(
            @SerialName("access_token") val accessToken: String? = null,
            @SerialName("refresh_token") val refreshToken: String? = null,
            @SerialName("expires_in") val expiresInSec: Long? = null,
            @SerialName("token_type") val tokenType: String? = null
        )

        val tokenRespText = http.post("$supabaseUrl/auth/v1/token?grant_type=password") {
            header("apikey", supabaseAnonKey)
            contentType(ContentType.Application.Json)
            setBody(mapOf("email" to email, "password" to password))
        }.bodyAsText()

        val tokenResp = relaxedJson.decodeFromString(AuthTokenResp.serializer(), tokenRespText)
        val jwt = tokenResp.accessToken ?: error("Auth failed: ${tokenRespText}")
        val refresh = tokenResp.refreshToken ?: error("Auth failed: no refresh_token returned")
        val expiresAtMillis = System.currentTimeMillis() + ((tokenResp.expiresInSec ?: 3600L) - 30L) * 1000L

        // Decode JWT payload to extract sub/userId and email for admin gating
        data class JwtBits(val sub: String?, val email: String?)
        fun decodeJwt(jwt: String): JwtBits {
            return try {
                val parts = jwt.split('.')
                if (parts.size < 2) return JwtBits(null, null)
                val payload = parts[1]
                val decoded = android.util.Base64.decode(
                    payload,
                    android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP
                )
                val json = String(decoded, Charsets.UTF_8)
                // naive extraction of "sub" and "email"
                fun extract(key: String): String? {
                    val k = "\"$key\":"
                    val idx = json.indexOf(k)
                    if (idx < 0) return null
                    val start = json.indexOf('"', idx + k.length)
                    val end = json.indexOf('"', start + 1)
                    return if (start >= 0 && end > start) json.substring(start + 1, end) else null
                }
                JwtBits(extract("sub"), extract("email"))
            } catch (_: Throwable) { JwtBits(null, null) }
        }
        val jwtBits = decodeJwt(jwt)
        val userId = jwtBits.sub
        val userEmail = jwtBits.email ?: email // fallback to typed email
        val isAdmin = run {
            val configuredEmail = BuildConfig.ADMIN_EMAIL.takeIf { it.isNotBlank() }?.lowercase()
            val configuredUuid = BuildConfig.ADMIN_UUID.takeIf { it.isNotBlank() }
            val emailMatch = configuredEmail != null && userEmail.lowercase() == configuredEmail
            val uuidMatch = configuredUuid != null && userId == configuredUuid
            emailMatch || uuidMatch
        }

    // 2) Ask DB who this user maps to (outlet)
        @Serializable
    data class WhoAmI(@SerialName("outlet_id") val outletId: String, @SerialName("outlet_name") val outletName: String)
        val whoText = http.post("$supabaseUrl/rest/v1/rpc/whoami_outlet") {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody("{}")
        }.bodyAsText()

        // Decode array RPC response; if an error object comes back, surface it nicely
        val whoList = run {
            val t = whoText.trim()
            if (t.startsWith("{") && t.contains("\"code\"")) {
                throw IllegalStateException("whoami_outlet failed: $t")
            }
            relaxedJson.decodeFromString(ListSerializer(WhoAmI.serializer()), whoText)
        }
        val who = whoList.firstOrNull()

        // 3) Fetch DB-driven roles (admin/supervisor/outlet/transfer_manager)
        @Serializable
        data class OutletRoleInfo(
            @SerialName("outlet_id") val outletId: String? = null,
            @SerialName("outlet_name") val outletName: String? = null,
            val roles: List<String> = emptyList()
        )

        @Serializable
        data class WhoRoles(
            @SerialName("user_id") val userId: String? = null,
            val email: String? = null,
            @SerialName("is_admin") val isAdmin: Boolean = false,
            val roles: List<String> = emptyList(),
            val outlets: List<OutletRoleInfo> = emptyList(),
            @SerialName("role_catalog") val roleCatalog: List<RoleDescriptor> = emptyList()
        )
        val rolesText = http.post("$supabaseUrl/rest/v1/rpc/whoami_roles") {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody("{}")
        }.bodyAsText()
        val rolesList = run {
            val t = rolesText.trim()
            if (t.startsWith("{") && t.contains("\"code\"")) {
                throw IllegalStateException("whoami_roles failed: $t")
            }
            relaxedJson.decodeFromString(ListSerializer(WhoRoles.serializer()), rolesText)
        }
        val whoRoles = rolesList.firstOrNull()
        val roleDescriptors = when {
            whoRoles?.roleCatalog?.isNotEmpty() == true -> whoRoles.roleCatalog
            else -> (whoRoles?.roles ?: emptyList()).map { RoleDescriptor(slug = it) }
        }

        // Effective admin: BuildConfig gate OR DB role
        val hasWarehouseAdminRole = roleDescriptors.any { RoleGuards.WarehouseAdmin.matches(it) } || isAdmin || (whoRoles?.isAdmin == true)
        val hasTransferRole = roleDescriptors.any { RoleGuards.Transfers.matches(it) } || hasWarehouseAdminRole
        val hasSupervisorRole = roleDescriptors.any { RoleGuards.Supervisor.matches(it) } || hasWarehouseAdminRole
        val canTransfer = hasTransferRole
        val isTransferManager = roleDescriptors.any { RoleGuards.Transfers.matches(it) } || hasWarehouseAdminRole
        val isAdminEff = hasWarehouseAdminRole
        val isSupervisor = hasSupervisorRole

        // 4) Return the same shape the app expects
        @Serializable
        data class LoginPack(
            val token: String,
            @SerialName("refresh_token") val refreshToken: String,
            @SerialName("expires_at") val expiresAtMillis: Long,
            @SerialName("outlet_id") val outletId: String,
            @SerialName("outlet_name") val outletName: String,
            @SerialName("user_id") val userId: String? = null,
            val email: String? = null,
            @SerialName("is_admin") val isAdmin: Boolean = false,
            @SerialName("can_transfer") val canTransfer: Boolean = false,
            @SerialName("is_transfer_manager") val isTransferManager: Boolean = false,
            @SerialName("is_supervisor") val isSupervisor: Boolean = false,
            val roles: List<RoleDescriptor> = emptyList()
        )
        return relaxedJsonWithDefaults.encodeToString(
            LoginPack.serializer(),
            if (who != null) {
                LoginPack(jwt, refresh, expiresAtMillis, who.outletId, who.outletName, userId, userEmail, isAdminEff, canTransfer, isTransferManager, isSupervisor, roleDescriptors)
            } else if (isAdminEff || canTransfer) {
                // Allow admin and transfer managers to sign in without an outlet mapping; outlet-specific actions should request context in UI
                LoginPack(jwt, refresh, expiresAtMillis, "", "", userId, userEmail, isAdminEff, canTransfer, isTransferManager, isSupervisor, roleDescriptors)
            } else {
                error("No outlet mapping found for this user. Please link their auth user to an outlet (outlets.auth_user_id) or assign them a role surfaced by whoami_roles.")
            }
        )
    }

    /** Refresh an access token via refresh_token */
    suspend fun refreshAccessToken(refreshToken: String): Pair<String, Long> {
        @Serializable
        data class RefreshResp(
            @SerialName("access_token") val accessToken: String? = null,
            @SerialName("expires_in") val expiresInSec: Long? = null
        )
        val text = http.post("$supabaseUrl/auth/v1/token?grant_type=refresh_token") {
            header("apikey", supabaseAnonKey)
            contentType(ContentType.Application.Json)
            setBody(mapOf("refresh_token" to refreshToken))
        }.bodyAsText()
        val parsed = relaxedJson.decodeFromString(RefreshResp.serializer(), text)
        val newJwt = parsed.accessToken ?: error("No access_token in refresh response")
        val expiresAtMillis = System.currentTimeMillis() + ((parsed.expiresInSec ?: 3600L) - 30L) * 1000L
        return newJwt to expiresAtMillis
    }

    suspend fun getWithJwt(pathAndQuery: String, jwt: String): String {
        val url = if (pathAndQuery.startsWith("http")) pathAndQuery else "$supabaseUrl$pathAndQuery"
        val resp = http.get(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val code = resp.status.value
        val body = runCatching { resp.bodyAsText() }.getOrNull() ?: ""
        if (code !in 200..299) {
            throw IllegalStateException("GET failed: HTTP $code $body")
        }
        return body
    }

    suspend fun postWithJwt(pathAndQuery: String, jwt: String, bodyObj: Any, prefer: List<String> = emptyList()): Pair<Int, String?> {
        val url = if (pathAndQuery.startsWith("http")) pathAndQuery else "$supabaseUrl$pathAndQuery"
        val resp = http.post(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            if (prefer.isNotEmpty()) headers { prefer.forEach { append("Prefer", it) } }
            contentType(ContentType.Application.Json)
            setBody(bodyObj)
        }
        val code = resp.status.value
        val text = runCatching { resp.bodyAsText() }.getOrNull()
        return code to text
    }

    suspend fun patchWithJwt(pathAndQuery: String, jwt: String, bodyObj: Any, prefer: List<String> = emptyList()): Pair<Int, String?> {
        val url = if (pathAndQuery.startsWith("http")) pathAndQuery else "$supabaseUrl$pathAndQuery"
        val resp = http.patch(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            if (prefer.isNotEmpty()) headers { prefer.forEach { append("Prefer", it) } }
            contentType(ContentType.Application.Json)
            setBody(bodyObj)
        }
        val code = resp.status.value
        val text = runCatching { resp.bodyAsText() }.getOrNull()
        return code to text
    }

    // Server-side order number generation via RPC (requires outlet id)
    suspend fun rpcNextOrderNumber(jwt: String, outletId: String): String {
        val endpoint = "$supabaseUrl/rest/v1/rpc/next_order_number"
        val response = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(mapOf("p_outlet_id" to outletId))
        }
        return response.bodyAsText().trim('"') // RPC returns a JSON string
    }

    // Place order RPC types and call
    @Serializable
    data class PlaceOrderItem(
        @SerialName("product_id") val productId: String? = null,
        // Support both legacy variation_id and new variation_key; backend can read either.
        @SerialName("variation_id") val variationId: String? = null,
        @SerialName("variation_key") val variantKey: String? = null,
        val name: String,
        @SerialName("receiving_uom")
        @JsonNames("uom")
        val receivingUom: String = "each",
        @SerialName("consumption_uom")
        val consumptionUom: String = "each",
        val cost: Double,
        val qty: Double,
        @SerialName("qty_cases") val qtyCases: Double? = null,
        @SerialName("warehouse_id") val warehouseId: String? = null,
        @Transient val packageContains: Double = 1.0
    )

    @Serializable
    data class PlaceOrderResult(
        @SerialName("order_id") val orderId: String,
        @SerialName("order_number") val orderNumber: String,
        @SerialName("created_at") val createdAt: String
    )

    @Serializable
    data class PlaceOrderRequest(
        @SerialName("p_outlet_id") val outletId: String,
        @SerialName("p_items") val items: List<PlaceOrderItem>,
        @SerialName("p_employee_name") val employeeName: String,
        @SerialName("p_signature_path") val signaturePath: String? = null,
        @SerialName("p_pdf_path") val pdfPath: String? = null
    )

    suspend fun rpcPlaceOrder(
        jwt: String,
        outletId: String,
        items: List<PlaceOrderItem>,
        employeeName: String,
        signaturePath: String? = null,
        pdfPath: String? = null
    ): PlaceOrderResult {
        val endpoint = "$supabaseUrl/rest/v1/rpc/place_order"
        val response = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(
                PlaceOrderRequest(
                    outletId = outletId,
                    items = items,
                    employeeName = employeeName,
                    signaturePath = signaturePath,
                    pdfPath = pdfPath
                )
            )
        }
        val text = response.bodyAsText()
        // RPC returning table comes back as a JSON array with one row
        val parsed = relaxedJson.decodeFromString(ListSerializer(PlaceOrderResult.serializer()), text)
        return parsed.first()
    }

    suspend fun supervisorApproveOrder(
        jwt: String,
        orderId: String,
        supervisorName: String?,
        signaturePath: String?,
        pdfPath: String?
    ) {
        val endpoint = "$supabaseUrl/rest/v1/rpc/supervisor_approve_order"
        val body = mapOf(
            "p_order_id" to orderId,
            "p_supervisor_name" to supervisorName,
            "p_signature_path" to signaturePath,
            "p_pdf_path" to pdfPath
        )
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        if (code !in 200..299) {
            val txt = runCatching { resp.bodyAsText() }.getOrNull()
            throw IllegalStateException("supervisor_approve_order failed: HTTP $code ${txt ?: ""}")
        }
    }

    suspend fun markOrderLoaded(
        jwt: String,
        orderId: String,
        driverName: String,
        signaturePath: String?,
        pdfPath: String?
    ) {
        val endpoint = "$supabaseUrl/rest/v1/rpc/mark_order_loaded"
        val body = mapOf(
            "p_order_id" to orderId,
            "p_driver_name" to driverName,
            "p_signature_path" to signaturePath,
            "p_pdf_path" to pdfPath
        )
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        if (code !in 200..299) {
            val txt = runCatching { resp.bodyAsText() }.getOrNull()
            throw IllegalStateException("mark_order_loaded failed: HTTP $code ${txt ?: ""}")
        }
    }

    suspend fun markOrderOffloaded(
        jwt: String,
        orderId: String,
        offloaderName: String,
        signaturePath: String?,
        pdfPath: String?
    ) {
        val endpoint = "$supabaseUrl/rest/v1/rpc/mark_order_offloaded"
        val body = mapOf(
            "p_order_id" to orderId,
            "p_offloader_name" to offloaderName,
            "p_signature_path" to signaturePath,
            "p_pdf_path" to pdfPath
        )
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        if (code !in 200..299) {
            val txt = runCatching { resp.bodyAsText() }.getOrNull()
            throw IllegalStateException("mark_order_offloaded failed: HTTP $code ${txt ?: ""}")
        }
    }

    suspend fun markOrderDelivered(
        jwt: String,
        orderId: String,
        recipientName: String,
        signaturePath: String?,
        pdfPath: String?
    ) {
        markOrderOffloaded(
            jwt = jwt,
            orderId = orderId,
            offloaderName = recipientName,
            signaturePath = signaturePath,
            pdfPath = pdfPath
        )
    }

    // Approve, lock, and allocate an order from warehouse group (coldrooms) to outlet
    suspend fun approveLockAndAllocateOrder(
        jwt: String,
        orderId: String,
        strict: Boolean = true
    ) {
        val endpoint = "$supabaseUrl/rest/v1/rpc/approve_lock_and_allocate_order"
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "p_order_id" to orderId,
                "p_strict" to strict
            ))
        }
        val status = resp.status.value
        if (status !in 200..299) {
            val body = runCatching { resp.bodyAsText() }.getOrNull()
            throw IllegalStateException("approve_lock_and_allocate_order failed: HTTP $status ${body ?: ""}")
        }
    }

    // --- Warehouses and Outlets Admin APIs ---
    @Serializable
    data class Warehouse(
        val id: String,
        @SerialName("outlet_id") val outletId: String? = null,
        val name: String,
        val active: Boolean = true,
        @SerialName("parent_warehouse_id") val parentWarehouseId: String? = null
    )

    @Serializable
    data class Outlet(
        val id: String,
        val name: String
    )

    @Serializable
    data class StockMovementReferenceName(
        val name: String? = null,
        val uom: String? = null,
        val sku: String? = null,
        val cost: Double? = null
    )

    @Serializable
    data class TransferWarehouseRef(
        val id: String? = null,
        val name: String? = null
    )

    @Serializable
    data class WarehouseTransferItem(
        val id: String,
        @SerialName("movement_id") val movementId: String,
        @SerialName("product_id") val productId: String,
        @SerialName("variant_key") val variantKey: String? = null,
        val qty: Double = 0.0,
        val product: StockMovementReferenceName? = null
    )

    @Serializable
    data class WarehouseTransferDto(
        val id: String,
        val status: String,
        val note: String? = null,
        @SerialName("source_location_id") val sourceWarehouseId: String,
        @SerialName("dest_location_id") val destWarehouseId: String,
        @SerialName("created_at") val createdAt: String,
        @SerialName("completed_at") val completedAt: String? = null,
        @SerialName("source") val sourceWarehouse: TransferWarehouseRef? = null,
        @SerialName("dest") val destWarehouse: TransferWarehouseRef? = null,
        val items: List<WarehouseTransferItem> = emptyList()
    )

    @Serializable
    data class PackConsumptionRow(
        val id: String,
        @SerialName("order_id") val orderId: String,
        @SerialName("order_number") val orderNumber: String,
        @SerialName("outlet_id") val outletId: String,
        @SerialName("outlet_name") val outletName: String,
        @SerialName("warehouse_id") val warehouseId: String,
        @SerialName("warehouse_name") val warehouseName: String,
        @SerialName("product_id") val productId: String,
        @SerialName("product_name") val productName: String,
        @SerialName("variant_key") val variantKey: String? = null,
        @SerialName("variant_name") val variantName: String? = null,
        @SerialName("pack_label") val packLabel: String,
        @SerialName("packs_ordered") val packsOrdered: Double,
        @SerialName("units_per_pack") val unitsPerPack: Double,
        @SerialName("units_total") val unitsTotal: Double,
        @SerialName("created_at") val createdAt: String,
        val status: String
    )

    @Serializable
    data class StocktakeResult(
        val id: String,
        @SerialName("warehouse_id") val warehouseId: String,
        @SerialName("product_id") val productId: String,
        @SerialName("variant_key") val variantKey: String? = null,
        @SerialName("counted_qty") val countedQty: Double,
        val delta: Double,
        val note: String? = null,
        @SerialName("recorded_by") val recordedBy: String,
        @SerialName("recorded_at") val recordedAt: String
    )

    @Serializable
    data class PosSale(
        val id: String,
        @SerialName("outlet_id") val outletId: String,
        @SerialName("product_id") val productId: String,
        @SerialName("variant_key") val variantKey: String? = null,
        @SerialName("qty_units") val qtyUnits: Double,
        @SerialName("qty_cases") val qtyCases: Double? = null,
        @SerialName("sale_reference") val saleReference: String? = null,
        @SerialName("sale_source") val saleSource: String? = null,
        @SerialName("sold_at") val soldAt: String,
        @SerialName("recorded_at") val recordedAt: String
    )

    @Serializable
    data class OutletStockPeriod(
        val id: String,
        @SerialName("outlet_id") val outletId: String,
        @SerialName("period_start") val periodStart: String,
        @SerialName("period_end") val periodEnd: String? = null,
        val status: String,
        @SerialName("created_at") val createdAt: String,
        @SerialName("closed_at") val closedAt: String? = null
    )

    @Serializable
    data class OutletStockBalance(
        val id: String,
        @SerialName("period_id") val periodId: String,
        @SerialName("product_id") val productId: String,
        @SerialName("variant_key") val variantKey: String? = null,
        @SerialName("opening_qty") val openingQty: Double = 0.0,
        @SerialName("ordered_qty") val orderedQty: Double = 0.0,
        @SerialName("pos_sales_qty") val posSalesQty: Double = 0.0,
        @SerialName("expected_qty") val expectedQty: Double = 0.0,
        @SerialName("actual_qty") val actualQty: Double? = null,
        @SerialName("variance_qty") val varianceQty: Double? = null,
        @SerialName("closing_qty") val closingQty: Double? = null
    )

    @Serializable
    data class OutletStocktake(
        val id: String,
        @SerialName("outlet_id") val outletId: String,
        @SerialName("period_id") val periodId: String? = null,
        @SerialName("product_id") val productId: String,
        @SerialName("variant_key") val variantKey: String? = null,
        @SerialName("counted_qty") val countedQty: Double,
        @SerialName("snapshot_kind") val snapshotKind: String,
        val note: String? = null,
        @SerialName("recorded_at") val recordedAt: String
    )

    @Serializable
    data class SimpleProduct(
        val id: String,
        val name: String,
        @SerialName("purchase_pack_unit") val uom: String,
        @SerialName("consumption_uom") val consumptionUom: String = "each",
        val sku: String? = null,
        @SerialName("has_variations") val hasVariations: Boolean = false,
        @SerialName("units_per_purchase_pack") val packageContains: Double? = null,
        @SerialName("outlet_order_visible") val outletOrderVisible: Boolean = true
    )

    @Serializable
    data class SimpleVariation(
        val id: String,
        @SerialName("item_id") val productId: String,
        val name: String,
        @SerialName("purchase_pack_unit") val uom: String,
        @SerialName("consumption_uom") val consumptionUom: String = "each",
        val cost: Double? = null,
        @SerialName("units_per_purchase_pack") val packageContains: Double? = null,
        val sku: String? = null,
        @SerialName("outlet_order_visible") val outletOrderVisible: Boolean = true
    )

    @Serializable
    private data class VariantJson(
        val key: String? = null,
        val name: String = "",
        val sku: String? = null,
        val cost: Double? = null,
        @SerialName("outlet_order_visible") val outletOrderVisible: Boolean = true,
        @SerialName("purchase_pack_unit") val uom: String? = null,
        @SerialName("consumption_uom") val consumptionUom: String? = null,
        @SerialName("units_per_purchase_pack") val packageContains: Double? = null
    )

    @Serializable
    private data class CatalogItemVariantsDto(
        val id: String,
        val variants: List<VariantJson> = emptyList()
    )

    @Serializable
    data class WarehouseStockRowDto(
        @SerialName("warehouse_id") val warehouseId: String,
        @SerialName("warehouse_name") val warehouseName: String,
        @SerialName("product_id") val productId: String,
        @SerialName("product_name") val productName: String,
        @SerialName("variant_key") val variantKey: String? = null,
        @SerialName("variant_name") val variantName: String? = null,
        val qty: Double = 0.0
    )

    @Serializable
    data class WarehouseStockAggregateWarehouse(
        @SerialName("warehouseId") val warehouseId: String,
        @SerialName("warehouseName") val warehouseName: String,
        val qty: Double = 0.0
    )

    @Serializable
    data class WarehouseStockAggregateRow(
        @SerialName("productId") val productId: String,
        @SerialName("productName") val productName: String,
        @SerialName("variationId") val variationId: String? = null,
        @SerialName("variationName") val variationName: String? = null,
        @SerialName("totalQty") val totalQty: Double = 0.0,
        val warehouses: List<WarehouseStockAggregateWarehouse> = emptyList()
    )

    @Serializable
    data class WarehouseStockResponse(
        val rows: List<WarehouseStockRowDto> = emptyList(),
        val aggregates: List<WarehouseStockAggregateRow> = emptyList(),
        @SerialName("warehouseCount") val warehouseCount: Int = 0
    )

    @Serializable
    data class StockNameLabel(@SerialName("name") val name: String? = null)

    @Serializable
    data class StocktakeLogRow(
        val id: String,
        @SerialName("warehouse_id") val warehouseId: String,
        @SerialName("product_id") val productId: String,
        @SerialName("variation_id") val variationId: String? = null,
        @SerialName("counted_qty") val countedQty: Double,
        val delta: Double,
        val note: String? = null,
        @SerialName("recorded_by") val recordedBy: String,
        @SerialName("recorded_at") val recordedAt: String,
        val product: StockNameLabel? = null,
        val variation: StockNameLabel? = null
    )

    enum class StockEntryKind(val apiValue: String, val label: String) {
        INITIAL("initial", "Initial Stock"),
        PURCHASE("purchase", "Purchase Stock"),
        CLOSING("closing", "Closing Stock");

        companion object {
            fun fromApi(value: String?): StockEntryKind? = values().firstOrNull { it.apiValue.equals(value, ignoreCase = true) }
        }
    }

    @Serializable
    data class StockEntryRow(
        val id: String,
        @SerialName("warehouse_id") val warehouseId: String,
        @SerialName("product_id") val productId: String,
        @SerialName("variation_id") val variationId: String? = null,
        @SerialName("entry_kind") val entryKind: String,
        val qty: Double,
        val note: String? = null,
        @SerialName("recorded_by") val recordedBy: String,
        @SerialName("recorded_at") val recordedAt: String,
        val product: StockNameLabel? = null,
        val variation: StockNameLabel? = null,
        val warehouse: StockNameLabel? = null
    )

    @Serializable
    data class StockEntryReportRow(
        @SerialName("warehouse_id") val warehouseId: String,
        @SerialName("warehouse_name") val warehouseName: String,
        @SerialName("product_id") val productId: String,
        @SerialName("product_name") val productName: String,
        @SerialName("variation_id") val variationId: String? = null,
        @SerialName("variation_name") val variationName: String? = null,
        @SerialName("initial_qty") val initialQty: Double = 0.0,
        @SerialName("purchase_qty") val purchaseQty: Double = 0.0,
        @SerialName("closing_qty") val closingQty: Double = 0.0,
        @SerialName("current_stock") val currentStock: Double = 0.0
    )

    suspend fun listOutlets(jwt: String): List<Outlet> {
        val url = "$supabaseUrl/rest/v1/outlets?select=id,name&order=name.asc"
        val resp = http.get(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("listOutlets failed: HTTP $code $txt")
        return relaxedJson.decodeFromString(ListSerializer(Outlet.serializer()), txt)
    }

    suspend fun listWarehouses(jwt: String): List<Warehouse> {
        // Schema does not expose outlet_id on warehouses; return core fields only.
        val url = "$supabaseUrl/rest/v1/warehouses?select=id,name,active,parent_warehouse_id,kind,stock_layer&order=name.asc"
        val resp = http.get(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("listWarehouses failed: HTTP $code $txt")
        return relaxedJson.decodeFromString(ListSerializer(Warehouse.serializer()), txt)
    }

    suspend fun fetchWarehousesByIds(jwt: String, ids: Collection<String>): List<Warehouse> {
        val unique = ids.mapNotNull { it?.trim() }.filter { it.isNotEmpty() }.distinct()
        if (unique.isEmpty()) return emptyList()
        val filter = "(${unique.joinToString(",")})"
        val encoded = java.net.URLEncoder.encode(filter, Charsets.UTF_8.name())
        val url = "$supabaseUrl/rest/v1/warehouses?select=id,name,active,parent_warehouse_id&id=in.$encoded"
        val resp = http.get(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) {
            throw IllegalStateException("fetchWarehousesByIds failed: HTTP $code $txt")
        }
        return relaxedJson.decodeFromString(ListSerializer(Warehouse.serializer()), txt)
    }

    suspend fun fetchWarehouseTransfers(
        jwt: String,
        sourceWarehouseId: String? = null,
        destWarehouseId: String? = null,
        createdAfterIso: String? = null,
        createdBeforeIso: String? = null,
        limit: Int = 50
    ): List<WarehouseTransferDto> {
        val urlBuilder = StringBuilder()
        urlBuilder.append("$supabaseUrl/rest/v1/stock_movements")
        urlBuilder.append("?select=")
        urlBuilder.append(
            "id,status,note,created_at,completed_at,source_location_id,dest_location_id," +
                "items:stock_movement_items(id,movement_id,product_id,variant_key,qty," +
                "product:catalog_items!stock_movement_items_product_id_fkey(name,uom,sku,cost))"
        )
        urlBuilder.append("&source_location_type=eq.warehouse&dest_location_type=eq.warehouse")
        sourceWarehouseId?.takeIf { it.isNotBlank() }?.let {
            urlBuilder.append("&source_location_id=eq.").append(it)
        }
        destWarehouseId?.takeIf { it.isNotBlank() }?.let {
            urlBuilder.append("&dest_location_id=eq.").append(it)
        }
        createdAfterIso?.takeIf { it.isNotBlank() }?.let {
            val encoded = java.net.URLEncoder.encode(it, "UTF-8")
            urlBuilder.append("&created_at=gte.").append(encoded)
        }
        createdBeforeIso?.takeIf { it.isNotBlank() }?.let {
            val encoded = java.net.URLEncoder.encode(it, "UTF-8")
            urlBuilder.append("&created_at=lte.").append(encoded)
        }
        urlBuilder.append("&order=created_at.desc")
        urlBuilder.append("&limit=").append(limit.coerceAtMost(500))
        val resp = http.get(urlBuilder.toString()) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) {
            throw IllegalStateException("fetchWarehouseTransfers failed: HTTP $code $txt")
        }

        val baseTransfers = relaxedJson
            .decodeFromString(ListSerializer(WarehouseTransferDto.serializer()), txt)
        if (baseTransfers.isEmpty()) return baseTransfers

        val idsNeeded = buildSet {
            baseTransfers.forEach { transfer ->
                if (transfer.sourceWarehouse?.name.isNullOrBlank()) {
                    transfer.sourceWarehouseId?.let { add(it) }
                }
                if (transfer.destWarehouse?.name.isNullOrBlank()) {
                    transfer.destWarehouseId?.let { add(it) }
                }
            }
        }
        val warehousesById = if (idsNeeded.isEmpty()) {
            emptyMap()
        } else {
            runCatching { fetchWarehousesByIds(jwt, idsNeeded) }
                .getOrElse { emptyList() }
                .associate { warehouse -> warehouse.id to warehouse.name }
        }

        return baseTransfers.map { transfer ->
            val sourceRef = transfer.sourceWarehouse ?: transfer.sourceWarehouseId?.let { id ->
                TransferWarehouseRef(id = id, name = warehousesById[id])
            }
            val destRef = transfer.destWarehouse ?: transfer.destWarehouseId?.let { id ->
                TransferWarehouseRef(id = id, name = warehousesById[id])
            }
            transfer.copy(
                sourceWarehouse = sourceRef,
                destWarehouse = destRef
            )
        }
    }

    suspend fun createWarehouse(
        jwt: String,
        outletId: String,
        name: String,
        parentWarehouseId: String? = null,
        active: Boolean = true
    ): Warehouse {
        val body = buildMap<String, Any?> {
            put("outlet_id", outletId)
            put("name", name)
            put("active", active)
            if (parentWarehouseId != null) put("parent_warehouse_id", parentWarehouseId)
        }
        val resp = http.post("$supabaseUrl/rest/v1/warehouses") {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            headers { append("Prefer", "return=representation") }
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("createWarehouse failed: HTTP $code $txt")
        val list = relaxedJson.decodeFromString(ListSerializer(Warehouse.serializer()), txt)
        return list.first()
    }

    suspend fun updateWarehouseParent(
        jwt: String,
        warehouseId: String,
        parentWarehouseId: String?
    ) {
        // Use upsert with on_conflict=id to merge only provided fields
        val body = mapOf(
            "id" to warehouseId,
            "parent_warehouse_id" to parentWarehouseId
        )
        val resp = http.post("$supabaseUrl/rest/v1/warehouses?on_conflict=id") {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            headers {
                append("Prefer", "resolution=merge-duplicates")
                append("Prefer", "return=minimal")
            }
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        if (code !in 200..299) {
            val txt = runCatching { resp.bodyAsText() }.getOrNull()
            throw IllegalStateException("updateWarehouseParent failed: HTTP $code ${txt ?: ""}")
        }
    }

    suspend fun setPrimaryWarehouseForOutlet(
        jwt: String,
        outletId: String,
        warehouseId: String
    ) {
        val body = mapOf(
            "outlet_id" to outletId,
            "warehouse_id" to warehouseId
        )
        val url = "$supabaseUrl/rest/v1/outlet_primary_warehouse"
        // upsert on outlet_id primary key
        val resp = http.post(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            headers {
                append("Prefer", "resolution=merge-duplicates")
                append("Prefer", "return=minimal")
            }
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        if (code !in 200..299) {
            val txt = runCatching { resp.bodyAsText() }.getOrNull()
            throw IllegalStateException("setPrimaryWarehouseForOutlet failed: HTTP $code ${txt ?: ""}")
        }
    }

    suspend fun setWarehouseActive(
        jwt: String,
        warehouseId: String,
        active: Boolean
    ) {
        val body = mapOf(
            "id" to warehouseId,
            "active" to active
        )
        val resp = http.post("$supabaseUrl/rest/v1/warehouses?on_conflict=id") {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            headers {
                append("Prefer", "resolution=merge-duplicates")
                append("Prefer", "return=minimal")
            }
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        if (code !in 200..299) {
            val txt = runCatching { resp.bodyAsText() }.getOrNull()
            throw IllegalStateException("setWarehouseActive failed: HTTP $code ${txt ?: ""}")
        }
    }

    suspend fun listActiveProducts(jwt: String): List<SimpleProduct> {
        val url = "$supabaseUrl/rest/v1/catalog_items?active=eq.true&outlet_order_visible=eq.true&select=id,name,purchase_pack_unit,consumption_uom,sku,has_variations,units_per_purchase_pack,outlet_order_visible&order=name.asc"
        val resp = http.get(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val txt = resp.bodyAsText()
        return relaxedJson.decodeFromString(ListSerializer(SimpleProduct.serializer()), txt)
    }

    suspend fun listVariationsForProduct(jwt: String, productId: String): List<SimpleVariation> {
        val url = "$supabaseUrl/rest/v1/catalog_items?id=eq.$productId&select=id,variants&limit=1"
        val resp = http.get(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val txt = resp.bodyAsText()
        val items = relaxedJson
            .decodeFromString(ListSerializer(CatalogItemVariantsDto.serializer()), txt)
        val item = items.firstOrNull() ?: return emptyList()
        return item.variants.mapNotNull { toSimpleVariation(productId, it) }
    }

    suspend fun listAllVariations(jwt: String): List<SimpleVariation> {
        val url = "$supabaseUrl/rest/v1/catalog_items?select=id,variants&order=name.asc"
        val resp = http.get(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val txt = resp.bodyAsText()
        val items = relaxedJson
            .decodeFromString(ListSerializer(CatalogItemVariantsDto.serializer()), txt)
        return items.flatMap { item ->
            item.variants.mapNotNull { variant -> toSimpleVariation(item.id, variant) }
        }
    }

    private fun toSimpleVariation(productId: String, variant: VariantJson): SimpleVariation? {
        val key = variant.key?.trim().takeUnless { it.isNullOrEmpty() } ?: return null
        if (!variant.outletOrderVisible) return null
        val uom = variant.uom ?: "unit"
        val consumption = variant.consumptionUom ?: variant.uom ?: "each"
        val name = variant.name.ifBlank { "Base" }
        return SimpleVariation(
            id = key,
            productId = productId,
            name = name,
            uom = uom,
            consumptionUom = consumption,
            cost = variant.cost,
            packageContains = variant.packageContains,
            sku = variant.sku,
            outletOrderVisible = variant.outletOrderVisible
        )
    }

    suspend fun fetchWarehouseStock(jwt: String, warehouseId: String, search: String? = null): WarehouseStockResponse {
        val payload = mutableMapOf<String, Any>("warehouseId" to warehouseId)
        val trimmedSearch = search?.trim().orEmpty()
        if (trimmedSearch.isNotEmpty()) {
            payload["search"] = trimmedSearch
        }
        val resp = http.post("$supabaseUrl/functions/v1/stock") {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(payload)
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) {
            throw IllegalStateException("stock function failed: HTTP $code $txt")
        }
        return relaxedJson.decodeFromString(WarehouseStockResponse.serializer(), txt)
    }

    suspend fun fetchStocktakeLog(jwt: String, warehouseId: String?, limit: Int = 200): List<StocktakeLogRow> {
        val urlBuilder = StringBuilder()
        urlBuilder.append("$supabaseUrl/rest/v1/warehouse_stocktakes")
        urlBuilder.append("?select=id,warehouse_id,product_id,variant_key,counted_qty,delta,note,recorded_by,recorded_at,product:catalog_items(name)")
        urlBuilder.append("&order=recorded_at.desc")
        urlBuilder.append("&limit=").append(limit.coerceAtMost(500))
        warehouseId?.let { urlBuilder.append("&warehouse_id=eq.").append(it) }
        val resp = http.get(urlBuilder.toString()) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) {
            throw IllegalStateException("stocktake log failed: HTTP $code $txt")
        }
        return relaxedJson.decodeFromString(ListSerializer(StocktakeLogRow.serializer()), txt)
    }

    suspend fun fetchStockEntries(
        jwt: String,
        warehouseId: String?,
        entryKind: StockEntryKind?,
        limit: Int = 200
    ): List<StockEntryRow> {
        val urlBuilder = StringBuilder()
        urlBuilder.append("$supabaseUrl/rest/v1/warehouse_stock_entries")
        urlBuilder.append("?select=id,warehouse_id,product_id,variant_key,entry_kind,qty,note,recorded_by,recorded_at,product:catalog_items(name),warehouse:warehouses(name)")
        urlBuilder.append("&order=recorded_at.desc")
        urlBuilder.append("&limit=").append(limit.coerceAtMost(500))
        warehouseId?.let { urlBuilder.append("&warehouse_id=eq.").append(it) }
        entryKind?.let { urlBuilder.append("&entry_kind=eq.").append(it.apiValue) }
        val resp = http.get(urlBuilder.toString()) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) {
            throw IllegalStateException("stock entry log failed: HTTP $code $txt")
        }
        return relaxedJson.decodeFromString(ListSerializer(StockEntryRow.serializer()), txt)
    }

    suspend fun recordStockEntry(
        jwt: String,
        warehouseId: String,
        productId: String,
        variantKey: String?,
        entryKind: StockEntryKind,
        units: Double,
        note: String?
    ): StockEntryRow {
        val endpoint = "$supabaseUrl/rest/v1/rpc/record_stock_entry"
        val body = mutableMapOf<String, Any?>(
            "p_warehouse_id" to warehouseId,
            "p_product_id" to productId,
            "p_entry_kind" to entryKind.apiValue,
            "p_units" to units
        )
        variantKey?.let { body["p_variant_key"] = it }
        note?.takeIf { it.isNotBlank() }?.let { body["p_note"] = it }
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("record_stock_entry failed: HTTP $code $txt")
        val parsed = relaxedJson.decodeFromString(ListSerializer(StockEntryRow.serializer()), txt)
        return parsed.first()
    }

    suspend fun fetchStockEntryReport(
        jwt: String,
        search: String?,
        warehouseId: String?,
        productId: String?,
        variantKey: String?
    ): List<StockEntryReportRow> {
        val endpoint = "$supabaseUrl/rest/v1/rpc/report_stock_entry_balances"
        val payload = mutableMapOf<String, Any?>()
        search?.takeIf { it.isNotBlank() }?.let { payload["p_search"] = it }
        warehouseId?.let { payload["p_warehouse_id"] = it }
        productId?.let { payload["p_product_id"] = it }
        variantKey?.let { payload["p_variant_key"] = it }
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(payload)
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("report_stock_entry_balances failed: HTTP $code $txt")
        return relaxedJson.decodeFromString(ListSerializer(StockEntryReportRow.serializer()), txt)
    }

    suspend fun reportPackConsumption(
        jwt: String,
        fromIso: String? = null,
        toIso: String? = null,
        outletId: String? = null,
        warehouseId: String? = null
    ): List<PackConsumptionRow> {
        val endpoint = "$supabaseUrl/rest/v1/rpc/report_pack_consumption"
        val body = mutableMapOf<String, Any?>()
        fromIso?.let { body["p_from"] = it }
        toIso?.let { body["p_to"] = it }
        outletId?.let { body["p_location"] = it }
        warehouseId?.let { body["p_warehouse"] = it }
        val payload: Map<String, Any?> = if (body.isEmpty()) emptyMap() else body
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(payload)
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("report_pack_consumption failed: HTTP $code $txt")
        return relaxedJson.decodeFromString(ListSerializer(PackConsumptionRow.serializer()), txt)
    }

    suspend fun recordStocktake(
        jwt: String,
        warehouseId: String,
        productId: String,
        variantKey: String?,
        countedQty: Double,
        note: String?
    ): StocktakeResult {
        val endpoint = "$supabaseUrl/rest/v1/rpc/record_stocktake"
        val body = mutableMapOf<String, Any?>(
            "p_warehouse_id" to warehouseId,
            "p_product_id" to productId,
            "p_counted_qty" to countedQty
        )
        variantKey?.let { body["p_variant_key"] = it }
        note?.takeIf { it.isNotBlank() }?.let { body["p_note"] = it }
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("record_stocktake failed: HTTP $code $txt")
        return relaxedJson.decodeFromString(StocktakeResult.serializer(), txt)
    }

    suspend fun recordPosSale(
        jwt: String,
        outletId: String,
        productId: String,
        qty: Double,
        variantKey: String? = null,
        saleReference: String? = null,
        saleSource: String? = null,
        qtyInputMode: String = "auto",
        soldAtIso: String? = null
    ): PosSale {
        val endpoint = "$supabaseUrl/rest/v1/rpc/record_pos_sale"
        val body = mutableMapOf<String, Any?>(
            "p_outlet_id" to outletId,
            "p_product_id" to productId,
            "p_qty" to qty,
            "p_qty_input_mode" to qtyInputMode.lowercase()
        )
        variantKey?.let { body["p_variant_key"] = it }
        saleReference?.takeIf { it.isNotBlank() }?.let { body["p_sale_reference"] = it }
        saleSource?.takeIf { it.isNotBlank() }?.let { body["p_sale_source"] = it }
        soldAtIso?.takeIf { it.isNotBlank() }?.let { body["p_sold_at"] = it }
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("record_pos_sale failed: HTTP $code $txt")
        val parsed = relaxedJson.decodeFromString(ListSerializer(PosSale.serializer()), txt)
        return parsed.first()
    }

    suspend fun listOutletStockPeriods(
        jwt: String,
        outletId: String,
        limit: Int = 50
    ): List<OutletStockPeriod> {
        val url = buildString {
            append("$supabaseUrl/rest/v1/outlet_stock_periods")
            append("?select=id,outlet_id,period_start,period_end,status,created_at,closed_at")
            append("&outlet_id=eq.").append(outletId)
            append("&order=period_start.desc")
            append("&limit=").append(limit.coerceAtMost(100))
        }
        val resp = http.get(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("listOutletStockPeriods failed: HTTP $code $txt")
        return relaxedJson.decodeFromString(ListSerializer(OutletStockPeriod.serializer()), txt)
    }

    suspend fun startOutletStockPeriod(
        jwt: String,
        outletId: String,
        periodStartIso: String? = null
    ): OutletStockPeriod {
        val endpoint = "$supabaseUrl/rest/v1/rpc/start_outlet_stock_period"
        val body = mutableMapOf<String, Any?>(
            "p_outlet_id" to outletId
        )
        periodStartIso?.takeIf { it.isNotBlank() }?.let { body["p_period_start"] = it }
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("start_outlet_stock_period failed: HTTP $code $txt")
        val parsed = relaxedJson.decodeFromString(ListSerializer(OutletStockPeriod.serializer()), txt)
        return parsed.first()
    }

    suspend fun closeOutletStockPeriod(
        jwt: String,
        periodId: String,
        periodEndIso: String? = null
    ): OutletStockPeriod {
        val endpoint = "$supabaseUrl/rest/v1/rpc/close_outlet_stock_period"
        val body = mutableMapOf<String, Any?>(
            "p_period_id" to periodId
        )
        periodEndIso?.takeIf { it.isNotBlank() }?.let { body["p_period_end"] = it }
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("close_outlet_stock_period failed: HTTP $code $txt")
        val parsed = relaxedJson.decodeFromString(ListSerializer(OutletStockPeriod.serializer()), txt)
        return parsed.first()
    }

    suspend fun recordOutletStocktake(
        jwt: String,
        outletId: String,
        productId: String,
        countedQty: Double,
        variationId: String? = null,
        periodId: String? = null,
        snapshotKind: String = "spot",
        note: String? = null,
        qtyInputMode: String = "auto"
    ): OutletStocktake {
        val endpoint = "$supabaseUrl/rest/v1/rpc/record_outlet_stocktake"
        val body = mutableMapOf<String, Any?>(
            "p_outlet_id" to outletId,
            "p_product_id" to productId,
            "p_counted_qty" to countedQty,
            "p_snapshot_kind" to snapshotKind.lowercase(),
            "p_qty_input_mode" to qtyInputMode.lowercase()
        )
        variationId?.let { body["p_variation_id"] = it }
        periodId?.let { body["p_period_id"] = it }
        note?.takeIf { it.isNotBlank() }?.let { body["p_note"] = it }
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("record_outlet_stocktake failed: HTTP $code $txt")
        val parsed = relaxedJson.decodeFromString(ListSerializer(OutletStocktake.serializer()), txt)
        return parsed.first()
    }

    // Upload a file to Supabase Storage
    suspend fun uploadToStorage(
        jwt: String,
        bucket: String,
        path: String,
        bytes: ByteArray,
        contentType: String = "application/octet-stream",
        upsert: Boolean = true
    ): HttpResponse {
        val url = "$supabaseUrl/storage/v1/object/$bucket/$path"
        return http.post(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            header("x-upsert", upsert.toString())
            contentType(ContentType.parse(contentType))
            setBody(bytes)
        }
    }

    fun publicStorageUrl(bucket: String, path: String, downloadName: String? = null): String {
        val base = "$supabaseUrl/storage/v1/object/public/$bucket/$path"
        return if (downloadName != null) "$base?download=${java.net.URLEncoder.encode(downloadName, "UTF-8")}" else base
    }

    suspend fun downloadBytes(url: String): ByteArray {
        val u = if (url.startsWith("http")) url else "$supabaseUrl$url"
        val resp = http.get(u)
        return resp.body()
    }

    // Create a signed URL for a private Storage object
    @Serializable
    private data class SignedUrlResp(
        @SerialName("signedURL") val signedURL: String? = null,
        @SerialName("signedUrl") val signedUrl: String? = null
    )

    suspend fun createSignedUrl(jwt: String, bucket: String, path: String, expiresInSeconds: Int = 3600, downloadName: String? = null): String {
        val endpoint = "$supabaseUrl/storage/v1/object/sign/$bucket/$path"
        val body = buildMap<String, Any> {
            put("expiresIn", expiresInSeconds)
            if (downloadName != null) put("download", downloadName)
        }
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val code = resp.status.value
        val txt = resp.bodyAsText()
        if (code !in 200..299) throw IllegalStateException("createSignedUrl failed: HTTP $code $txt")
        val parsed = relaxedJson.decodeFromString(SignedUrlResp.serializer(), txt)
        val rel = parsed.signedURL ?: parsed.signedUrl ?: throw IllegalStateException("createSignedUrl: no signed URL in response")
        return if (rel.startsWith("http")) rel else "$supabaseUrl$rel"
    }

    // Admin: reset order sequence for an outlet back to 1 (server RPC required)
    suspend fun resetOrderSequence(jwt: String, outletId: String) {
        val endpoint = "$supabaseUrl/rest/v1/rpc/reset_order_sequence"
        val resp = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(mapOf("p_outlet_id" to outletId))
        }
        val code = resp.status.value
        if (code !in 200..299) {
            val txt = runCatching { resp.bodyAsText() }.getOrNull()
            throw IllegalStateException("reset_order_sequence failed: HTTP $code ${txt ?: ""}")
        }
    }

    suspend fun orderItemsCount(jwt: String, orderId: String): Int {
        val url = "$supabaseUrl/rest/v1/order_items?order_id=eq.$orderId&select=id&limit=1"
        val resp = http.get(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            headers { append("Prefer", "count=exact") }
        }
        val contentRange = resp.headers["Content-Range"]
        if (contentRange != null && contentRange.contains('/')) {
            val total = contentRange.substringAfter('/').trim()
            return total.toIntOrNull() ?: 0
        }
        // If header missing, we can't know reliably without decoding; return 0
        return 0
    }

    suspend fun ensureOrderItemsPersisted(
        jwt: String,
        orderId: String,
        items: List<PlaceOrderItem>
    ) {
        if (items.isEmpty()) return
        val existing = runCatching { orderItemsCount(jwt, orderId) }.getOrElse { 0 }
        if (existing <= 0) {
            insertOrderItems(jwt, orderId, items)
        }
    }

    // --- Fallback direct inserts when RPC is unavailable ---
    @Serializable
    data class OrderInsertRow(
        val id: String,
        @SerialName("order_number") val orderNumber: String,
        @SerialName("created_at") val createdAt: String,
        val status: String
    )

    @Serializable
    data class OrderInsertPayload(
        @SerialName("outlet_id") val outletId: String,
        @SerialName("order_number") val orderNumber: String,
        val status: String,
        val tz: String
    )

    @Serializable
    data class OrderItemInsertPayload(
        @SerialName("order_id") val orderId: String,
        @SerialName("product_id") val productId: String?,
        @SerialName("variation_key") val variantKey: String?,
        val name: String,
        @SerialName("receiving_uom") val receivingUom: String,
        @SerialName("consumption_uom") val consumptionUom: String,
        val cost: Double,
        val qty: Double,
        @SerialName("qty_cases") val qtyCases: Double?,
        @SerialName("receiving_contains") val packageContains: Double,
        @SerialName("warehouse_id") val warehouseId: String?,
        val amount: Double
    )

    suspend fun insertOrder(
        jwt: String,
        outletId: String,
        orderNumber: String,
        tz: String,
        status: String = "placed"
    ): OrderInsertRow {
        val body = OrderInsertPayload(
            outletId = outletId,
            orderNumber = orderNumber,
            status = status,
            tz = tz
        )
        val resp = http.post("$supabaseUrl/rest/v1/orders") {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            headers { append("Prefer", "return=representation") }
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val statusCode = resp.status.value
        val text = resp.bodyAsText()
        if (statusCode !in 200..299) {
            throw IllegalStateException("orders insert failed: HTTP $statusCode $text")
        }
        val list = relaxedJson.decodeFromString(
            ListSerializer(OrderInsertRow.serializer()), text
        )
        return list.first()
    }

    suspend fun insertOrderItems(
        jwt: String,
        orderId: String,
        items: List<PlaceOrderItem>
    ) {
        val rows = items.map {
            val packageContains = it.packageContains.takeIf { size -> size > 0 } ?: 1.0
            val qtyCases = it.qtyCases ?: run {
                if (packageContains > 0) it.qty / packageContains else it.qty
            }
            val qtyUnits = qtyCases * packageContains
            OrderItemInsertPayload(
                orderId = orderId,
                productId = it.productId,
                variantKey = it.variantKey,
                name = it.name,
                receivingUom = it.receivingUom,
                consumptionUom = it.consumptionUom,
                cost = it.cost,
                qty = qtyUnits,
                qtyCases = qtyCases,
                packageContains = packageContains,
                warehouseId = it.warehouseId,
                amount = it.cost * qtyUnits
            )
        }
        val resp = http.post("$supabaseUrl/rest/v1/order_items") {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            headers { append("Prefer", "return=representation") }
            contentType(ContentType.Application.Json)
            setBody(rows)
        }
        val status = resp.status.value
        if (status !in 200..299) {
            val body = runCatching { resp.bodyAsText() }.getOrNull()
            val msg = body ?: ""
            throw IllegalStateException("order_items insert failed: HTTP $status $msg")
        }
    }

    // (Realtime support will be added later when toolchain is upgraded)
}
