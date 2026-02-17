package com.afterten.stocktake.data.repo

import com.afterten.stocktake.data.OutletSession
import com.afterten.stocktake.data.RoleDescriptor
import com.afterten.stocktake.data.SupabaseProvider
import com.afterten.stocktake.data.relaxedJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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
        val roles: List<RoleDescriptor> = emptyList(),
        @SerialName("is_admin") val isAdmin: Boolean = false,
        @SerialName("can_transfer") val canTransfer: Boolean = false,
        @SerialName("is_transfer_manager") val isTransferManager: Boolean = false,
        @SerialName("is_supervisor") val isSupervisor: Boolean = false
    )

    suspend fun login(email: String, password: String): OutletSession {
        val raw = provider.rpcLogin(email.trim(), password)
        val parsed = relaxedJson.decodeFromString<LoginResponse>(raw)
        return OutletSession(
            token = parsed.token,
            refreshToken = parsed.refreshToken,
            expiresAtMillis = parsed.expiresAtMillis,
            outletId = parsed.outletId,
            outletName = parsed.outletName,
            userId = parsed.userId,
            email = parsed.email,
            roles = parsed.roles,
            isAdmin = parsed.isAdmin,
            canTransfer = parsed.canTransfer,
            isTransferManager = parsed.isTransferManager,
            isSupervisor = parsed.isSupervisor
        )
    }
}
