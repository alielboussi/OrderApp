package com.afterten.orders

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.afterten.orders.data.OutletSession
import com.afterten.orders.data.SupabaseProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.afterten.orders.db.AppDatabase
import com.afterten.orders.db.DraftCartItemEntity

class RootViewModel(application: Application) : AndroidViewModel(application) {
    val supabaseProvider = SupabaseProvider(application)
    private val db = AppDatabase.get(application)
    private val cartDao = db.cartDao()

    private val _session = MutableStateFlow<OutletSession?>(null)
    val session: StateFlow<OutletSession?> = _session

    fun setSession(session: OutletSession?) {
        _session.value = session
    }

    // --- Cart state ---
    data class CartItem(
        val productId: String,
        val variationId: String?,
        val name: String,
        val uom: String,
        val unitPrice: Double,
        val qty: Int
    ) {
        val key: String get() = "$productId:${variationId ?: ""}"
        val lineTotal: Double get() = unitPrice * qty
    }

    private val _cart = MutableStateFlow<Map<String, CartItem>>(emptyMap())
    val cart: StateFlow<Map<String, CartItem>> = _cart.asStateFlow()

    private fun key(productId: String, variationId: String?): String = "$productId:${variationId ?: ""}"

    fun setQty(
        productId: String,
        variationId: String?,
        name: String,
        uom: String,
        unitPrice: Double,
        qty: Int
    ) {
        _cart.value = _cart.value.toMutableMap().also { m ->
            val k = key(productId, variationId)
            if (qty <= 0) {
                m.remove(k)
            } else {
                m[k] = CartItem(productId, variationId, name, uom, unitPrice, qty)
            }
        }
        // Persist to DB
        viewModelScope.launch {
            val k = key(productId, variationId)
            if (qty <= 0) cartDao.deleteByKey(k) else cartDao.upsert(
                DraftCartItemEntity(
                    key = k,
                    productId = productId,
                    variationId = variationId,
                    name = name,
                    uom = uom,
                    unitPrice = unitPrice,
                    qty = qty
                )
            )
        }
    }

    fun inc(productId: String, variationId: String?, name: String, uom: String, unitPrice: Double) {
        val k = key(productId, variationId)
        val curr = _cart.value[k]?.qty ?: 0
        setQty(productId, variationId, name, uom, unitPrice, curr + 1)
    }

    fun dec(productId: String, variationId: String?, name: String, uom: String, unitPrice: Double) {
        val k = key(productId, variationId)
        val curr = _cart.value[k]?.qty ?: 0
        setQty(productId, variationId, name, uom, unitPrice, (curr - 1).coerceAtLeast(0))
    }

    fun qty(productId: String, variationId: String?): Int = _cart.value[key(productId, variationId)]?.qty ?: 0

    fun itemCount(): Int = _cart.value.values.sumOf { it.qty }
    fun subtotal(): Double = _cart.value.values.sumOf { it.lineTotal }

    init {
        // Load existing draft cart from DB and keep in sync
        viewModelScope.launch {
            cartDao.listenAll().collect { list ->
                _cart.value = list.associateBy(
                    keySelector = { it.key },
                    valueTransform = { CartItem(it.productId, it.variationId, it.name, it.uom, it.unitPrice, it.qty) }
                )
            }
        }
    }

    fun clearCart() {
        _cart.value = emptyMap()
        viewModelScope.launch { cartDao.clear() }
    }
}
