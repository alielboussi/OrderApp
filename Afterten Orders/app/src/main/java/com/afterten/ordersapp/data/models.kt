package com.afterten.ordersapp.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ProductDto(
    val id: String,
    val sku: String? = null,
    val name: String,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("purchase_pack_unit") val purchasePackUnit: String,
    @SerialName("consumption_uom") val consumptionUom: String = "each",
    @SerialName("units_per_purchase_pack") val unitsPerPurchasePack: Double = 1.0,
    @SerialName("transfer_unit") val transferUnit: String = "each",
    @SerialName("transfer_quantity") val transferQuantity: Double = 1.0,
    @SerialName("purchase_unit_mass") val purchaseUnitMass: Double? = null,
    @SerialName("purchase_unit_mass_uom") val purchaseUnitMassUom: String? = null,
    val cost: Double,
    @SerialName("has_variations") val hasVariations: Boolean,
    @SerialName("outlet_order_visible") val outletOrderVisible: Boolean = true,
    val active: Boolean = true,
    @SerialName("default_warehouse_id") val defaultWarehouseId: String? = null
)

@Serializable
data class VariationDto(
    val id: String,
    @SerialName("item_id") val productId: String,
    val name: String,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("purchase_pack_unit") val purchasePackUnit: String,
    @SerialName("consumption_uom") val consumptionUom: String = "each",
    @SerialName("units_per_purchase_pack") val unitsPerPurchasePack: Double = 1.0,
    @SerialName("transfer_unit") val transferUnit: String = "each",
    @SerialName("transfer_quantity") val transferQuantity: Double = 1.0,
    @SerialName("purchase_unit_mass") val purchaseUnitMass: Double? = null,
    @SerialName("purchase_unit_mass_uom") val purchaseUnitMassUom: String? = null,
    val cost: Double,
    val active: Boolean = true,
    @SerialName("outlet_order_visible") val outletOrderVisible: Boolean = true,
    @SerialName("default_warehouse_id") val defaultWarehouseId: String? = null,
    val sku: String? = null
)
