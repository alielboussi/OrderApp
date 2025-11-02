package com.afterten.orders.data.repo

import com.afterten.orders.data.OutletSession
import com.afterten.orders.data.SupabaseProvider
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

class OutletRepository(private val provider: SupabaseProvider) {

    @Serializable
    private data class LoginResponse(
        val token: String,
        @SerialName("refresh_token") val refreshToken: String,
        @SerialName("expires_at") val expiresAtMillis: Long,
        @SerialName("outlet_id") val outletId: String,
        @SerialName("outlet_name") val outletName: String,
        @SerialName("user_id") val userId: String? = null,
        val email: String? = null,
        @SerialName("is_admin") val isAdmin: Boolean = false
    )

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun login(email: String, password: String): OutletSession {
        val raw = provider.rpcLogin(email.trim(), password)
        val parsed = json.decodeFromString<LoginResponse>(raw)
        return OutletSession(
            token = parsed.token,
            refreshToken = parsed.refreshToken,
            expiresAtMillis = parsed.expiresAtMillis,
            outletId = parsed.outletId,
            outletName = parsed.outletName,
            userId = parsed.userId,
            email = parsed.email,
            isAdmin = parsed.isAdmin
        )
    }
}
