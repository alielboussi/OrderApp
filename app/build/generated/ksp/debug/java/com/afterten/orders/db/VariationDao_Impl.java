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
public final class VariationDao_Impl implements VariationDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<VariationEntity> __insertionAdapterOfVariationEntity;

  private final SharedSQLiteStatement __preparedStmtOfClearForProduct;

  public VariationDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfVariationEntity = new EntityInsertionAdapter<VariationEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `product_variations` (`id`,`productId`,`name`,`imageUrl`,`uom`,`cost`,`active`) VALUES (?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final VariationEntity entity) {
        statement.bindString(1, entity.getId());
        statement.bindString(2, entity.getProductId());
        statement.bindString(3, entity.getName());
        if (entity.getImageUrl() == null) {
          statement.bindNull(4);
        } else {
          statement.bindString(4, entity.getImageUrl());
        }
        statement.bindString(5, entity.getUom());
        statement.bindDouble(6, entity.getCost());
        final int _tmp = entity.getActive() ? 1 : 0;
        statement.bindLong(7, _tmp);
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
  public Flow<List<VariationEntity>> listenByProduct(final String productId) {
    final String _sql = "select * from product_variations where productId = ? and active = 1 order by name";
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
          final int _cursorIndexOfName = CursorUtil.getColumnIndexOrThrow(_cursor, "name");
          final int _cursorIndexOfImageUrl = CursorUtil.getColumnIndexOrThrow(_cursor, "imageUrl");
          final int _cursorIndexOfUom = CursorUtil.getColumnIndexOrThrow(_cursor, "uom");
          final int _cursorIndexOfCost = CursorUtil.getColumnIndexOrThrow(_cursor, "cost");
          final int _cursorIndexOfActive = CursorUtil.getColumnIndexOrThrow(_cursor, "active");
          final List<VariationEntity> _result = new ArrayList<VariationEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final VariationEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpProductId;
            _tmpProductId = _cursor.getString(_cursorIndexOfProductId);
            final String _tmpName;
            _tmpName = _cursor.getString(_cursorIndexOfName);
            final String _tmpImageUrl;
            if (_cursor.isNull(_cursorIndexOfImageUrl)) {
              _tmpImageUrl = null;
            } else {
              _tmpImageUrl = _cursor.getString(_cursorIndexOfImageUrl);
            }
            final String _tmpUom;
            _tmpUom = _cursor.getString(_cursorIndexOfUom);
            final double _tmpCost;
            _tmpCost = _cursor.getDouble(_cursorIndexOfCost);
            final boolean _tmpActive;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfActive);
            _tmpActive = _tmp != 0;
            _item = new VariationEntity(_tmpId,_tmpProductId,_tmpName,_tmpImageUrl,_tmpUom,_tmpCost,_tmpActive);
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
