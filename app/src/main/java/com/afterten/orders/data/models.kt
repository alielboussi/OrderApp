package com.afterten.orders.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ProductDto(
    val id: String,
    val sku: String? = null,
    val name: String,
    @SerialName("image_url") val imageUrl: String? = null,
    val uom: String,
    val cost: Double,
    @SerialName("has_variations") val hasVariations: Boolean,
    val active: Boolean = true
)

@Serializable
data class VariationDto(
    val id: String,
    @SerialName("product_id") val productId: String,
    val name: String,
    @SerialName("image_url") val imageUrl: String? = null,
    val uom: String,
    val cost: Double,
    val active: Boolean = true
)
