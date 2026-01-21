package com.afterten.orders.ui.stocktake

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afterten.orders.data.OutletSession
import com.afterten.orders.data.repo.StocktakeRepository
import com.afterten.orders.data.SupabaseProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class StocktakeViewModel(
    private val repo: StocktakeRepository
) : ViewModel() {

    companion object {
        private const val TAG = "Stocktake"
    }

    data class UiState(
        val outlets: List<SupabaseProvider.Outlet> = emptyList(),
        val warehouses: List<SupabaseProvider.Warehouse> = emptyList(),
        val filteredWarehouses: List<SupabaseProvider.Warehouse> = emptyList(),
        val items: List<SupabaseProvider.WarehouseStockItem> = emptyList(),
        val selectedOutletId: String? = null,
        val selectedWarehouseId: String? = null,
        val openPeriod: StocktakeRepository.StockPeriod? = null,
        val variance: List<StocktakeRepository.VarianceRow> = emptyList(),
        val lastCount: StocktakeRepository.StockCount? = null,
        val loading: Boolean = false,
        val error: String? = null,
        val debug: List<String> = emptyList()
    )

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    private var session: OutletSession? = null

    private fun pushDebug(message: String) {
        val next = (_ui.value.debug + "[${System.currentTimeMillis()}] $message").takeLast(80)
        _ui.value = _ui.value.copy(debug = next)
        Log.d(TAG, message)
    }

    private suspend fun fetchWarehouses(outletId: String?): Pair<List<SupabaseProvider.Warehouse>, Throwable?> {
        val jwt = session?.token ?: return emptyList<SupabaseProvider.Warehouse>() to null
        val result = runCatching { repo.listWarehousesForOutlet(jwt, outletId) }
        return result.getOrElse { emptyList<SupabaseProvider.Warehouse>() } to result.exceptionOrNull()
    }

    fun bindSession(session: OutletSession?) {
        this.session = session
        if (session == null) {
            _ui.value = UiState()
            return
        }
        viewModelScope.launch {
            pushDebug("bindSession: start for outletId=${session.outletId}")
            _ui.value = _ui.value.copy(loading = true, error = null)

            Log.d(TAG, "bindSession: fetching outlets for outletId=${session.outletId}")

            val outletsResult = runCatching { repo.listOutlets(session.token) }
            outletsResult.onSuccess { Log.d(TAG, "listOutlets returned ${it.size} outlets") }
            outletsResult.onFailure { Log.e(TAG, "listOutlets failed", it) }
            outletsResult.exceptionOrNull()?.let { pushDebug("listOutlets failed: ${it.message}") }

            val outlets = outletsResult.getOrElse {
                session.outletId.takeIf { it.isNotBlank() }?.let { oid ->
                    listOf(SupabaseProvider.Outlet(id = oid, name = session.outletName.ifBlank { "Outlet" }))
                } ?: emptyList()
            }.ifEmpty {
                session.outletId.takeIf { it.isNotBlank() }?.let { oid ->
                    listOf(SupabaseProvider.Outlet(id = oid, name = session.outletName.ifBlank { "Outlet" }))
                } ?: emptyList()
            }

            if (outlets.isEmpty()) {
                Log.w(TAG, "No outlets available after fetch/fallback; session outletId=${session.outletId}")
                pushDebug("No outlets available after fetch/fallback")
            }

            val preferredOutlet = session.outletId.takeIf { it.isNotBlank() } ?: outlets.firstOrNull()?.id

            val (filtered, whErr) = fetchWarehouses(preferredOutlet)
            val current = _ui.value
            val warehousesToUse = if (filtered.isNotEmpty()) filtered else current.warehouses
            val filteredWarehousesToUse = if (filtered.isNotEmpty()) filtered else current.filteredWarehouses
            val retainedWarehouse = current.selectedWarehouseId?.takeIf { id -> warehousesToUse.any { it.id == id } }
            val selectedWarehouse: String? = retainedWarehouse
            val itemsToKeep = if (retainedWarehouse != null && current.items.isNotEmpty()) current.items else emptyList()
            val openPeriodToKeep = if (retainedWarehouse != null) current.openPeriod else null

            whErr?.let { Log.e(TAG, "listWarehousesForOutlet failed", it) }
            if (filtered.isNotEmpty()) {
                Log.d(TAG, "Warehouses loaded for outlet=$preferredOutlet: ${filtered.size}")
                pushDebug("Warehouses loaded for outlet=$preferredOutlet count=${filtered.size}")
            }

            if (filtered.isEmpty()) {
                pushDebug("No warehouses returned for outlet=$preferredOutlet")
            }

            fun summarize(t: Throwable?): String? = t?.message?.take(140)

            val errorMessage = when {
                whErr != null -> "Unable to load warehouses: ${summarize(whErr) ?: "unknown error"}"
                outletsResult.isFailure && outlets.isEmpty() -> "Unable to load outlets: ${summarize(outletsResult.exceptionOrNull()) ?: "unknown error"}"
                outletsResult.isFailure -> "Outlets list unavailable; showing your assigned outlet"
                else -> null
            }

            _ui.value = _ui.value.copy(
                outlets = outlets,
                warehouses = warehousesToUse,
                filteredWarehouses = filteredWarehousesToUse,
                selectedOutletId = preferredOutlet ?: outlets.firstOrNull()?.id,
                selectedWarehouseId = selectedWarehouse,
                items = itemsToKeep,
                openPeriod = openPeriodToKeep,
                variance = emptyList(),
                lastCount = null,
                loading = false,
                error = errorMessage
            )

            selectedWarehouse?.let { loadItems(it) }
        }
    }

    fun selectOutlet(id: String) {
        pushDebug("selectOutlet=$id")
        _ui.value = _ui.value.copy(loading = true, error = null, selectedOutletId = id, filteredWarehouses = emptyList(), selectedWarehouseId = null)
        viewModelScope.launch {
            val (filtered, whErr) = fetchWarehouses(id)
            val nextWarehouseId: String? = null
            whErr?.let { pushDebug("listWarehousesForOutlet failed: ${it.message}") }
            if (filtered.isEmpty()) pushDebug("No warehouses returned for outlet=$id")
            _ui.value = _ui.value.copy(
                warehouses = filtered,
                filteredWarehouses = filtered,
                selectedWarehouseId = nextWarehouseId,
                items = emptyList(),
                openPeriod = null,
                variance = emptyList(),
                lastCount = null,
                loading = false,
                error = whErr?.message
            )
        }
    }

    fun selectWarehouse(id: String) {
        pushDebug("selectWarehouse=$id")
        _ui.value = _ui.value.copy(selectedWarehouseId = id, openPeriod = null, variance = emptyList(), error = null)
        viewModelScope.launch {
            refreshOpenPeriod(id)
            loadItems(id)
        }
    }

    fun startStocktake(note: String?) {
        val jwt = session?.token ?: return
        val warehouseId = _ui.value.selectedWarehouseId ?: return
        pushDebug("startStocktake for warehouse=$warehouseId note=${note?.take(30)}")
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val existing = runCatching { repo.fetchOpenPeriod(jwt, warehouseId) }.getOrNull()
            if (existing != null) {
                pushDebug("Open period already exists id=${existing.id}")
                _ui.value = _ui.value.copy(openPeriod = existing, loading = false, error = null)
                return@launch
            }
            runCatching { repo.startPeriod(jwt, warehouseId, note) }
                .onSuccess { period ->
                    pushDebug("Started period id=${period.id} number=${period.stocktakeNumber}")
                    _ui.value = _ui.value.copy(openPeriod = period, loading = false, error = null)
                }
                .onFailure { err ->
                    pushDebug("startStocktake failed: ${err.message}")
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    fun recordCount(itemId: String, qty: Double, variantKey: String, kind: String) {
        val jwt = session?.token ?: return
        val periodId = _ui.value.openPeriod?.id ?: return
        val warehouseId = _ui.value.selectedWarehouseId ?: return
        pushDebug("recordCount period=$periodId item=$itemId qty=$qty variant=$variantKey kind=$kind")
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.recordCount(jwt, periodId, itemId, qty, variantKey, kind) }
                .onSuccess { count ->
                    pushDebug("recordCount success id=${count.id} kind=${count.kind} qty=${count.countedQty}")
                    _ui.value = _ui.value.copy(lastCount = count, loading = false, error = null)
                    // Refresh items so ingredient counts reflect immediately; recipe-based availability is derived from updated stock.
                    loadItems(warehouseId)
                }
                .onFailure { err ->
                    pushDebug("recordCount failed: ${err.message}")
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    fun closePeriod() {
        val jwt = session?.token ?: return
        val periodId = _ui.value.openPeriod?.id ?: return
        pushDebug("closePeriod id=$periodId")
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.closePeriod(jwt, periodId) }
                .onSuccess { period ->
                    pushDebug("closePeriod success id=${period.id}")
                    _ui.value = _ui.value.copy(openPeriod = period, loading = false, error = null)
                }
                .onFailure { err ->
                    pushDebug("closePeriod failed: ${err.message}")
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    fun loadVariance() {
        val jwt = session?.token ?: return
        val periodId = _ui.value.openPeriod?.id ?: return
        pushDebug("loadVariance for period=$periodId")
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.fetchVariances(jwt, periodId) }
                .onSuccess { rows ->
                    pushDebug("variance rows fetched=${rows.size}")
                    _ui.value = _ui.value.copy(variance = rows, loading = false, error = null)
                }
                .onFailure { err ->
                    pushDebug("loadVariance failed: ${err.message}")
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    fun loadVarianceFor(periodId: String) {
        val jwt = session?.token ?: return
        pushDebug("loadVarianceFor period=$periodId")
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.fetchVariances(jwt, periodId) }
                .onSuccess { rows ->
                    val current = _ui.value
                    val activePeriod = current.openPeriod?.takeIf { it.id == periodId }
                    pushDebug("variance rows fetched=${rows.size} for period=$periodId")
                    _ui.value = current.copy(openPeriod = activePeriod, variance = rows, loading = false, error = null)
                }
                .onFailure { err ->
                    pushDebug("loadVarianceFor failed: ${err.message}")
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    fun loadPeriod(periodId: String) {
        val jwt = session?.token ?: return
        pushDebug("loadPeriod id=$periodId")
        viewModelScope.launch {
            runCatching { repo.fetchPeriodById(jwt, periodId) }
                .onSuccess { period ->
                    pushDebug("loadPeriod success status=${period?.status}")
                    _ui.value = _ui.value.copy(
                        openPeriod = period,
                        selectedWarehouseId = period?.warehouseId,
                        selectedOutletId = period?.outletId ?: _ui.value.selectedOutletId,
                        error = null
                    )
                    period?.warehouseId?.let { loadItems(it) }
                }
                .onFailure { err ->
                    pushDebug("loadPeriod failed: ${err.message}")
                    _ui.value = _ui.value.copy(error = err.message)
                }
        }
    }

    private fun pickDisplayItems(items: List<SupabaseProvider.WarehouseStockItem>): List<SupabaseProvider.WarehouseStockItem> {
        return items
            .filter { it.itemKind?.equals("ingredient", ignoreCase = true) == true }
            .sortedBy { it.itemName ?: it.itemId }
    }

    private suspend fun refreshOpenPeriod(warehouseId: String) {
        val jwt = session?.token ?: return
        pushDebug("refreshOpenPeriod warehouse=$warehouseId")
        runCatching { repo.fetchOpenPeriod(jwt, warehouseId) }
            .onSuccess { period ->
                pushDebug("refreshOpenPeriod found=${period?.id ?: "none"}")
                _ui.value = _ui.value.copy(openPeriod = period, error = null)
            }
            .onFailure { err ->
                pushDebug("refreshOpenPeriod failed: ${err.message}")
                _ui.value = _ui.value.copy(error = err.message)
            }
    }

    private suspend fun loadItems(warehouseId: String) {
        val jwt = session?.token ?: return
        val outletId = _ui.value.selectedOutletId ?: session?.outletId
        pushDebug("loadItems warehouse=$warehouseId")
        _ui.value = _ui.value.copy(items = emptyList(), loading = true, error = null)
        runCatching { repo.listWarehouseItems(jwt, warehouseId, outletId, null) }
            .onSuccess { fetched ->
                val display = pickDisplayItems(fetched)
                pushDebug("loadItems fetched=${fetched.size} display=${display.size} for warehouse=$warehouseId outlet=$outletId")
                _ui.value = _ui.value.copy(items = display, loading = false, error = null)
            }
            .onFailure { err ->
                pushDebug("loadItems failed: ${err.message}")
                _ui.value = _ui.value.copy(items = emptyList(), loading = false, error = err.message)
            }
    }

    class Factory(
        private val supabase: SupabaseProvider
    ) : androidx.lifecycle.ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return StocktakeViewModel(StocktakeRepository(supabase)) as T
        }
    }
}
