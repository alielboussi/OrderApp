package com.afterten.drinks_transfers.data

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
data class DamageItemRequest(
  @SerialName("item_id") val itemId: String,
  @SerialName("variant_id") val variantId: String? = null,
  @SerialName("quantity") val quantity: Double
)

@Serializable
data class TelegramSummary(
  @SerialName("processedBy") val processedBy: String,
  @SerialName("sourceLabel") val sourceLabel: String,
  @SerialName("destLabel") val destLabel: String,
  @SerialName("itemsBlock") val itemsBlock: String,
  @SerialName("reference") val reference: String? = null,
  @SerialName("dateTime") val dateTime: String? = null,
  @SerialName("warehouseId") val warehouseId: String? = null
)

@Serializable
data class TelegramNotifyRequest(
  @SerialName("context") val context: String,
  @SerialName("summary") val summary: TelegramSummary,
  @SerialName("scanner") val scanner: String
)
