package com.afterten.orders.data.repo

import com.afterten.orders.data.ProductDto
import com.afterten.orders.data.SupabaseProvider
import com.afterten.orders.data.VariationDto
import com.afterten.orders.db.AppDatabase
import com.afterten.orders.db.ProductEntity
import com.afterten.orders.db.VariationEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.Serializable

class ProductRepository(
    private val provider: SupabaseProvider,
    private val db: AppDatabase
) {
    private val json = Json { ignoreUnknownKeys = true }

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
            "/rest/v1/products?active=eq.true&select=" +
                "id,sku,name,image_url,uom,cost,has_variations,active,units_per_uom,default_warehouse_id",
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
                uom = it.uom,
                cost = it.cost,
                hasVariations = it.hasVariations,
                active = it.active,
                unitsPerUom = it.unitsPerUom,
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
            "/rest/v1/product_variations?product_id=eq.$productId&active=eq.true&select=" +
                "id,product_id,name,image_url,uom,cost,active,units_per_uom,default_warehouse_id",
            jwt
        )
        throwIfError(raw)
        val items = json.decodeFromString<List<VariationDto>>(raw)
        val mapped = items.map {
            VariationEntity(
                id = it.id,
                productId = it.productId,
                name = it.name,
                imageUrl = it.imageUrl,
                uom = it.uom,
                cost = it.cost,
                active = it.active,
                unitsPerUom = it.unitsPerUom,
                defaultWarehouseId = it.defaultWarehouseId
            )
        }
        db.variationDao().clearForProduct(productId)
        db.variationDao().upsertAll(mapped)
    }

    suspend fun syncAllVariations(jwt: String) = withContext(Dispatchers.IO) {
        val raw = provider.getWithJwt(
            "/rest/v1/product_variations?active=eq.true&select=" +
                "id,product_id,name,image_url,uom,cost,active,units_per_uom,default_warehouse_id",
            jwt
        )
        throwIfError(raw)
        val items = json.decodeFromString<List<VariationDto>>(raw)
        val mapped = items.map {
            VariationEntity(
                id = it.id,
                productId = it.productId,
                name = it.name,
                imageUrl = it.imageUrl,
                uom = it.uom,
                cost = it.cost,
                active = it.active,
                unitsPerUom = it.unitsPerUom,
                defaultWarehouseId = it.defaultWarehouseId
            )
        }
        db.variationDao().clearAll()
        db.variationDao().upsertAll(mapped)
    }
}
