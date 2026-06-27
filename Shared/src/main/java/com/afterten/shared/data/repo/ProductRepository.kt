package com.afterten.shared.data.repo

import com.afterten.shared.data.ProductDto
import com.afterten.shared.data.SupabaseProvider
import com.afterten.shared.data.VariationDto
import com.afterten.shared.data.relaxedJson
import com.afterten.shared.db.AppDatabase
import com.afterten.shared.db.ProductEntity
import com.afterten.shared.db.VariationEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable

class ProductRepository(
    private val provider: SupabaseProvider,
    private val db: AppDatabase
) {
    private val json = relaxedJson

    @Serializable
    private data class PostgrestError(
        val code: String? = null,
        val message: String? = null,
        val details: String? = null,
        val hint: String? = null
    )

    private fun throwIfError(raw: String) {
        val t = raw.trim()
        if (t.startsWith("{")) {
            runCatching { json.decodeFromString(PostgrestError.serializer(), t) }
                .getOrNull()
                ?.let { err ->
                    if (!err.message.isNullOrBlank()) {
                        throw IllegalStateException(err.message)
                    }
                }
        }
    }

    private suspend fun fetchAllowlistedItemIds(jwt: String, outletId: String, forOrders: Boolean): Set<String> {
        val flag = if (forOrders) "allow_orders" else "allow_stocktake"
        val raw = provider.getWithJwt(
            "/rest/v1/outlet_catalog_allowlist?outlet_id=eq.$outletId&$flag=eq.true&select=item_id",
            jwt
        )
        throwIfError(raw)
        if (raw.trim() == "[]") return emptySet()
        return runCatching {
            json.decodeFromString<List<Map<String, String>>>(raw)
                .mapNotNull { it["item_id"]?.trim()?.takeIf { id -> id.isNotEmpty() } }
                .toSet()
        }.getOrDefault(emptySet())
    }

    private suspend fun fetchAllowlistedVariantIds(jwt: String, outletId: String, itemId: String): Set<String> {
        val raw = provider.getWithJwt(
            "/rest/v1/outlet_catalog_allowlist?outlet_id=eq.$outletId&item_id=eq.$itemId&allow_orders=eq.true&select=variant_id",
            jwt
        )
        throwIfError(raw)
        if (raw.trim() == "[]") return emptySet()
        return runCatching {
            json.decodeFromString<List<Map<String, String?>>>(raw)
                .mapNotNull { it["variant_id"]?.trim()?.takeIf { id -> id.isNotEmpty() } }
                .toSet()
        }.getOrDefault(emptySet())
    }

    fun listenProducts(): Flow<List<ProductEntity>> = db.productDao().listenProducts()

    suspend fun syncProducts(jwt: String, outletId: String? = null) = withContext(Dispatchers.IO) {
        val allowedItemIds = outletId?.let { fetchAllowlistedItemIds(jwt, it, forOrders = true) }.orEmpty()
        val itemFilter =
            if (outletId != null && allowedItemIds.isNotEmpty()) {
                "&id=in.(${allowedItemIds.joinToString(",")})"
            } else if (outletId != null) {
                "&id=eq.00000000-0000-0000-0000-000000000000"
            } else {
                "&outlet_order_visible=eq.true"
            }
        val raw = provider.getWithJwt(
            "/rest/v1/catalog_items?active=eq.true$itemFilter&select=" +
                "id,sku,name,image_url,item_kind,has_recipe,purchase_pack_unit,consumption_uom,units_per_purchase_pack," +
                "transfer_unit,transfer_quantity,purchase_unit_mass,purchase_unit_mass_uom,inner_pack_unit_mass,inner_pack_unit_mass_uom,cost,has_variations,outlet_order_visible,active,default_warehouse_id",
            jwt
        )
        // If Supabase returns an error object, surface a friendly message instead of a JSON parse crash
        throwIfError(raw)
        val items = json.decodeFromString<List<ProductDto>>(raw)
        val mapped = items.map {
            ProductEntity(
                id = it.id,
                sku = it.sku,
                name = it.name,
                imageUrl = it.imageUrl,
                itemKind = it.itemKind,
                hasRecipe = it.hasRecipe == true,
                purchasePackUnit = it.purchasePackUnit,
                consumptionUom = it.consumptionUom,
                unitsPerPurchasePack = it.unitsPerPurchasePack,
                transferUnit = it.transferUnit,
                transferQuantity = it.transferQuantity,
                purchaseUnitMass = it.purchaseUnitMass,
                purchaseUnitMassUom = it.purchaseUnitMassUom,
                innerPackUnitMass = it.innerPackUnitMass,
                innerPackUnitMassUom = it.innerPackUnitMassUom,
                cost = it.cost,
                hasVariations = it.hasVariations,
                outletOrderVisible = it.outletOrderVisible,
                active = it.active,
                defaultWarehouseId = it.defaultWarehouseId
            )
        }
        db.productDao().upsertAll(mapped)
    }

    suspend fun listRecipeIngredientIds(jwt: String, finishedItemId: String, variantKey: String = "base"): List<String> {
        return provider.listRecipeIngredientIds(jwt, finishedItemId, variantKey)
    }

    fun listenVariations(productId: String): Flow<List<VariationEntity>> =
        db.variationDao().listenByProduct(productId)

    fun listenAllVariations(): Flow<List<VariationEntity>> =
        db.variationDao().listenAll()

    suspend fun syncVariations(jwt: String, productId: String, outletId: String? = null) = withContext(Dispatchers.IO) {
        val allowedVariantIds = outletId?.let { fetchAllowlistedVariantIds(jwt, it, productId) }.orEmpty()
        val variantFilter =
            if (outletId != null && allowedVariantIds.isNotEmpty()) {
                "&id=in.(${allowedVariantIds.joinToString(",")})"
            } else if (outletId != null) {
                "&id=eq.00000000-0000-0000-0000-000000000000"
            } else {
                "&outlet_order_visible=eq.true"
            }
        val raw = provider.getWithJwt(
            "/rest/v1/catalog_variants?item_id=eq.$productId&active=eq.true$variantFilter&select=" +
                "id,item_id,name,image_url,purchase_pack_unit,consumption_uom,units_per_purchase_pack," +
                "transfer_unit,transfer_quantity,purchase_unit_mass,purchase_unit_mass_uom,inner_pack_unit_mass,inner_pack_unit_mass_uom,cost,active,outlet_order_visible,default_warehouse_id,sku",
            jwt
        )
        throwIfError(raw)
        val items = json.decodeFromString<List<VariationDto>>(raw)
        val mapped = items.map {
            VariationEntity(
                id = it.id,
                productId = it.productId,
                sku = it.sku,
                name = it.name,
                imageUrl = it.imageUrl,
                purchasePackUnit = it.purchasePackUnit,
                consumptionUom = it.consumptionUom,
                unitsPerPurchasePack = it.unitsPerPurchasePack,
                transferUnit = it.transferUnit,
                transferQuantity = it.transferQuantity,
                purchaseUnitMass = it.purchaseUnitMass,
                purchaseUnitMassUom = it.purchaseUnitMassUom,
                innerPackUnitMass = it.innerPackUnitMass,
                innerPackUnitMassUom = it.innerPackUnitMassUom,
                cost = it.cost,
                active = it.active,
                outletOrderVisible = it.outletOrderVisible,
                defaultWarehouseId = it.defaultWarehouseId
            )
        }
        db.variationDao().clearForProduct(productId)
        db.variationDao().upsertAll(mapped)
    }

    suspend fun syncAllVariations(jwt: String, outletId: String? = null) = withContext(Dispatchers.IO) {
        val allowedItemIds = outletId?.let { fetchAllowlistedItemIds(jwt, it, forOrders = true) }.orEmpty()
        val itemFilter =
            if (outletId != null && allowedItemIds.isNotEmpty()) {
                "&item_id=in.(${allowedItemIds.joinToString(",")})"
            } else if (outletId != null) {
                "&item_id=eq.00000000-0000-0000-0000-000000000000"
            } else {
                "&outlet_order_visible=eq.true"
            }
        val raw = provider.getWithJwt(
            "/rest/v1/catalog_variants?active=eq.true$itemFilter&select=" +
                "id,item_id,name,image_url,purchase_pack_unit,consumption_uom,units_per_purchase_pack," +
                "transfer_unit,transfer_quantity,purchase_unit_mass,purchase_unit_mass_uom,inner_pack_unit_mass,inner_pack_unit_mass_uom,cost,active,outlet_order_visible,default_warehouse_id,sku",
            jwt
        )
        throwIfError(raw)
        val items = json.decodeFromString<List<VariationDto>>(raw)
        val mapped = items.map {
            VariationEntity(
                id = it.id,
                productId = it.productId,
                sku = it.sku,
                name = it.name,
                imageUrl = it.imageUrl,
                purchasePackUnit = it.purchasePackUnit,
                consumptionUom = it.consumptionUom,
                unitsPerPurchasePack = it.unitsPerPurchasePack,
                transferUnit = it.transferUnit,
                transferQuantity = it.transferQuantity,
                purchaseUnitMass = it.purchaseUnitMass,
                purchaseUnitMassUom = it.purchaseUnitMassUom,
                innerPackUnitMass = it.innerPackUnitMass,
                innerPackUnitMassUom = it.innerPackUnitMassUom,
                cost = it.cost,
                active = it.active,
                outletOrderVisible = it.outletOrderVisible,
                defaultWarehouseId = it.defaultWarehouseId
            )
        }
        db.variationDao().clearAll()
        db.variationDao().upsertAll(mapped)
    }
}
