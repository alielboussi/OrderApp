package com.afterten.orders.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface ProductDao {
    @Query("select * from products where active = 1 order by name")
    fun listenProducts(): Flow<List<ProductEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(products: List<ProductEntity>)

    @Query("delete from products")
    suspend fun clear()
}

@Dao
interface VariationDao {
    @Query("select * from product_variations where productId = :productId and active = 1 order by name")
    fun listenByProduct(productId: String): Flow<List<VariationEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(variations: List<VariationEntity>)

    @Query("delete from product_variations where productId = :productId")
    suspend fun clearForProduct(productId: String)
}
