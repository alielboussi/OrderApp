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

    suspend fun rpcLogin(email: String, password: String): String {
        require(supabaseUrl.isNotBlank() && supabaseAnonKey.isNotBlank()) {
            "SUPABASE_URL/ANON_KEY not configured"
        }
        val endpoint = "$supabaseUrl/rest/v1/rpc/outlet_login"
        val response = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            contentType(ContentType.Application.Json)
            setBody(mapOf("p_email" to email, "p_password" to password))
        }
        // Expecting JSON: { token: "...", outlet_id: "...", outlet_name: "..." }
        return response.bodyAsText()
    }

    suspend fun getWithJwt(pathAndQuery: String, jwt: String): String {
        val url = if (pathAndQuery.startsWith("http")) pathAndQuery else "$supabaseUrl$pathAndQuery"
        val resp = http.get(url) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
        }
        return resp.bodyAsText()
    }

    // Optional: Server-side order number generation via RPC
    suspend fun rpcNextOrderNumber(jwt: String): String {
        val endpoint = "$supabaseUrl/rest/v1/rpc/next_order_number"
        val response = http.post(endpoint) {
            header("apikey", supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $jwt")
            contentType(ContentType.Application.Json)
            setBody(emptyMap<String, String>())
        }
        return response.bodyAsText()
    }
}
