package com.afterten.orders.data.repo

import com.afterten.orders.data.SupabaseProvider
import com.afterten.orders.data.relaxedJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.builtins.ListSerializer

class CatalogRepository(private val provider: SupabaseProvider) {
    @Serializable
    data class CatalogItemInput(
        val name: String,
        val sku: String? = null,
        @SerialName("item_kind") val itemKind: String,
        @SerialName("base_unit") val baseUnit: String = "each",
        @SerialName("units_per_purchase_pack") val unitsPerPurchasePack: Double = 1.0,
        val active: Boolean = true,
        @SerialName("consumption_uom") val consumptionUom: String = "each",
        val cost: Double = 0.0,
        @SerialName("has_variations") val hasVariations: Boolean = false,
        @SerialName("image_url") val imageUrl: String? = null,
        @SerialName("default_warehouse_id") val defaultWarehouseId: String? = null,
        @SerialName("purchase_pack_unit") val purchasePackUnit: String = "each",
        @SerialName("purchase_unit_mass") val purchaseUnitMass: Double? = null,
        @SerialName("purchase_unit_mass_uom") val purchaseUnitMassUom: String? = null,
        @SerialName("transfer_unit") val transferUnit: String = "each",
        @SerialName("transfer_quantity") val transferQuantity: Double = 1.0,
        @SerialName("outlet_order_visible") val outletOrderVisible: Boolean = true,
        @SerialName("locked_from_warehouse_id") val lockedFromWarehouseId: String? = null
    )

    @Serializable
    data class CatalogVariationInput(
        @SerialName("catalog_item_id") val catalogItemId: String,
        val name: String,
        val sku: String? = null,
        @SerialName("consumption_uom") val consumptionUom: String = "each",
        @SerialName("units_per_purchase_pack") val unitsPerPurchasePack: Double = 1.0,
        @SerialName("transfer_quantity") val transferQuantity: Double = 1.0,
        val active: Boolean = true
    )

    @Serializable
    data class CatalogItemResponse(val id: String, val name: String)

    suspend fun createCatalogItem(jwt: String, input: CatalogItemInput): CatalogItemResponse {
        val (_, body) = provider.postWithJwt(
            pathAndQuery = "/rest/v1/catalog_items",
            jwt = jwt,
            bodyObj = input,
            prefer = listOf("return=representation")
        )
        val payload = body ?: throw IllegalStateException("No response body returned")
        return relaxedJson.decodeFromString(ListSerializer(CatalogItemResponse.serializer()), payload).first()
    }

    suspend fun listCatalogItems(jwt: String, limit: Int = 100): List<CatalogItemListRow> {
        val body = provider.getWithJwt("/rest/v1/catalog_items?select=*&order=name.asc&limit=${'$'}limit", jwt)
        return relaxedJson.decodeFromString(ListSerializer(CatalogItemListRow.serializer()), body)
    }

    @Serializable
    data class CatalogVariationResponse(val id: String, @SerialName("catalog_item_id") val catalogItemId: String, val name: String)

    suspend fun createCatalogVariation(jwt: String, input: CatalogVariationInput): CatalogVariationResponse {
        val (_, body) = provider.postWithJwt(
            pathAndQuery = "/rest/v1/catalog_item_variations",
            jwt = jwt,
            bodyObj = input,
            prefer = listOf("return=representation")
        )
        val payload = body ?: throw IllegalStateException("No response body returned")
        return relaxedJson.decodeFromString(ListSerializer(CatalogVariationResponse.serializer()), payload).first()
    }

    // --- Listing / search for edit flows ---
    @Serializable
    data class CatalogItemListRow(
        val id: String,
        val name: String,
        val sku: String? = null,
        @SerialName("item_kind") val itemKind: String,
        @SerialName("base_unit") val baseUnit: String = "each",
        @SerialName("units_per_purchase_pack") val unitsPerPurchasePack: Double = 1.0,
        val active: Boolean = true,
        @SerialName("consumption_uom") val consumptionUom: String = "each",
        val cost: Double = 0.0,
        @SerialName("has_variations") val hasVariations: Boolean = false,
        @SerialName("image_url") val imageUrl: String? = null,
        @SerialName("default_warehouse_id") val defaultWarehouseId: String? = null,
        @SerialName("purchase_pack_unit") val purchasePackUnit: String = "each",
        @SerialName("purchase_unit_mass") val purchaseUnitMass: Double? = null,
        @SerialName("purchase_unit_mass_uom") val purchaseUnitMassUom: String? = null,
        @SerialName("transfer_unit") val transferUnit: String = "each",
        @SerialName("transfer_quantity") val transferQuantity: Double = 1.0,
        @SerialName("outlet_order_visible") val outletOrderVisible: Boolean = true,
        @SerialName("locked_from_warehouse_id") val lockedFromWarehouseId: String? = null
    )

    suspend fun searchCatalogItems(jwt: String, query: String, limit: Int = 50): List<CatalogItemListRow> {
        val filter = if (query.isBlank()) "" else "&name=ilike.*${'$'}{query}*&or=(sku.ilike.*${'$'}{query}*)"
        val body = provider.getWithJwt("/rest/v1/catalog_items?select=*&order=name.asc&limit=${'$'}limit$filter", jwt)
        return relaxedJson.decodeFromString(ListSerializer(CatalogItemListRow.serializer()), body)
    }

    suspend fun updateCatalogItem(jwt: String, id: String, patch: CatalogItemInput): CatalogItemResponse {
        val (_, body) = provider.patchWithJwt(
            pathAndQuery = "/rest/v1/catalog_items?id=eq.${'$'}id",
            jwt = jwt,
            bodyObj = patch,
            prefer = listOf("return=representation")
        )
        val payload = body ?: throw IllegalStateException("No response body returned")
        return relaxedJson.decodeFromString(ListSerializer(CatalogItemResponse.serializer()), payload).first()
    }

    @Serializable
    data class CatalogVariationListRow(
        val id: String,
        @SerialName("catalog_item_id") val catalogItemId: String,
        val name: String,
        val sku: String? = null,
        @SerialName("consumption_uom") val consumptionUom: String = "each",
        @SerialName("units_per_purchase_pack") val unitsPerPurchasePack: Double = 1.0,
        @SerialName("transfer_quantity") val transferQuantity: Double = 1.0,
        val active: Boolean = true
    )

    suspend fun searchCatalogVariations(jwt: String, query: String, limit: Int = 50): List<CatalogVariationListRow> {
        val filter = if (query.isBlank()) "" else "&name=ilike.*${'$'}{query}*&or=(sku.ilike.*${'$'}{query}*)"
        val body = provider.getWithJwt("/rest/v1/catalog_item_variations?select=*&order=name.asc&limit=${'$'}limit$filter", jwt)
        return relaxedJson.decodeFromString(ListSerializer(CatalogVariationListRow.serializer()), body)
    }

    suspend fun updateCatalogVariation(jwt: String, id: String, patch: CatalogVariationInput): CatalogVariationResponse {
        val (_, body) = provider.patchWithJwt(
            pathAndQuery = "/rest/v1/catalog_item_variations?id=eq.${'$'}id",
            jwt = jwt,
            bodyObj = patch,
            prefer = listOf("return=representation")
        )
        val payload = body ?: throw IllegalStateException("No response body returned")
        return relaxedJson.decodeFromString(ListSerializer(CatalogVariationResponse.serializer()), payload).first()
    }
}
