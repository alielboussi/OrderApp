package com.afterten.orders.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [ProductEntity::class, VariationEntity::class, DraftCartItemEntity::class],
    version = 2,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun productDao(): ProductDao
    abstract fun variationDao(): VariationDao
    abstract fun cartDao(): CartDao

    companion object {
        @Volatile private var INSTANCE: AppDatabase? = null
        fun get(context: Context): AppDatabase = INSTANCE ?: synchronized(this) {
            INSTANCE ?: Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "afterten.db"
            ).fallbackToDestructiveMigration().build().also { INSTANCE = it }
        }
    }
}
