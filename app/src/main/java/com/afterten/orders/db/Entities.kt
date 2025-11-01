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

@Entity(tableName = "draft_cart")
data class DraftCartItemEntity(
    @PrimaryKey val key: String, // productId:variationId
    val productId: String,
    val variationId: String?,
    val name: String,
    val uom: String,
    val unitPrice: Double,
    val qty: Int
)

@Entity(tableName = "pending_orders")
data class PendingOrderEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val outletId: String,
    val employeeName: String,
    val itemsJson: String,
    val createdAtMillis: Long = System.currentTimeMillis(),
    val attempts: Int = 0,
    val nextAttemptAtMillis: Long = System.currentTimeMillis()
)
