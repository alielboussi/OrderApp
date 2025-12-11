package com.afterten.orders.db;

import androidx.annotation.NonNull;
import androidx.room.DatabaseConfiguration;
import androidx.room.InvalidationTracker;
import androidx.room.RoomDatabase;
import androidx.room.RoomOpenHelper;
import androidx.room.migration.AutoMigrationSpec;
import androidx.room.migration.Migration;
import androidx.room.util.DBUtil;
import androidx.room.util.TableInfo;
import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.sqlite.db.SupportSQLiteOpenHelper;
import java.lang.Class;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.annotation.processing.Generated;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class AppDatabase_Impl extends AppDatabase {
  private volatile ProductDao _productDao;

  private volatile VariationDao _variationDao;

  private volatile CartDao _cartDao;

  private volatile PendingOrderDao _pendingOrderDao;

  @Override
  @NonNull
  protected SupportSQLiteOpenHelper createOpenHelper(@NonNull final DatabaseConfiguration config) {
    final SupportSQLiteOpenHelper.Callback _openCallback = new RoomOpenHelper(config, new RoomOpenHelper.Delegate(8) {
      @Override
      public void createAllTables(@NonNull final SupportSQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS `products` (`id` TEXT NOT NULL, `sku` TEXT, `name` TEXT NOT NULL, `imageUrl` TEXT, `purchasePackUnit` TEXT NOT NULL, `consumptionUom` TEXT NOT NULL, `unitsPerPurchasePack` REAL NOT NULL, `transferUnit` TEXT NOT NULL, `transferQuantity` REAL NOT NULL, `purchaseUnitMass` REAL, `purchaseUnitMassUom` TEXT, `cost` REAL NOT NULL, `hasVariations` INTEGER NOT NULL, `outletOrderVisible` INTEGER NOT NULL, `active` INTEGER NOT NULL, `defaultWarehouseId` TEXT, PRIMARY KEY(`id`))");
        db.execSQL("CREATE TABLE IF NOT EXISTS `product_variations` (`id` TEXT NOT NULL, `productId` TEXT NOT NULL, `sku` TEXT, `name` TEXT NOT NULL, `imageUrl` TEXT, `purchasePackUnit` TEXT NOT NULL, `consumptionUom` TEXT NOT NULL, `unitsPerPurchasePack` REAL NOT NULL, `transferUnit` TEXT NOT NULL, `transferQuantity` REAL NOT NULL, `purchaseUnitMass` REAL, `purchaseUnitMassUom` TEXT, `cost` REAL NOT NULL, `active` INTEGER NOT NULL, `outletOrderVisible` INTEGER NOT NULL, `defaultWarehouseId` TEXT, PRIMARY KEY(`id`))");
        db.execSQL("CREATE TABLE IF NOT EXISTS `draft_cart` (`key` TEXT NOT NULL, `productId` TEXT NOT NULL, `variationId` TEXT, `name` TEXT NOT NULL, `purchasePackUnit` TEXT NOT NULL, `consumptionUom` TEXT NOT NULL, `unitPrice` REAL NOT NULL, `qty` INTEGER NOT NULL, `unitsPerPurchasePack` REAL NOT NULL, PRIMARY KEY(`key`))");
        db.execSQL("CREATE TABLE IF NOT EXISTS `pending_orders` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `outletId` TEXT NOT NULL, `employeeName` TEXT NOT NULL, `itemsJson` TEXT NOT NULL, `createdAtMillis` INTEGER NOT NULL, `attempts` INTEGER NOT NULL, `nextAttemptAtMillis` INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS room_master_table (id INTEGER PRIMARY KEY,identity_hash TEXT)");
        db.execSQL("INSERT OR REPLACE INTO room_master_table (id,identity_hash) VALUES(42, 'b80a6a202975b75da2cfa322f4e33843')");
      }

      @Override
      public void dropAllTables(@NonNull final SupportSQLiteDatabase db) {
        db.execSQL("DROP TABLE IF EXISTS `products`");
        db.execSQL("DROP TABLE IF EXISTS `product_variations`");
        db.execSQL("DROP TABLE IF EXISTS `draft_cart`");
        db.execSQL("DROP TABLE IF EXISTS `pending_orders`");
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onDestructiveMigration(db);
          }
        }
      }

      @Override
      public void onCreate(@NonNull final SupportSQLiteDatabase db) {
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onCreate(db);
          }
        }
      }

      @Override
      public void onOpen(@NonNull final SupportSQLiteDatabase db) {
        mDatabase = db;
        internalInitInvalidationTracker(db);
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onOpen(db);
          }
        }
      }

      @Override
      public void onPreMigrate(@NonNull final SupportSQLiteDatabase db) {
        DBUtil.dropFtsSyncTriggers(db);
      }

      @Override
      public void onPostMigrate(@NonNull final SupportSQLiteDatabase db) {
      }

      @Override
      @NonNull
      public RoomOpenHelper.ValidationResult onValidateSchema(
          @NonNull final SupportSQLiteDatabase db) {
        final HashMap<String, TableInfo.Column> _columnsProducts = new HashMap<String, TableInfo.Column>(16);
        _columnsProducts.put("id", new TableInfo.Column("id", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("sku", new TableInfo.Column("sku", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("name", new TableInfo.Column("name", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("imageUrl", new TableInfo.Column("imageUrl", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("purchasePackUnit", new TableInfo.Column("purchasePackUnit", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("consumptionUom", new TableInfo.Column("consumptionUom", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("unitsPerPurchasePack", new TableInfo.Column("unitsPerPurchasePack", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("transferUnit", new TableInfo.Column("transferUnit", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("transferQuantity", new TableInfo.Column("transferQuantity", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("purchaseUnitMass", new TableInfo.Column("purchaseUnitMass", "REAL", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("purchaseUnitMassUom", new TableInfo.Column("purchaseUnitMassUom", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("cost", new TableInfo.Column("cost", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("hasVariations", new TableInfo.Column("hasVariations", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("outletOrderVisible", new TableInfo.Column("outletOrderVisible", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("active", new TableInfo.Column("active", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProducts.put("defaultWarehouseId", new TableInfo.Column("defaultWarehouseId", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysProducts = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesProducts = new HashSet<TableInfo.Index>(0);
        final TableInfo _infoProducts = new TableInfo("products", _columnsProducts, _foreignKeysProducts, _indicesProducts);
        final TableInfo _existingProducts = TableInfo.read(db, "products");
        if (!_infoProducts.equals(_existingProducts)) {
          return new RoomOpenHelper.ValidationResult(false, "products(com.afterten.orders.db.ProductEntity).\n"
                  + " Expected:\n" + _infoProducts + "\n"
                  + " Found:\n" + _existingProducts);
        }
        final HashMap<String, TableInfo.Column> _columnsProductVariations = new HashMap<String, TableInfo.Column>(16);
        _columnsProductVariations.put("id", new TableInfo.Column("id", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("productId", new TableInfo.Column("productId", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("sku", new TableInfo.Column("sku", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("name", new TableInfo.Column("name", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("imageUrl", new TableInfo.Column("imageUrl", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("purchasePackUnit", new TableInfo.Column("purchasePackUnit", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("consumptionUom", new TableInfo.Column("consumptionUom", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("unitsPerPurchasePack", new TableInfo.Column("unitsPerPurchasePack", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("transferUnit", new TableInfo.Column("transferUnit", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("transferQuantity", new TableInfo.Column("transferQuantity", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("purchaseUnitMass", new TableInfo.Column("purchaseUnitMass", "REAL", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("purchaseUnitMassUom", new TableInfo.Column("purchaseUnitMassUom", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("cost", new TableInfo.Column("cost", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("active", new TableInfo.Column("active", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("outletOrderVisible", new TableInfo.Column("outletOrderVisible", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsProductVariations.put("defaultWarehouseId", new TableInfo.Column("defaultWarehouseId", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysProductVariations = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesProductVariations = new HashSet<TableInfo.Index>(0);
        final TableInfo _infoProductVariations = new TableInfo("product_variations", _columnsProductVariations, _foreignKeysProductVariations, _indicesProductVariations);
        final TableInfo _existingProductVariations = TableInfo.read(db, "product_variations");
        if (!_infoProductVariations.equals(_existingProductVariations)) {
          return new RoomOpenHelper.ValidationResult(false, "product_variations(com.afterten.orders.db.VariationEntity).\n"
                  + " Expected:\n" + _infoProductVariations + "\n"
                  + " Found:\n" + _existingProductVariations);
        }
        final HashMap<String, TableInfo.Column> _columnsDraftCart = new HashMap<String, TableInfo.Column>(9);
        _columnsDraftCart.put("key", new TableInfo.Column("key", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDraftCart.put("productId", new TableInfo.Column("productId", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDraftCart.put("variationId", new TableInfo.Column("variationId", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDraftCart.put("name", new TableInfo.Column("name", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDraftCart.put("purchasePackUnit", new TableInfo.Column("purchasePackUnit", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDraftCart.put("consumptionUom", new TableInfo.Column("consumptionUom", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDraftCart.put("unitPrice", new TableInfo.Column("unitPrice", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDraftCart.put("qty", new TableInfo.Column("qty", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDraftCart.put("unitsPerPurchasePack", new TableInfo.Column("unitsPerPurchasePack", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysDraftCart = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesDraftCart = new HashSet<TableInfo.Index>(0);
        final TableInfo _infoDraftCart = new TableInfo("draft_cart", _columnsDraftCart, _foreignKeysDraftCart, _indicesDraftCart);
        final TableInfo _existingDraftCart = TableInfo.read(db, "draft_cart");
        if (!_infoDraftCart.equals(_existingDraftCart)) {
          return new RoomOpenHelper.ValidationResult(false, "draft_cart(com.afterten.orders.db.DraftCartItemEntity).\n"
                  + " Expected:\n" + _infoDraftCart + "\n"
                  + " Found:\n" + _existingDraftCart);
        }
        final HashMap<String, TableInfo.Column> _columnsPendingOrders = new HashMap<String, TableInfo.Column>(7);
        _columnsPendingOrders.put("id", new TableInfo.Column("id", "INTEGER", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPendingOrders.put("outletId", new TableInfo.Column("outletId", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPendingOrders.put("employeeName", new TableInfo.Column("employeeName", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPendingOrders.put("itemsJson", new TableInfo.Column("itemsJson", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPendingOrders.put("createdAtMillis", new TableInfo.Column("createdAtMillis", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPendingOrders.put("attempts", new TableInfo.Column("attempts", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPendingOrders.put("nextAttemptAtMillis", new TableInfo.Column("nextAttemptAtMillis", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysPendingOrders = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesPendingOrders = new HashSet<TableInfo.Index>(0);
        final TableInfo _infoPendingOrders = new TableInfo("pending_orders", _columnsPendingOrders, _foreignKeysPendingOrders, _indicesPendingOrders);
        final TableInfo _existingPendingOrders = TableInfo.read(db, "pending_orders");
        if (!_infoPendingOrders.equals(_existingPendingOrders)) {
          return new RoomOpenHelper.ValidationResult(false, "pending_orders(com.afterten.orders.db.PendingOrderEntity).\n"
                  + " Expected:\n" + _infoPendingOrders + "\n"
                  + " Found:\n" + _existingPendingOrders);
        }
        return new RoomOpenHelper.ValidationResult(true, null);
      }
    }, "b80a6a202975b75da2cfa322f4e33843", "f8f22ed369a7ce1644c0c3c0058c750c");
    final SupportSQLiteOpenHelper.Configuration _sqliteConfig = SupportSQLiteOpenHelper.Configuration.builder(config.context).name(config.name).callback(_openCallback).build();
    final SupportSQLiteOpenHelper _helper = config.sqliteOpenHelperFactory.create(_sqliteConfig);
    return _helper;
  }

  @Override
  @NonNull
  protected InvalidationTracker createInvalidationTracker() {
    final HashMap<String, String> _shadowTablesMap = new HashMap<String, String>(0);
    final HashMap<String, Set<String>> _viewTables = new HashMap<String, Set<String>>(0);
    return new InvalidationTracker(this, _shadowTablesMap, _viewTables, "products","product_variations","draft_cart","pending_orders");
  }

  @Override
  public void clearAllTables() {
    super.assertNotMainThread();
    final SupportSQLiteDatabase _db = super.getOpenHelper().getWritableDatabase();
    try {
      super.beginTransaction();
      _db.execSQL("DELETE FROM `products`");
      _db.execSQL("DELETE FROM `product_variations`");
      _db.execSQL("DELETE FROM `draft_cart`");
      _db.execSQL("DELETE FROM `pending_orders`");
      super.setTransactionSuccessful();
    } finally {
      super.endTransaction();
      _db.query("PRAGMA wal_checkpoint(FULL)").close();
      if (!_db.inTransaction()) {
        _db.execSQL("VACUUM");
      }
    }
  }

  @Override
  @NonNull
  protected Map<Class<?>, List<Class<?>>> getRequiredTypeConverters() {
    final HashMap<Class<?>, List<Class<?>>> _typeConvertersMap = new HashMap<Class<?>, List<Class<?>>>();
    _typeConvertersMap.put(ProductDao.class, ProductDao_Impl.getRequiredConverters());
    _typeConvertersMap.put(VariationDao.class, VariationDao_Impl.getRequiredConverters());
    _typeConvertersMap.put(CartDao.class, CartDao_Impl.getRequiredConverters());
    _typeConvertersMap.put(PendingOrderDao.class, PendingOrderDao_Impl.getRequiredConverters());
    return _typeConvertersMap;
  }

  @Override
  @NonNull
  public Set<Class<? extends AutoMigrationSpec>> getRequiredAutoMigrationSpecs() {
    final HashSet<Class<? extends AutoMigrationSpec>> _autoMigrationSpecsSet = new HashSet<Class<? extends AutoMigrationSpec>>();
    return _autoMigrationSpecsSet;
  }

  @Override
  @NonNull
  public List<Migration> getAutoMigrations(
      @NonNull final Map<Class<? extends AutoMigrationSpec>, AutoMigrationSpec> autoMigrationSpecs) {
    final List<Migration> _autoMigrations = new ArrayList<Migration>();
    return _autoMigrations;
  }

  @Override
  public ProductDao productDao() {
    if (_productDao != null) {
      return _productDao;
    } else {
      synchronized(this) {
        if(_productDao == null) {
          _productDao = new ProductDao_Impl(this);
        }
        return _productDao;
      }
    }
  }

  @Override
  public VariationDao variationDao() {
    if (_variationDao != null) {
      return _variationDao;
    } else {
      synchronized(this) {
        if(_variationDao == null) {
          _variationDao = new VariationDao_Impl(this);
        }
        return _variationDao;
      }
    }
  }

  @Override
  public CartDao cartDao() {
    if (_cartDao != null) {
      return _cartDao;
    } else {
      synchronized(this) {
        if(_cartDao == null) {
          _cartDao = new CartDao_Impl(this);
        }
        return _cartDao;
      }
    }
  }

  @Override
  public PendingOrderDao pendingOrderDao() {
    if (_pendingOrderDao != null) {
      return _pendingOrderDao;
    } else {
      synchronized(this) {
        if(_pendingOrderDao == null) {
          _pendingOrderDao = new PendingOrderDao_Impl(this);
        }
        return _pendingOrderDao;
      }
    }
  }
}
