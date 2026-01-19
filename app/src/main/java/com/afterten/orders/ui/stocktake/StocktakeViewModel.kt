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
        val error: String? = null
    )

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    private var session: OutletSession? = null

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
            _ui.value = _ui.value.copy(loading = true, error = null)

            Log.d(TAG, "bindSession: fetching outlets for outletId=${session.outletId}")

            val outletsResult = runCatching { repo.listOutlets(session.token) }
            outletsResult.onSuccess { Log.d(TAG, "listOutlets returned ${it.size} outlets") }
            outletsResult.onFailure { Log.e(TAG, "listOutlets failed", it) }

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
            }

            val preferredOutlet = session.outletId.takeIf { it.isNotBlank() } ?: outlets.firstOrNull()?.id

            val (filtered, whErr) = fetchWarehouses(preferredOutlet)
            val selectedWarehouse = filtered.firstOrNull()?.id

            whErr?.let { Log.e(TAG, "listWarehousesForOutlet failed", it) }
            if (filtered.isNotEmpty()) {
                Log.d(TAG, "Warehouses loaded for outlet=$preferredOutlet: ${filtered.size}")
            }

            fun summarize(t: Throwable?): String? = t?.message?.take(140)

            val errorMessage = when {
                whErr != null -> "Unable to load warehouses: ${summarize(whErr) ?: "unknown error"}"
                outletsResult.isFailure && outlets.isEmpty() -> "Unable to load outlets: ${summarize(outletsResult.exceptionOrNull()) ?: "unknown error"}"
                outletsResult.isFailure -> "Outlets list unavailable; showing your assigned outlet"
                filtered.isEmpty() -> "No warehouses available"
                else -> null
            }

            _ui.value = _ui.value.copy(
                outlets = outlets,
                warehouses = filtered,
                filteredWarehouses = filtered,
                selectedOutletId = preferredOutlet ?: outlets.firstOrNull()?.id,
                selectedWarehouseId = selectedWarehouse,
                items = emptyList(),
                openPeriod = null,
                variance = emptyList(),
                lastCount = null,
                loading = false,
                error = errorMessage
            )

            selectedWarehouse?.let {
                refreshOpenPeriod(it)
                loadItems(it)
            }
        }
    }

    fun selectOutlet(id: String) {
        _ui.value = _ui.value.copy(loading = true, error = null, selectedOutletId = id, filteredWarehouses = emptyList(), selectedWarehouseId = null)
        viewModelScope.launch {
            val (filtered, whErr) = fetchWarehouses(id)
            val nextWarehouseId = filtered.firstOrNull()?.id
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
            nextWarehouseId?.let {
                refreshOpenPeriod(it)
                loadItems(it)
            }
        }
    }

    fun selectWarehouse(id: String) {
        _ui.value = _ui.value.copy(selectedWarehouseId = id, openPeriod = null, variance = emptyList(), error = null)
        viewModelScope.launch {
            refreshOpenPeriod(id)
            loadItems(id)
        }
    }

    fun startStocktake(note: String?) {
        val jwt = session?.token ?: return
        val warehouseId = _ui.value.selectedWarehouseId ?: return
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val existing = runCatching { repo.fetchOpenPeriod(jwt, warehouseId) }.getOrNull()
            if (existing != null) {
                _ui.value = _ui.value.copy(openPeriod = existing, loading = false, error = null)
                return@launch
            }
            runCatching { repo.startPeriod(jwt, warehouseId, note) }
                .onSuccess { period ->
                    _ui.value = _ui.value.copy(openPeriod = period, loading = false, error = null)
                }
                .onFailure { err ->
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    fun recordCount(itemId: String, qty: Double, variantKey: String, kind: String) {
        val jwt = session?.token ?: return
        val periodId = _ui.value.openPeriod?.id ?: return
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.recordCount(jwt, periodId, itemId, qty, variantKey, kind) }
                .onSuccess { count ->
                    _ui.value = _ui.value.copy(lastCount = count, loading = false, error = null)
                }
                .onFailure { err ->
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    fun closePeriod() {
        val jwt = session?.token ?: return
        val periodId = _ui.value.openPeriod?.id ?: return
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.closePeriod(jwt, periodId) }
                .onSuccess { period ->
                    _ui.value = _ui.value.copy(openPeriod = period, loading = false, error = null)
                }
                .onFailure { err ->
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    fun loadVariance() {
        val jwt = session?.token ?: return
        val periodId = _ui.value.openPeriod?.id ?: return
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.fetchVariances(jwt, periodId) }
                .onSuccess { rows ->
                    _ui.value = _ui.value.copy(variance = rows, loading = false, error = null)
                }
                .onFailure { err ->
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    fun loadVarianceFor(periodId: String) {
        val jwt = session?.token ?: return
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.fetchVariances(jwt, periodId) }
                .onSuccess { rows ->
                    val current = _ui.value
                    val activePeriod = current.openPeriod?.takeIf { it.id == periodId }
                    _ui.value = current.copy(openPeriod = activePeriod, variance = rows, loading = false, error = null)
                }
                .onFailure { err ->
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    fun loadPeriod(periodId: String) {
        val jwt = session?.token ?: return
        viewModelScope.launch {
            runCatching { repo.fetchPeriodById(jwt, periodId) }
                .onSuccess { period ->
                    _ui.value = _ui.value.copy(openPeriod = period, error = null)
                }
                .onFailure { err ->
                    _ui.value = _ui.value.copy(error = err.message)
                }
        }
    }

    private suspend fun refreshOpenPeriod(warehouseId: String) {
        val jwt = session?.token ?: return
        runCatching { repo.fetchOpenPeriod(jwt, warehouseId) }
            .onSuccess { period ->
                _ui.value = _ui.value.copy(openPeriod = period, error = null)
            }
            .onFailure { err ->
                _ui.value = _ui.value.copy(error = err.message)
            }
    }

    private suspend fun loadItems(warehouseId: String) {
        val jwt = session?.token ?: return
        runCatching { repo.listWarehouseItems(jwt, warehouseId, null) }
            .onSuccess { fetched ->
                // Show all variants and base entries for the warehouse.
                _ui.value = _ui.value.copy(items = fetched, error = null)
            }
            .onFailure { err ->
                _ui.value = _ui.value.copy(error = err.message)
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
