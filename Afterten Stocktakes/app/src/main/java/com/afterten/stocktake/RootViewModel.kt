package com.afterten.stocktake

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.afterten.stocktake.data.OutletSession
import com.afterten.stocktake.data.SupabaseProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.afterten.stocktake.db.AppDatabase
import com.afterten.stocktake.db.DraftCartItemEntity
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import com.afterten.stocktake.data.SessionStore
import com.afterten.stocktake.sync.OrderSyncWorker

class RootViewModel(application: Application) : AndroidViewModel(application) {
    val supabaseProvider = SupabaseProvider(application)
    private val db = AppDatabase.get(application)
    private val cartDao = db.cartDao()

    private val _session = MutableStateFlow<OutletSession?>(null)
    val session: StateFlow<OutletSession?> = _session
    private var refreshJob: Job? = null

    fun setSession(session: OutletSession?) {
        _session.value = session
        SessionStore.save(getApplication(), session)
        refreshJob?.cancel()
        if (session != null) {
            // Immediately propagate auth to realtime
            supabaseProvider.updateRealtimeAuth(session.token)
            // Start background refresh loop
            refreshJob = viewModelScope.launch {
                while (true) {
                    val waitMs = (session.expiresAtMillis - System.currentTimeMillis()).coerceAtLeast(5_000L)
                    delay(waitMs)
                    runCatching {
                        val (newJwt, newExp) = supabaseProvider.refreshAccessToken(session.refreshToken)
                        val updated = session.copy(token = newJwt, expiresAtMillis = newExp)
                        _session.value = updated
                        SessionStore.save(getApplication(), updated)
                        supabaseProvider.updateRealtimeAuth(newJwt)
                    }.onFailure {
                        // If refresh fails, wait a bit and try again; if persistently failing, break
                        delay(30_000L)
                    }
                }
            }
        }
    }

    init {
        // Restore any previous session from disk
        val restored = SessionStore.load(getApplication())
        if (restored != null) setSession(restored)
        // Kick the order sync worker once on startup
        OrderSyncWorker.enqueue(getApplication())
    }

    // --- Cart state ---
    data class CartItem(
        val productId: String,
        val variationId: String?,
        val name: String,
        val purchasePackUnit: String,
        val consumptionUom: String,
        val unitPrice: Double,
        val qty: Int,
        val unitsPerPurchasePack: Double
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
        purchasePackUnit: String,
        consumptionUom: String,
        unitPrice: Double,
        qty: Int,
        unitsPerPurchasePack: Double = 1.0
    ) {
        val k = key(productId, variationId)
        val normalizedCaseSize = when {
            unitsPerPurchasePack > 0 -> unitsPerPurchasePack
            _cart.value[k]?.unitsPerPurchasePack?.let { it > 0 } == true -> _cart.value[k]!!.unitsPerPurchasePack
            else -> 1.0
        }
        _cart.value = _cart.value.toMutableMap().also { m ->
            if (qty <= 0) {
                m.remove(k)
            } else {
                m[k] = CartItem(productId, variationId, name, purchasePackUnit, consumptionUom, unitPrice, qty, normalizedCaseSize)
            }
        }
        // Persist to DB
        viewModelScope.launch {
            if (qty <= 0) cartDao.deleteByKey(k) else cartDao.upsert(
                DraftCartItemEntity(
                    key = k,
                    productId = productId,
                    variationId = variationId,
                    name = name,
                    purchasePackUnit = purchasePackUnit,
                    consumptionUom = consumptionUom,
                    unitPrice = unitPrice,
                    qty = qty,
                    unitsPerPurchasePack = normalizedCaseSize
                )
            )
        }
    }

    fun inc(
        productId: String,
        variationId: String?,
        name: String,
        purchasePackUnit: String,
        consumptionUom: String,
        unitPrice: Double,
        unitsPerPurchasePack: Double = 1.0
    ) {
        val k = key(productId, variationId)
        val curr = _cart.value[k]?.qty ?: 0
        val normalized = when {
            unitsPerPurchasePack > 0 -> unitsPerPurchasePack
            _cart.value[k]?.unitsPerPurchasePack?.let { it > 0 } == true -> _cart.value[k]!!.unitsPerPurchasePack
            else -> 1.0
        }
        setQty(productId, variationId, name, purchasePackUnit, consumptionUom, unitPrice, curr + 1, normalized)
    }

    fun dec(
        productId: String,
        variationId: String?,
        name: String,
        purchasePackUnit: String,
        consumptionUom: String,
        unitPrice: Double,
        unitsPerPurchasePack: Double = 1.0
    ) {
        val k = key(productId, variationId)
        val curr = _cart.value[k]?.qty ?: 0
        val normalized = when {
            unitsPerPurchasePack > 0 -> unitsPerPurchasePack
            _cart.value[k]?.unitsPerPurchasePack?.let { it > 0 } == true -> _cart.value[k]!!.unitsPerPurchasePack
            else -> 1.0
        }
        setQty(productId, variationId, name, purchasePackUnit, consumptionUom, unitPrice, (curr - 1).coerceAtLeast(0), normalized)
    }

    fun qty(productId: String, variationId: String?): Int = _cart.value[key(productId, variationId)]?.qty ?: 0

    fun itemCount(): Int = _cart.value.values.sumOf { it.qty }
    fun subtotal(): Double = _cart.value.values.sumOf { it.lineTotal }

    init {
        // On fresh app start, ensure any stale draft quantities are cleared so each run starts at 0
        viewModelScope.launch {
            cartDao.clear()
            // Load draft cart (will be empty after clear) and keep in sync with DB for the session
            cartDao.listenAll().collect { list ->
                _cart.value = list.associateBy(
                    keySelector = { it.key },
                    valueTransform = {
                        CartItem(
                            it.productId,
                            it.variationId,
                            it.name,
                            it.purchasePackUnit,
                            it.consumptionUom,
                            it.unitPrice,
                            it.qty,
                            (it.unitsPerPurchasePack.takeIf { size -> size > 0 } ?: 1.0)
                        )
                    }
                )
            }
        }
    }

    fun clearCart() {
        _cart.value = emptyMap()
        viewModelScope.launch { cartDao.clear() }
    }
}
