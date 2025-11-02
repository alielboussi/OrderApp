package com.afterten.orders.data

import kotlinx.serialization.Serializable

@Serializable
data class OutletSession(
    val token: String,
    val refreshToken: String,
    val expiresAtMillis: Long,
    val outletId: String,
    val outletName: String,
    val userId: String? = null,
    val email: String? = null,
    val isAdmin: Boolean = false
)
