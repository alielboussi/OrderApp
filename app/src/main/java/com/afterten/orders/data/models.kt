package com.afterten.orders.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ProductDto(
    val id: String,
    val sku: String? = null,
    val name: String,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("receiving_uom") val uom: String,
    @SerialName("consumption_uom") val consumptionUom: String = "each",
    val cost: Double,
    @SerialName("has_variations") val hasVariations: Boolean,
    val active: Boolean = true,
    @SerialName("receiving_contains") val packageContains: Double = 1.0,
    @SerialName("default_warehouse_id") val defaultWarehouseId: String? = null
)

@Serializable
data class VariationDto(
    val id: String,
    @SerialName("item_id") val productId: String,
    val name: String,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("receiving_uom") val uom: String,
    @SerialName("consumption_uom") val consumptionUom: String = "each",
    val cost: Double,
    val active: Boolean = true,
    @SerialName("receiving_contains") val packageContains: Double = 1.0,
    @SerialName("default_warehouse_id") val defaultWarehouseId: String? = null,
    val sku: String? = null
)
