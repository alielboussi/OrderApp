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

    // (Realtime support will be added later when toolchain is upgraded)
}
