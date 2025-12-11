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
public final class CartDao_Impl implements CartDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<DraftCartItemEntity> __insertionAdapterOfDraftCartItemEntity;

  private final SharedSQLiteStatement __preparedStmtOfDeleteByKey;

  private final SharedSQLiteStatement __preparedStmtOfClear;

  public CartDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfDraftCartItemEntity = new EntityInsertionAdapter<DraftCartItemEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `draft_cart` (`key`,`productId`,`variationId`,`name`,`purchasePackUnit`,`consumptionUom`,`unitPrice`,`qty`,`unitsPerPurchasePack`) VALUES (?,?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final DraftCartItemEntity entity) {
        statement.bindString(1, entity.getKey());
        statement.bindString(2, entity.getProductId());
        if (entity.getVariationId() == null) {
          statement.bindNull(3);
        } else {
          statement.bindString(3, entity.getVariationId());
        }
        statement.bindString(4, entity.getName());
        statement.bindString(5, entity.getPurchasePackUnit());
        statement.bindString(6, entity.getConsumptionUom());
        statement.bindDouble(7, entity.getUnitPrice());
        statement.bindLong(8, entity.getQty());
        statement.bindDouble(9, entity.getUnitsPerPurchasePack());
      }
    };
    this.__preparedStmtOfDeleteByKey = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "delete from draft_cart where `key` = ?";
        return _query;
      }
    };
    this.__preparedStmtOfClear = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "delete from draft_cart";
        return _query;
      }
    };
  }

  @Override
  public Object upsert(final DraftCartItemEntity entity,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfDraftCartItemEntity.insert(entity);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object deleteByKey(final String key, final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfDeleteByKey.acquire();
        int _argIndex = 1;
        _stmt.bindString(_argIndex, key);
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
          __preparedStmtOfDeleteByKey.release(_stmt);
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
  public Flow<List<DraftCartItemEntity>> listenAll() {
    final String _sql = "select * from draft_cart order by name";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"draft_cart"}, new Callable<List<DraftCartItemEntity>>() {
      @Override
      @NonNull
      public List<DraftCartItemEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfKey = CursorUtil.getColumnIndexOrThrow(_cursor, "key");
          final int _cursorIndexOfProductId = CursorUtil.getColumnIndexOrThrow(_cursor, "productId");
          final int _cursorIndexOfVariationId = CursorUtil.getColumnIndexOrThrow(_cursor, "variationId");
          final int _cursorIndexOfName = CursorUtil.getColumnIndexOrThrow(_cursor, "name");
          final int _cursorIndexOfPurchasePackUnit = CursorUtil.getColumnIndexOrThrow(_cursor, "purchasePackUnit");
          final int _cursorIndexOfConsumptionUom = CursorUtil.getColumnIndexOrThrow(_cursor, "consumptionUom");
          final int _cursorIndexOfUnitPrice = CursorUtil.getColumnIndexOrThrow(_cursor, "unitPrice");
          final int _cursorIndexOfQty = CursorUtil.getColumnIndexOrThrow(_cursor, "qty");
          final int _cursorIndexOfUnitsPerPurchasePack = CursorUtil.getColumnIndexOrThrow(_cursor, "unitsPerPurchasePack");
          final List<DraftCartItemEntity> _result = new ArrayList<DraftCartItemEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final DraftCartItemEntity _item;
            final String _tmpKey;
            _tmpKey = _cursor.getString(_cursorIndexOfKey);
            final String _tmpProductId;
            _tmpProductId = _cursor.getString(_cursorIndexOfProductId);
            final String _tmpVariationId;
            if (_cursor.isNull(_cursorIndexOfVariationId)) {
              _tmpVariationId = null;
            } else {
              _tmpVariationId = _cursor.getString(_cursorIndexOfVariationId);
            }
            final String _tmpName;
            _tmpName = _cursor.getString(_cursorIndexOfName);
            final String _tmpPurchasePackUnit;
            _tmpPurchasePackUnit = _cursor.getString(_cursorIndexOfPurchasePackUnit);
            final String _tmpConsumptionUom;
            _tmpConsumptionUom = _cursor.getString(_cursorIndexOfConsumptionUom);
            final double _tmpUnitPrice;
            _tmpUnitPrice = _cursor.getDouble(_cursorIndexOfUnitPrice);
            final int _tmpQty;
            _tmpQty = _cursor.getInt(_cursorIndexOfQty);
            final double _tmpUnitsPerPurchasePack;
            _tmpUnitsPerPurchasePack = _cursor.getDouble(_cursorIndexOfUnitsPerPurchasePack);
            _item = new DraftCartItemEntity(_tmpKey,_tmpProductId,_tmpVariationId,_tmpName,_tmpPurchasePackUnit,_tmpConsumptionUom,_tmpUnitPrice,_tmpQty,_tmpUnitsPerPurchasePack);
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
