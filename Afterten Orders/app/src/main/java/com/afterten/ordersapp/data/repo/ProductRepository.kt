package com.afterten.ordersapp.data.repo

import com.afterten.ordersapp.data.ProductDto
import com.afterten.ordersapp.data.SupabaseProvider
import com.afterten.ordersapp.data.VariationDto
import com.afterten.ordersapp.data.relaxedJson
import com.afterten.ordersapp.db.AppDatabase
import com.afterten.ordersapp.db.ProductEntity
import com.afterten.ordersapp.db.VariationEntity
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

    fun listenProducts(): Flow<List<ProductEntity>> = db.productDao().listenProducts()

    suspend fun syncProducts(jwt: String) = withContext(Dispatchers.IO) {
        val raw = provider.getWithJwt(
            "/rest/v1/catalog_items?active=eq.true&outlet_order_visible=eq.true&select=" +
                "id,sku,name,image_url,purchase_pack_unit,consumption_uom,units_per_purchase_pack," +
                "transfer_unit,transfer_quantity,purchase_unit_mass,purchase_unit_mass_uom,cost,has_variations,outlet_order_visible,active,default_warehouse_id",
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
                purchasePackUnit = it.purchasePackUnit,
                consumptionUom = it.consumptionUom,
                unitsPerPurchasePack = it.unitsPerPurchasePack,
                transferUnit = it.transferUnit,
                transferQuantity = it.transferQuantity,
                purchaseUnitMass = it.purchaseUnitMass,
                purchaseUnitMassUom = it.purchaseUnitMassUom,
                cost = it.cost,
                hasVariations = it.hasVariations,
                outletOrderVisible = it.outletOrderVisible,
                active = it.active,
                defaultWarehouseId = it.defaultWarehouseId
            )
        }
        db.productDao().upsertAll(mapped)
    }

    fun listenVariations(productId: String): Flow<List<VariationEntity>> =
        db.variationDao().listenByProduct(productId)

    fun listenAllVariations(): Flow<List<VariationEntity>> =
        db.variationDao().listenAll()

    suspend fun syncVariations(jwt: String, productId: String) = withContext(Dispatchers.IO) {
        val raw = provider.getWithJwt(
            "/rest/v1/catalog_variants?item_id=eq.$productId&active=eq.true&outlet_order_visible=eq.true&select=" +
                "id,item_id,name,image_url,purchase_pack_unit,consumption_uom,units_per_purchase_pack," +
                "transfer_unit,transfer_quantity,purchase_unit_mass,purchase_unit_mass_uom,cost,active,outlet_order_visible,default_warehouse_id,sku",
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
                cost = it.cost,
                active = it.active,
                outletOrderVisible = it.outletOrderVisible,
                defaultWarehouseId = it.defaultWarehouseId
            )
        }
        db.variationDao().clearForProduct(productId)
        db.variationDao().upsertAll(mapped)
    }

    suspend fun syncAllVariations(jwt: String) = withContext(Dispatchers.IO) {
        val raw = provider.getWithJwt(
            "/rest/v1/catalog_variants?active=eq.true&outlet_order_visible=eq.true&select=" +
                "id,item_id,name,image_url,purchase_pack_unit,consumption_uom,units_per_purchase_pack," +
                "transfer_unit,transfer_quantity,purchase_unit_mass,purchase_unit_mass_uom,cost,active,outlet_order_visible,default_warehouse_id,sku",
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
