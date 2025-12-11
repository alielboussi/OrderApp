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
public final class ProductDao_Impl implements ProductDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<ProductEntity> __insertionAdapterOfProductEntity;

  private final SharedSQLiteStatement __preparedStmtOfClear;

  public ProductDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfProductEntity = new EntityInsertionAdapter<ProductEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `products` (`id`,`sku`,`name`,`imageUrl`,`purchasePackUnit`,`consumptionUom`,`unitsPerPurchasePack`,`transferUnit`,`transferQuantity`,`purchaseUnitMass`,`purchaseUnitMassUom`,`cost`,`hasVariations`,`outletOrderVisible`,`active`,`defaultWarehouseId`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final ProductEntity entity) {
        statement.bindString(1, entity.getId());
        if (entity.getSku() == null) {
          statement.bindNull(2);
        } else {
          statement.bindString(2, entity.getSku());
        }
        statement.bindString(3, entity.getName());
        if (entity.getImageUrl() == null) {
          statement.bindNull(4);
        } else {
          statement.bindString(4, entity.getImageUrl());
        }
        statement.bindString(5, entity.getPurchasePackUnit());
        statement.bindString(6, entity.getConsumptionUom());
        statement.bindDouble(7, entity.getUnitsPerPurchasePack());
        statement.bindString(8, entity.getTransferUnit());
        statement.bindDouble(9, entity.getTransferQuantity());
        if (entity.getPurchaseUnitMass() == null) {
          statement.bindNull(10);
        } else {
          statement.bindDouble(10, entity.getPurchaseUnitMass());
        }
        if (entity.getPurchaseUnitMassUom() == null) {
          statement.bindNull(11);
        } else {
          statement.bindString(11, entity.getPurchaseUnitMassUom());
        }
        statement.bindDouble(12, entity.getCost());
        final int _tmp = entity.getHasVariations() ? 1 : 0;
        statement.bindLong(13, _tmp);
        final int _tmp_1 = entity.getOutletOrderVisible() ? 1 : 0;
        statement.bindLong(14, _tmp_1);
        final int _tmp_2 = entity.getActive() ? 1 : 0;
        statement.bindLong(15, _tmp_2);
        if (entity.getDefaultWarehouseId() == null) {
          statement.bindNull(16);
        } else {
          statement.bindString(16, entity.getDefaultWarehouseId());
        }
      }
    };
    this.__preparedStmtOfClear = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "delete from products";
        return _query;
      }
    };
  }

  @Override
  public Object upsertAll(final List<ProductEntity> products,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfProductEntity.insert(products);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object clear(final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfClear.acquire();
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
          __preparedStmtOfClear.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Flow<List<ProductEntity>> listenProducts() {
    final String _sql = "select * from products where active = 1 and outletOrderVisible = 1 order by name";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"products"}, new Callable<List<ProductEntity>>() {
      @Override
      @NonNull
      public List<ProductEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
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
          final int _cursorIndexOfHasVariations = CursorUtil.getColumnIndexOrThrow(_cursor, "hasVariations");
          final int _cursorIndexOfOutletOrderVisible = CursorUtil.getColumnIndexOrThrow(_cursor, "outletOrderVisible");
          final int _cursorIndexOfActive = CursorUtil.getColumnIndexOrThrow(_cursor, "active");
          final int _cursorIndexOfDefaultWarehouseId = CursorUtil.getColumnIndexOrThrow(_cursor, "defaultWarehouseId");
          final List<ProductEntity> _result = new ArrayList<ProductEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ProductEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
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
            final boolean _tmpHasVariations;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfHasVariations);
            _tmpHasVariations = _tmp != 0;
            final boolean _tmpOutletOrderVisible;
            final int _tmp_1;
            _tmp_1 = _cursor.getInt(_cursorIndexOfOutletOrderVisible);
            _tmpOutletOrderVisible = _tmp_1 != 0;
            final boolean _tmpActive;
            final int _tmp_2;
            _tmp_2 = _cursor.getInt(_cursorIndexOfActive);
            _tmpActive = _tmp_2 != 0;
            final String _tmpDefaultWarehouseId;
            if (_cursor.isNull(_cursorIndexOfDefaultWarehouseId)) {
              _tmpDefaultWarehouseId = null;
            } else {
              _tmpDefaultWarehouseId = _cursor.getString(_cursorIndexOfDefaultWarehouseId);
            }
            _item = new ProductEntity(_tmpId,_tmpSku,_tmpName,_tmpImageUrl,_tmpPurchasePackUnit,_tmpConsumptionUom,_tmpUnitsPerPurchasePack,_tmpTransferUnit,_tmpTransferQuantity,_tmpPurchaseUnitMass,_tmpPurchaseUnitMassUom,_tmpCost,_tmpHasVariations,_tmpOutletOrderVisible,_tmpActive,_tmpDefaultWarehouseId);
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
