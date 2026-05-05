package com.afterten.drinks_transfers.shared

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
  @SerialName("image_url") val imageUrl: String? = null
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
data class DamageRequest(
  @SerialName("p_warehouse_id") val warehouseId: String,
  @SerialName("p_items") val items: List<DamageLineRequest>
)

@Serializable
data class DamageLineRequest(
  @SerialName("product_id") val productId: String,
  @SerialName("variant_key") val variantKey: String,
  @SerialName("qty") val quantity: Double
)
