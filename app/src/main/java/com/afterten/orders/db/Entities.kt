package com.afterten.orders.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "products")
data class ProductEntity(
    @PrimaryKey val id: String,
    val sku: String?,
    val name: String,
    val imageUrl: String?,
    val uom: String,
    val cost: Double,
    val hasVariations: Boolean,
    val active: Boolean
)

@Entity(tableName = "product_variations")
data class VariationEntity(
    @PrimaryKey val id: String,
    val productId: String,
    val name: String,
    val imageUrl: String?,
    val uom: String,
    val cost: Double,
    val active: Boolean
)
