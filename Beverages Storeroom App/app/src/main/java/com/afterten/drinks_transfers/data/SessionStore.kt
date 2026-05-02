package com.afterten.drinks_transfers.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.sessionDataStore by preferencesDataStore(name = "session_store")

class SessionStore(private val context: Context) {
  private val tokenKey = stringPreferencesKey("token")
  private val userIdKey = stringPreferencesKey("user_id")
  private val emailKey = stringPreferencesKey("email")
  private val displayNameKey = stringPreferencesKey("display_name")
  private val loginAtKey = longPreferencesKey("login_at_ms")
  private val lastTransferWarehouseKey = stringPreferencesKey("last_transfer_to_warehouse")
  private val lastPurchaseSupplierKey = stringPreferencesKey("last_purchase_supplier")
  private val lastPurchaseWarehouseKey = stringPreferencesKey("last_purchase_warehouse")

  suspend fun readSession(): StoredSession? {
    val data = context.sessionDataStore.data.first()
    val token = data[tokenKey]
    val userId = data[userIdKey]
    val email = data[emailKey]
    val displayName = data[displayNameKey]
    val loginAt = data[loginAtKey]
    return if (!token.isNullOrBlank() && !userId.isNullOrBlank() && !email.isNullOrBlank() && loginAt != null) {
      StoredSession(token, userId, email, displayName, loginAt)
    } else {
      null
    }
  }

  suspend fun saveSession(
    token: String,
    userId: String,
    email: String,
    displayName: String?,
    loginAtMs: Long
  ) {
    context.sessionDataStore.edit { prefs ->
      prefs[tokenKey] = token
      prefs[userIdKey] = userId
      prefs[emailKey] = email
      if (displayName.isNullOrBlank()) {
        prefs.remove(displayNameKey)
      } else {
        prefs[displayNameKey] = displayName
      }
      prefs[loginAtKey] = loginAtMs
    }
  }

  suspend fun clearSession() {
    context.sessionDataStore.edit { prefs ->
      prefs.remove(tokenKey)
      prefs.remove(userIdKey)
      prefs.remove(emailKey)
      prefs.remove(displayNameKey)
      prefs.remove(loginAtKey)
    }
  }

  suspend fun getLastTransferWarehouseId(): String? {
    return context.sessionDataStore.data.first()[lastTransferWarehouseKey]
  }

  suspend fun setLastTransferWarehouseId(warehouseId: String) {
    context.sessionDataStore.edit { prefs ->
      prefs[lastTransferWarehouseKey] = warehouseId
    }
  }

  suspend fun getLastPurchaseSupplierId(): String? {
    return context.sessionDataStore.data.first()[lastPurchaseSupplierKey]
  }

  suspend fun setLastPurchaseSupplierId(supplierId: String) {
    context.sessionDataStore.edit { prefs ->
      prefs[lastPurchaseSupplierKey] = supplierId
    }
  }

  suspend fun getLastPurchaseWarehouseId(): String? {
    return context.sessionDataStore.data.first()[lastPurchaseWarehouseKey]
  }

  suspend fun setLastPurchaseWarehouseId(warehouseId: String) {
    context.sessionDataStore.edit { prefs ->
      prefs[lastPurchaseWarehouseKey] = warehouseId
    }
  }
}

data class StoredSession(
  val token: String,
  val userId: String,
  val email: String,
  val displayName: String?,
  val loginAtMs: Long
)
