package com.afterten.orders.data

import kotlinx.serialization.Serializable

@Serializable
data class OutletSession(
    val token: String,
    val outletId: String,
    val outletName: String
)
