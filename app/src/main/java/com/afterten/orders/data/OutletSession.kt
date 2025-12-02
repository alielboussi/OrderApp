package com.afterten.orders.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RoleDescriptor(
    val id: String? = null,
    val slug: String? = null,
    @SerialName("normalized_slug") val normalizedSlug: String? = null,
    @SerialName("display_name") val displayName: String? = null
)

@Serializable
data class OutletSession(
    val token: String,
    val refreshToken: String,
    val expiresAtMillis: Long,
    val outletId: String,
    val outletName: String,
    val userId: String? = null,
    val email: String? = null,
    val roles: List<RoleDescriptor> = emptyList(),
    val isAdmin: Boolean = false,
    val canTransfer: Boolean = false,
    val isTransferManager: Boolean = false,
    val isSupervisor: Boolean = false
)
