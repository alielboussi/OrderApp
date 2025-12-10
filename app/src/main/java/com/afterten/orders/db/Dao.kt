package com.afterten.orders.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface ProductDao {
    @Query("select * from products where active = 1 and outletOrderVisible = 1 order by name")
    fun listenProducts(): Flow<List<ProductEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(products: List<ProductEntity>)

    @Query("delete from products")
    suspend fun clear()
}

@Dao
interface VariationDao {
    @Query("select * from product_variations where productId = :productId and active = 1 and outletOrderVisible = 1 order by name")
    fun listenByProduct(productId: String): Flow<List<VariationEntity>>

    @Query("select * from product_variations where active = 1 and outletOrderVisible = 1")
    fun listenAll(): Flow<List<VariationEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(variations: List<VariationEntity>)

    @Query("delete from product_variations where productId = :productId")
    suspend fun clearForProduct(productId: String)

    @Query("delete from product_variations")
    suspend fun clearAll()
}

@Dao
interface CartDao {
    @Query("select * from draft_cart order by name")
    fun listenAll(): Flow<List<DraftCartItemEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: DraftCartItemEntity)

    @Query("delete from draft_cart where `key` = :key")
    suspend fun deleteByKey(key: String)

    @Query("delete from draft_cart")
    suspend fun clear()
}

@Dao
interface PendingOrderDao {
    @Query("select * from pending_orders where nextAttemptAtMillis <= :now order by createdAtMillis asc")
    suspend fun due(now: Long): List<PendingOrderEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: PendingOrderEntity): Long

    @Query("delete from pending_orders where id = :id")
    suspend fun delete(id: Long)

    @Query("update pending_orders set attempts = :attempts, nextAttemptAtMillis = :nextAt where id = :id")
    suspend fun updateBackoff(id: Long, attempts: Int, nextAt: Long)
}
