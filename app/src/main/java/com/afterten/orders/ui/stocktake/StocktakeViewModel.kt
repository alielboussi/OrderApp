package com.afterten.orders.ui.stocktake

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

    data class UiState(
        val outlets: List<SupabaseProvider.Outlet> = emptyList(),
        val warehouses: List<SupabaseProvider.Warehouse> = emptyList(),
        val filteredWarehouses: List<SupabaseProvider.Warehouse> = emptyList(),
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

    fun bindSession(session: OutletSession?) {
        this.session = session
        if (session == null) {
            _ui.value = UiState()
            return
        }
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, error = null)

            val outletsResult = runCatching { repo.listOutlets(session.token) }
            val warehousesResult = runCatching { repo.listWarehouses(session.token) }

            val outlets = outletsResult.getOrElse {
                // Fallback to the session's outlet so the UI still works when the full list fails
                listOf(SupabaseProvider.Outlet(id = session.outletId, name = session.outletName))
            }
            val warehouses = warehousesResult.getOrElse { emptyList() }

            val preferredOutlet = session.outletId.takeIf { it.isNotBlank() } ?: outlets.firstOrNull()?.id
            val hasOutletMapping = warehouses.any { it.outletId != null }
            val filtered = when {
                hasOutletMapping && preferredOutlet != null -> warehouses.filter { it.outletId == preferredOutlet }
                else -> warehouses
            }
            val selectedWarehouse = filtered.firstOrNull()?.id

            fun summarize(t: Throwable?): String? = t?.message?.take(140)

            val errorMessage = when {
                warehousesResult.isFailure -> "Unable to load warehouses: ${summarize(warehousesResult.exceptionOrNull()) ?: "unknown error"}"
                outletsResult.isFailure && outlets.isEmpty() -> "Unable to load outlets: ${summarize(outletsResult.exceptionOrNull()) ?: "unknown error"}"
                outletsResult.isFailure -> "Outlets list unavailable; showing your assigned outlet"
                hasOutletMapping && preferredOutlet != null && filtered.isEmpty() -> "No warehouses available for this outlet"
                else -> null
            }

            _ui.value = _ui.value.copy(
                outlets = outlets,
                warehouses = warehouses,
                filteredWarehouses = filtered,
                selectedOutletId = preferredOutlet,
                selectedWarehouseId = selectedWarehouse,
                openPeriod = null,
                variance = emptyList(),
                lastCount = null,
                loading = false,
                error = errorMessage
            )

            selectedWarehouse?.let { refreshOpenPeriod(it) }
        }
    }

    fun selectOutlet(id: String) {
        val current = _ui.value
        val filtered = current.warehouses.filter { it.outletId == id }
        val nextWarehouseId = filtered.firstOrNull()?.id
        _ui.value = current.copy(
            selectedOutletId = id,
            filteredWarehouses = filtered,
            selectedWarehouseId = nextWarehouseId,
            openPeriod = null,
            variance = emptyList(),
            lastCount = null,
            error = if (filtered.isEmpty()) "No warehouses available for this outlet" else null
        )
        nextWarehouseId?.let { viewModelScope.launch { refreshOpenPeriod(it) } }
    }

    fun selectWarehouse(id: String) {
        _ui.value = _ui.value.copy(selectedWarehouseId = id, openPeriod = null, variance = emptyList(), error = null)
        viewModelScope.launch { refreshOpenPeriod(id) }
    }

    fun startStocktake(note: String?) {
        val jwt = session?.token ?: return
        val warehouseId = _ui.value.selectedWarehouseId ?: return
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
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

    class Factory(
        private val supabase: SupabaseProvider
    ) : androidx.lifecycle.ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return StocktakeViewModel(StocktakeRepository(supabase)) as T
        }
    }
}
