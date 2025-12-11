package com.afterten.orders.db;

import android.database.Cursor;
import android.os.CancellationSignal;
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
import java.lang.Long;
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

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class PendingOrderDao_Impl implements PendingOrderDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<PendingOrderEntity> __insertionAdapterOfPendingOrderEntity;

  private final SharedSQLiteStatement __preparedStmtOfDelete;

  private final SharedSQLiteStatement __preparedStmtOfUpdateBackoff;

  public PendingOrderDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfPendingOrderEntity = new EntityInsertionAdapter<PendingOrderEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `pending_orders` (`id`,`outletId`,`employeeName`,`itemsJson`,`createdAtMillis`,`attempts`,`nextAttemptAtMillis`) VALUES (nullif(?, 0),?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final PendingOrderEntity entity) {
        statement.bindLong(1, entity.getId());
        statement.bindString(2, entity.getOutletId());
        statement.bindString(3, entity.getEmployeeName());
        statement.bindString(4, entity.getItemsJson());
        statement.bindLong(5, entity.getCreatedAtMillis());
        statement.bindLong(6, entity.getAttempts());
        statement.bindLong(7, entity.getNextAttemptAtMillis());
      }
    };
    this.__preparedStmtOfDelete = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "delete from pending_orders where id = ?";
        return _query;
      }
    };
    this.__preparedStmtOfUpdateBackoff = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "update pending_orders set attempts = ?, nextAttemptAtMillis = ? where id = ?";
        return _query;
      }
    };
  }

  @Override
  public Object upsert(final PendingOrderEntity entity,
      final Continuation<? super Long> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Long>() {
      @Override
      @NonNull
      public Long call() throws Exception {
        __db.beginTransaction();
        try {
          final Long _result = __insertionAdapterOfPendingOrderEntity.insertAndReturnId(entity);
          __db.setTransactionSuccessful();
          return _result;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object delete(final long id, final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfDelete.acquire();
        int _argIndex = 1;
        _stmt.bindLong(_argIndex, id);
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
          __preparedStmtOfDelete.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object updateBackoff(final long id, final int attempts, final long nextAt,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfUpdateBackoff.acquire();
        int _argIndex = 1;
        _stmt.bindLong(_argIndex, attempts);
        _argIndex = 2;
        _stmt.bindLong(_argIndex, nextAt);
        _argIndex = 3;
        _stmt.bindLong(_argIndex, id);
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
          __preparedStmtOfUpdateBackoff.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object due(final long now,
      final Continuation<? super List<PendingOrderEntity>> $completion) {
    final String _sql = "select * from pending_orders where nextAttemptAtMillis <= ? order by createdAtMillis asc";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, now);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<PendingOrderEntity>>() {
      @Override
      @NonNull
      public List<PendingOrderEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfOutletId = CursorUtil.getColumnIndexOrThrow(_cursor, "outletId");
          final int _cursorIndexOfEmployeeName = CursorUtil.getColumnIndexOrThrow(_cursor, "employeeName");
          final int _cursorIndexOfItemsJson = CursorUtil.getColumnIndexOrThrow(_cursor, "itemsJson");
          final int _cursorIndexOfCreatedAtMillis = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMillis");
          final int _cursorIndexOfAttempts = CursorUtil.getColumnIndexOrThrow(_cursor, "attempts");
          final int _cursorIndexOfNextAttemptAtMillis = CursorUtil.getColumnIndexOrThrow(_cursor, "nextAttemptAtMillis");
          final List<PendingOrderEntity> _result = new ArrayList<PendingOrderEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final PendingOrderEntity _item;
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final String _tmpOutletId;
            _tmpOutletId = _cursor.getString(_cursorIndexOfOutletId);
            final String _tmpEmployeeName;
            _tmpEmployeeName = _cursor.getString(_cursorIndexOfEmployeeName);
            final String _tmpItemsJson;
            _tmpItemsJson = _cursor.getString(_cursorIndexOfItemsJson);
            final long _tmpCreatedAtMillis;
            _tmpCreatedAtMillis = _cursor.getLong(_cursorIndexOfCreatedAtMillis);
            final int _tmpAttempts;
            _tmpAttempts = _cursor.getInt(_cursorIndexOfAttempts);
            final long _tmpNextAttemptAtMillis;
            _tmpNextAttemptAtMillis = _cursor.getLong(_cursorIndexOfNextAttemptAtMillis);
            _item = new PendingOrderEntity(_tmpId,_tmpOutletId,_tmpEmployeeName,_tmpItemsJson,_tmpCreatedAtMillis,_tmpAttempts,_tmpNextAttemptAtMillis);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}
