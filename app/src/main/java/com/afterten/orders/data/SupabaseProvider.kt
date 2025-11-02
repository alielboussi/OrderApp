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
import io.ktor.client.request.setBody
import io.ktor.client.request.post
import io.ktor.client.request.headers
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
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

class SupabaseProvider(context: Context) {
    val supabaseUrl: String = BuildConfig.SUPABASE_URL
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
        outletId: String,
        onEvent: () -> Unit
    ): RealtimeSubscriptionHandle {
        val scope = CoroutineScope(Dispatchers.IO)
        val channel = realtimeClient.realtime.channel("orders")
        ordersChannel = channel
        currentJwt = jwt
        val job = scope.launch {
            // Provide JWT to this channel for RLS
            try { channel.updateAuth(jwt) } catch (t: Throwable) { Log.w("Realtime", "updateAuth initial failed: ${t.message}") }
            // Build a flow of changes filtered by outlet
            val flow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                table = "orders"
                filter("outlet_id", FilterOperator.EQ, outletId)
            }
            // Subscribe and start collecting
            Log.d("Realtime", "Subscribing to orders changes for outlet=$outletId")
            channel.subscribe()
            flow.collect {
                Log.d("Realtime", "orders change event received (outlet=$outletId), triggering refresh")
                onEvent()
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

    val tokenResp = Json { ignoreUnknownKeys = true }.decodeFromString(AuthTokenResp.serializer(), tokenRespText)
    val jwt = tokenResp.accessToken ?: error("Auth failed: no access_token returned")
    val refresh = tokenResp.refreshToken ?: error("Auth failed: no refresh_token returned")
    val expiresAtMillis = System.currentTimeMillis() + ((tokenResp.expiresInSec ?: 3600L) - 30L) * 1000L

        // 2) Ask DB who this user maps to (outlet)
        @Serializable
        data class WhoAmI(@SerialName("outlet_id") val outletId: String, @SerialName("outlet_name") val outletName: String)
        val whoText = http.post("$supabaseUrl/rest/v1/rpc/whoami_outlet") {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody("{}")
        }.bodyAsText()

        val who = Json { ignoreUnknownKeys = true }
            .decodeFromString(ListSerializer(WhoAmI.serializer()), whoText)
            .firstOrNull() ?: error("No outlet mapping found for this user. Insert into public.outlet_users.")

        // 3) Return the same shape the app expects
        @Serializable
        data class LoginPack(
            val token: String,
            @SerialName("refresh_token") val refreshToken: String,
            @SerialName("expires_at") val expiresAtMillis: Long,
            @SerialName("outlet_id") val outletId: String,
            @SerialName("outlet_name") val outletName: String
        )
        return Json { encodeDefaults = true }.encodeToString(
            LoginPack.serializer(),
            LoginPack(jwt, refresh, expiresAtMillis, who.outletId, who.outletName)
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
        val parsed = Json { ignoreUnknownKeys = true }.decodeFromString(RefreshResp.serializer(), text)
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
        return resp.bodyAsText()
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
        @SerialName("variation_id") val variationId: String? = null,
        val name: String,
        val uom: String,
        val cost: Double,
        val qty: Double
    )

    @Serializable
    data class PlaceOrderResult(
        @SerialName("order_id") val orderId: String,
        @SerialName("order_number") val orderNumber: String,
        @SerialName("created_at") val createdAt: String
    )

    suspend fun rpcPlaceOrder(
        jwt: String,
        outletId: String,
        items: List<PlaceOrderItem>,
        employeeName: String
    ): PlaceOrderResult {
        val endpoint = "$supabaseUrl/rest/v1/rpc/place_order"
        val response = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(
                mapOf(
                    "p_outlet_id" to outletId,
                    "p_items" to items,
                    "p_employee_name" to employeeName
                )
            )
        }
        val text = response.bodyAsText()
        // RPC returning table comes back as a JSON array with one row
        val parsed = Json { ignoreUnknownKeys = true }.decodeFromString(ListSerializer(PlaceOrderResult.serializer()), text)
        return parsed.first()
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
        @SerialName("outlet_id") val outletId: String,
        val name: String,
        val active: Boolean = true,
        @SerialName("parent_warehouse_id") val parentWarehouseId: String? = null
    )

    @Serializable
    data class Outlet(
        val id: String,
        val name: String
    )

    suspend fun listOutlets(jwt: String): List<Outlet> {
        val url = "$supabaseUrl/rest/v1/outlets?select=id,name&order=name.asc"
        val resp = http.get(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val txt = resp.bodyAsText()
        return Json { ignoreUnknownKeys = true }.decodeFromString(ListSerializer(Outlet.serializer()), txt)
    }

    suspend fun listWarehouses(jwt: String): List<Warehouse> {
        val url = "$supabaseUrl/rest/v1/warehouses?select=id,outlet_id,name,active,parent_warehouse_id&order=name.asc"
        val resp = http.get(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        val txt = resp.bodyAsText()
        return Json { ignoreUnknownKeys = true }.decodeFromString(ListSerializer(Warehouse.serializer()), txt)
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
        val list = Json { ignoreUnknownKeys = true }.decodeFromString(ListSerializer(Warehouse.serializer()), txt)
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

    // --- Fallback direct inserts when RPC is unavailable ---
    @Serializable
    data class OrderInsertRow(
        val id: String,
        @SerialName("order_number") val orderNumber: String,
        @SerialName("created_at") val createdAt: String,
        val status: String
    )

    suspend fun insertOrder(
        jwt: String,
        outletId: String,
        orderNumber: String,
        tz: String,
        status: String = "placed"
    ): OrderInsertRow {
        val body = mapOf(
            "outlet_id" to outletId,
            "order_number" to orderNumber,
            "status" to status,
            "tz" to tz
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
        val list = Json { ignoreUnknownKeys = true }.decodeFromString(
            ListSerializer(OrderInsertRow.serializer()), text
        )
        return list.first()
    }

    suspend fun insertOrderItems(
        jwt: String,
        orderId: String,
        items: List<PlaceOrderItem>,
        outletId: String? = null
    ) {
        val rows = items.map {
            mapOf(
                "order_id" to orderId,
                "product_id" to it.productId,
                "variation_id" to it.variationId,
                "name" to it.name,
                "uom" to it.uom,
                "cost" to it.cost,
                "qty" to it.qty,
                "amount" to (it.cost * it.qty)
            )
            .let { row -> if (outletId != null) row + ("outlet_id" to outletId) else row }
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
