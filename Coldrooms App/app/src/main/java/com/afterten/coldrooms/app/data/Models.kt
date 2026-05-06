package com.afterten.coldrooms.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LoginResponse(
  val token: String,
  val user: LoginUser
)

@Serializable
data class LoginResponseRaw(
  @SerialName("token") val token: String,
  @SerialName("user_id") val userId: String,
  @SerialName("email") val email: String,
  @SerialName("display_name") val displayName: String? = null
)

@Serializable
data class LoginUser(
  @SerialName("id") val id: String,
  @SerialName("email") val email: String,
  @SerialName("display_name") val displayName: String? = null
)

@Serializable
data class Warehouse(
  @SerialName("id") val id: String,
  @SerialName("name") val name: String
)

@Serializable
data class Supplier(
  @SerialName("id") val id: String,
  @SerialName("name") val name: String
)

@Serializable
data class WarehouseItem(
  @SerialName("item_id") val itemId: String,
  @SerialName("variant_key") val variantId: String? = null,
  @SerialName("item_name") val itemName: String,
  @SerialName("variant_name") val variantName: String? = null,
  @SerialName("sku") val sku: String? = null,
  @SerialName("net_units") val onHand: Double? = null,
  @SerialName("image_url") val imageUrl: String? = null,
  @SerialName("consumption_uom") val consumptionUom: String? = null,
  @SerialName("purchase_pack_unit") val purchasePackUnit: String? = null,
  @SerialName("transfer_unit") val transferUnit: String? = null,
  @SerialName("transfer_quantity") val transferQuantity: Double? = null
)

@Serializable
data class CatalogItemRow(
  @SerialName("id") val id: String,
  @SerialName("name") val name: String,
  @SerialName("sku") val sku: String? = null,
  @SerialName("image_url") val imageUrl: String? = null,
  @SerialName("consumption_uom") val consumptionUom: String? = null,
  @SerialName("purchase_pack_unit") val purchasePackUnit: String? = null,
  @SerialName("transfer_unit") val transferUnit: String? = null,
  @SerialName("transfer_quantity") val transferQuantity: Double? = null
)

@Serializable
data class CatalogVariantRow(
  @SerialName("id") val id: String,
  @SerialName("item_id") val itemId: String,
  @SerialName("name") val name: String,
  @SerialName("sku") val sku: String? = null,
  @SerialName("image_url") val imageUrl: String? = null,
  @SerialName("consumption_uom") val consumptionUom: String? = null
)

@Serializable
data class WarehouseStockRow(
  @SerialName("item_id") val itemId: String,
  @SerialName("variant_key") val variantKey: String? = null,
  @SerialName("net_units") val netUnits: Double? = null
)

@Serializable
data class WarehouseStockPeriodRow(
  @SerialName("id") val id: String,
  @SerialName("warehouse_id") val warehouseId: String,
  @SerialName("status") val status: String
)

@Serializable
data class WarehouseOpeningKeyRow(
  @SerialName("item_id") val itemId: String,
  @SerialName("variant_key") val variantKey: String? = null
)

@Serializable
data class TransferItemRequest(
  @SerialName("item_id") val itemId: String,
  @SerialName("variant_id") val variantId: String? = null,
  @SerialName("quantity") val quantity: Double
)

@Serializable
data class PurchaseItemRequest(
  @SerialName("item_id") val itemId: String,
  @SerialName("variant_id") val variantId: String? = null,
  @SerialName("quantity") val quantity: Double,
  @SerialName("unit_cost") val unitCost: Double? = null
)

@Serializable
data class PurchaseReceiptRequest(
  @SerialName("p_supplier_id") val supplierId: String,
  @SerialName("p_invoice_number") val invoiceNumber: String,
  @SerialName("p_warehouse_id") val warehouseId: String,
  @SerialName("p_items") val items: List<PurchaseItemRequest>
)

@Serializable
data class DamageItemRequest(
  @SerialName("item_id") val itemId: String,
  @SerialName("variant_id") val variantId: String? = null,
  @SerialName("quantity") val quantity: Double
)

@Serializable
data class AndroidAppVersionRow(
  @SerialName("app_key") val appKey: String,
  @SerialName("min_version_code") val minVersionCode: Int,
  @SerialName("min_version_name") val minVersionName: String? = null,
  @SerialName("force_update") val forceUpdate: Boolean = true
)
