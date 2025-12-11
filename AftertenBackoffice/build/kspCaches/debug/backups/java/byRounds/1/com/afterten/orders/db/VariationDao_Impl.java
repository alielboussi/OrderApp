package com.afterten.orders.db;

import android.database.Cursor;
import androidx.annotation.NonNull;
import androidx.room.CoroutinesRoom;
import androidx.room.EntityInsertionAdapter;
import androidx.room.RoomDatabase;
import androidx.room.RoomSQLiteQuery;
import androidx.room.SharedSQLiteStatement;
import androidx.room.util.CursorUtil;
import androidx.room.util.DBUtil;
import androidx.sqlite.db.SupportSQLiteStatement;
import java.lang.Class;
import java.lang.Double;
import java.lang.Exception;
import java.lang.Object;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import javax.annotation.processing.Generated;
import kotlin.Unit;
import kotlin.coroutines.Continuation;
import kotlinx.coroutines.flow.Flow;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class VariationDao_Impl implements VariationDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<VariationEntity> __insertionAdapterOfVariationEntity;

  private final SharedSQLiteStatement __preparedStmtOfClearForProduct;

  private final SharedSQLiteStatement __preparedStmtOfClearAll;

  public VariationDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfVariationEntity = new EntityInsertionAdapter<VariationEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `product_variations` (`id`,`productId`,`sku`,`name`,`imageUrl`,`purchasePackUnit`,`consumptionUom`,`unitsPerPurchasePack`,`transferUnit`,`transferQuantity`,`purchaseUnitMass`,`purchaseUnitMassUom`,`cost`,`active`,`outletOrderVisible`,`defaultWarehouseId`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final VariationEntity entity) {
        statement.bindString(1, entity.getId());
        statement.bindString(2, entity.getProductId());
        if (entity.getSku() == null) {
          statement.bindNull(3);
        } else {
          statement.bindString(3, entity.getSku());
        }
        statement.bindString(4, entity.getName());
        if (entity.getImageUrl() == null) {
          statement.bindNull(5);
        } else {
          statement.bindString(5, entity.getImageUrl());
        }
        statement.bindString(6, entity.getPurchasePackUnit());
        statement.bindString(7, entity.getConsumptionUom());
        statement.bindDouble(8, entity.getUnitsPerPurchasePack());
        statement.bindString(9, entity.getTransferUnit());
        statement.bindDouble(10, entity.getTransferQuantity());
        if (entity.getPurchaseUnitMass() == null) {
          statement.bindNull(11);
        } else {
          statement.bindDouble(11, entity.getPurchaseUnitMass());
        }
        if (entity.getPurchaseUnitMassUom() == null) {
          statement.bindNull(12);
        } else {
          statement.bindString(12, entity.getPurchaseUnitMassUom());
        }
        statement.bindDouble(13, entity.getCost());
        final int _tmp = entity.getActive() ? 1 : 0;
        statement.bindLong(14, _tmp);
        final int _tmp_1 = entity.getOutletOrderVisible() ? 1 : 0;
        statement.bindLong(15, _tmp_1);
        if (entity.getDefaultWarehouseId() == null) {
          statement.bindNull(16);
        } else {
          statement.bindString(16, entity.getDefaultWarehouseId());
        }
      }
    };
    this.__preparedStmtOfClearForProduct = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "delete from product_variations where productId = ?";
        return _query;
      }
    };
    this.__preparedStmtOfClearAll = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "delete from product_variations";
        return _query;
      }
    };
  }

  @Override
  public Object upsertAll(final List<VariationEntity> variations,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfVariationEntity.insert(variations);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object clearForProduct(final String productId,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfClearForProduct.acquire();
        int _argIndex = 1;
        _stmt.bindString(_argIndex, productId);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfClearForProduct.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object clearAll(final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfClearAll.acquire();
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfClearAll.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Flow<List<VariationEntity>> listenByProduct(final String productId) {
    final String _sql = "select * from product_variations where productId = ? and active = 1 and outletOrderVisible = 1 order by name";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, productId);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"product_variations"}, new Callable<List<VariationEntity>>() {
      @Override
      @NonNull
      public List<VariationEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfProductId = CursorUtil.getColumnIndexOrThrow(_cursor, "productId");
          final int _cursorIndexOfSku = CursorUtil.getColumnIndexOrThrow(_cursor, "sku");
          final int _cursorIndexOfName = CursorUtil.getColumnIndexOrThrow(_cursor, "name");
          final int _cursorIndexOfImageUrl = CursorUtil.getColumnIndexOrThrow(_cursor, "imageUrl");
          final int _cursorIndexOfPurchasePackUnit = CursorUtil.getColumnIndexOrThrow(_cursor, "purchasePackUnit");
          final int _cursorIndexOfConsumptionUom = CursorUtil.getColumnIndexOrThrow(_cursor, "consumptionUom");
          final int _cursorIndexOfUnitsPerPurchasePack = CursorUtil.getColumnIndexOrThrow(_cursor, "unitsPerPurchasePack");
          final int _cursorIndexOfTransferUnit = CursorUtil.getColumnIndexOrThrow(_cursor, "transferUnit");
          final int _cursorIndexOfTransferQuantity = CursorUtil.getColumnIndexOrThrow(_cursor, "transferQuantity");
          final int _cursorIndexOfPurchaseUnitMass = CursorUtil.getColumnIndexOrThrow(_cursor, "purchaseUnitMass");
          final int _cursorIndexOfPurchaseUnitMassUom = CursorUtil.getColumnIndexOrThrow(_cursor, "purchaseUnitMassUom");
          final int _cursorIndexOfCost = CursorUtil.getColumnIndexOrThrow(_cursor, "cost");
          final int _cursorIndexOfActive = CursorUtil.getColumnIndexOrThrow(_cursor, "active");
          final int _cursorIndexOfOutletOrderVisible = CursorUtil.getColumnIndexOrThrow(_cursor, "outletOrderVisible");
          final int _cursorIndexOfDefaultWarehouseId = CursorUtil.getColumnIndexOrThrow(_cursor, "defaultWarehouseId");
          final List<VariationEntity> _result = new ArrayList<VariationEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final VariationEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpProductId;
            _tmpProductId = _cursor.getString(_cursorIndexOfProductId);
            final String _tmpSku;
            if (_cursor.isNull(_cursorIndexOfSku)) {
              _tmpSku = null;
            } else {
              _tmpSku = _cursor.getString(_cursorIndexOfSku);
            }
            final String _tmpName;
            _tmpName = _cursor.getString(_cursorIndexOfName);
            final String _tmpImageUrl;
            if (_cursor.isNull(_cursorIndexOfImageUrl)) {
              _tmpImageUrl = null;
            } else {
              _tmpImageUrl = _cursor.getString(_cursorIndexOfImageUrl);
            }
            final String _tmpPurchasePackUnit;
            _tmpPurchasePackUnit = _cursor.getString(_cursorIndexOfPurchasePackUnit);
            final String _tmpConsumptionUom;
            _tmpConsumptionUom = _cursor.getString(_cursorIndexOfConsumptionUom);
            final double _tmpUnitsPerPurchasePack;
            _tmpUnitsPerPurchasePack = _cursor.getDouble(_cursorIndexOfUnitsPerPurchasePack);
            final String _tmpTransferUnit;
            _tmpTransferUnit = _cursor.getString(_cursorIndexOfTransferUnit);
            final double _tmpTransferQuantity;
            _tmpTransferQuantity = _cursor.getDouble(_cursorIndexOfTransferQuantity);
            final Double _tmpPurchaseUnitMass;
            if (_cursor.isNull(_cursorIndexOfPurchaseUnitMass)) {
              _tmpPurchaseUnitMass = null;
            } else {
              _tmpPurchaseUnitMass = _cursor.getDouble(_cursorIndexOfPurchaseUnitMass);
            }
            final String _tmpPurchaseUnitMassUom;
            if (_cursor.isNull(_cursorIndexOfPurchaseUnitMassUom)) {
              _tmpPurchaseUnitMassUom = null;
            } else {
              _tmpPurchaseUnitMassUom = _cursor.getString(_cursorIndexOfPurchaseUnitMassUom);
            }
            final double _tmpCost;
            _tmpCost = _cursor.getDouble(_cursorIndexOfCost);
            final boolean _tmpActive;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfActive);
            _tmpActive = _tmp != 0;
            final boolean _tmpOutletOrderVisible;
            final int _tmp_1;
            _tmp_1 = _cursor.getInt(_cursorIndexOfOutletOrderVisible);
            _tmpOutletOrderVisible = _tmp_1 != 0;
            final String _tmpDefaultWarehouseId;
            if (_cursor.isNull(_cursorIndexOfDefaultWarehouseId)) {
              _tmpDefaultWarehouseId = null;
            } else {
              _tmpDefaultWarehouseId = _cursor.getString(_cursorIndexOfDefaultWarehouseId);
            }
            _item = new VariationEntity(_tmpId,_tmpProductId,_tmpSku,_tmpName,_tmpImageUrl,_tmpPurchasePackUnit,_tmpConsumptionUom,_tmpUnitsPerPurchasePack,_tmpTransferUnit,_tmpTransferQuantity,_tmpPurchaseUnitMass,_tmpPurchaseUnitMassUom,_tmpCost,_tmpActive,_tmpOutletOrderVisible,_tmpDefaultWarehouseId);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
        }
      }

      @Override
      protected void finalize() {
        _statement.release();
      }
    });
  }

  @Override
  public Flow<List<VariationEntity>> listenAll() {
    final String _sql = "select * from product_variations where active = 1 and outletOrderVisible = 1";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"product_variations"}, new Callable<List<VariationEntity>>() {
      @Override
      @NonNull
      public List<VariationEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfProductId = CursorUtil.getColumnIndexOrThrow(_cursor, "productId");
          final int _cursorIndexOfSku = CursorUtil.getColumnIndexOrThrow(_cursor, "sku");
          final int _cursorIndexOfName = CursorUtil.getColumnIndexOrThrow(_cursor, "name");
          final int _cursorIndexOfImageUrl = CursorUtil.getColumnIndexOrThrow(_cursor, "imageUrl");
          final int _cursorIndexOfPurchasePackUnit = CursorUtil.getColumnIndexOrThrow(_cursor, "purchasePackUnit");
          final int _cursorIndexOfConsumptionUom = CursorUtil.getColumnIndexOrThrow(_cursor, "consumptionUom");
          final int _cursorIndexOfUnitsPerPurchasePack = CursorUtil.getColumnIndexOrThrow(_cursor, "unitsPerPurchasePack");
          final int _cursorIndexOfTransferUnit = CursorUtil.getColumnIndexOrThrow(_cursor, "transferUnit");
          final int _cursorIndexOfTransferQuantity = CursorUtil.getColumnIndexOrThrow(_cursor, "transferQuantity");
          final int _cursorIndexOfPurchaseUnitMass = CursorUtil.getColumnIndexOrThrow(_cursor, "purchaseUnitMass");
          final int _cursorIndexOfPurchaseUnitMassUom = CursorUtil.getColumnIndexOrThrow(_cursor, "purchaseUnitMassUom");
          final int _cursorIndexOfCost = CursorUtil.getColumnIndexOrThrow(_cursor, "cost");
          final int _cursorIndexOfActive = CursorUtil.getColumnIndexOrThrow(_cursor, "active");
          final int _cursorIndexOfOutletOrderVisible = CursorUtil.getColumnIndexOrThrow(_cursor, "outletOrderVisible");
          final int _cursorIndexOfDefaultWarehouseId = CursorUtil.getColumnIndexOrThrow(_cursor, "defaultWarehouseId");
          final List<VariationEntity> _result = new ArrayList<VariationEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final VariationEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpProductId;
            _tmpProductId = _cursor.getString(_cursorIndexOfProductId);
            final String _tmpSku;
            if (_cursor.isNull(_cursorIndexOfSku)) {
              _tmpSku = null;
            } else {
              _tmpSku = _cursor.getString(_cursorIndexOfSku);
            }
            final String _tmpName;
            _tmpName = _cursor.getString(_cursorIndexOfName);
            final String _tmpImageUrl;
            if (_cursor.isNull(_cursorIndexOfImageUrl)) {
              _tmpImageUrl = null;
            } else {
              _tmpImageUrl = _cursor.getString(_cursorIndexOfImageUrl);
            }
            final String _tmpPurchasePackUnit;
            _tmpPurchasePackUnit = _cursor.getString(_cursorIndexOfPurchasePackUnit);
            final String _tmpConsumptionUom;
            _tmpConsumptionUom = _cursor.getString(_cursorIndexOfConsumptionUom);
            final double _tmpUnitsPerPurchasePack;
            _tmpUnitsPerPurchasePack = _cursor.getDouble(_cursorIndexOfUnitsPerPurchasePack);
            final String _tmpTransferUnit;
            _tmpTransferUnit = _cursor.getString(_cursorIndexOfTransferUnit);
            final double _tmpTransferQuantity;
            _tmpTransferQuantity = _cursor.getDouble(_cursorIndexOfTransferQuantity);
            final Double _tmpPurchaseUnitMass;
            if (_cursor.isNull(_cursorIndexOfPurchaseUnitMass)) {
              _tmpPurchaseUnitMass = null;
            } else {
              _tmpPurchaseUnitMass = _cursor.getDouble(_cursorIndexOfPurchaseUnitMass);
            }
            final String _tmpPurchaseUnitMassUom;
            if (_cursor.isNull(_cursorIndexOfPurchaseUnitMassUom)) {
              _tmpPurchaseUnitMassUom = null;
            } else {
              _tmpPurchaseUnitMassUom = _cursor.getString(_cursorIndexOfPurchaseUnitMassUom);
            }
            final double _tmpCost;
            _tmpCost = _cursor.getDouble(_cursorIndexOfCost);
            final boolean _tmpActive;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfActive);
            _tmpActive = _tmp != 0;
            final boolean _tmpOutletOrderVisible;
            final int _tmp_1;
            _tmp_1 = _cursor.getInt(_cursorIndexOfOutletOrderVisible);
            _tmpOutletOrderVisible = _tmp_1 != 0;
            final String _tmpDefaultWarehouseId;
            if (_cursor.isNull(_cursorIndexOfDefaultWarehouseId)) {
              _tmpDefaultWarehouseId = null;
            } else {
              _tmpDefaultWarehouseId = _cursor.getString(_cursorIndexOfDefaultWarehouseId);
            }
            _item = new VariationEntity(_tmpId,_tmpProductId,_tmpSku,_tmpName,_tmpImageUrl,_tmpPurchasePackUnit,_tmpConsumptionUom,_tmpUnitsPerPurchasePack,_tmpTransferUnit,_tmpTransferQuantity,_tmpPurchaseUnitMass,_tmpPurchaseUnitMassUom,_tmpCost,_tmpActive,_tmpOutletOrderVisible,_tmpDefaultWarehouseId);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
        }
      }

      @Override
      protected void finalize() {
        _statement.release();
      }
    });
  }

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}
