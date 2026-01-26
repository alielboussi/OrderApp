package com.afterten.orders.ui.balances

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.afterten.orders.data.OutletSession
import com.afterten.orders.data.SupabaseProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class BalancesViewModel(
    private val supabase: SupabaseProvider
) : ViewModel() {

    data class OutletOption(
        val id: String,
        val name: String
    )

    data class WarehouseOption(
        val id: String,
        val name: String,
        val code: String? = null
    )

    data class UiState(
        val outlets: List<OutletOption> = emptyList(),
        val warehouses: List<WarehouseOption> = emptyList(),
        val selectedOutletId: String = "",
        val selectedWarehouseId: String = "",
        val items: List<SupabaseProvider.WarehouseStockItem> = emptyList(),
        val variantNames: Map<String, String> = emptyMap(),
        val itemUoms: Map<String, String> = emptyMap(),
        val loading: Boolean = false,
        val error: String? = null,
        val search: String = "",
        val includeIngredients: Boolean = true,
        val includeRaw: Boolean = true,
        val includeFinished: Boolean = false,
        val baseOnly: Boolean = false
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
        loadOutlets()
    }

    fun setSearch(value: String) {
        _ui.value = _ui.value.copy(search = value)
        reloadItems()
    }

    fun setIncludeIngredients(value: Boolean) {
        _ui.value = _ui.value.copy(includeIngredients = value)
        reloadItems()
    }

    fun setIncludeRaw(value: Boolean) {
        _ui.value = _ui.value.copy(includeRaw = value)
        reloadItems()
    }

    fun setIncludeFinished(value: Boolean) {
        _ui.value = _ui.value.copy(includeFinished = value)
        reloadItems()
    }

    fun setBaseOnly(value: Boolean) {
        _ui.value = _ui.value.copy(baseOnly = value)
        reloadItems()
    }

    fun selectOutlet(outletId: String) {
        _ui.value = _ui.value.copy(selectedOutletId = outletId, selectedWarehouseId = "", warehouses = emptyList())
        loadWarehouses(outletId)
    }

    fun selectWarehouse(warehouseId: String) {
        _ui.value = _ui.value.copy(selectedWarehouseId = warehouseId)
        reloadItems()
    }

    private fun loadOutlets() {
        val jwt = session?.token ?: return
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { supabase.listWhoamiOutlets(jwt) }
                .onSuccess { rows ->
                    val list = rows
                        .filter { it.outletId.isNotBlank() }
                        .map { OutletOption(it.outletId, it.outletName) }
                    val outlets = listOf(OutletOption("all", "All Outlets")) + list
                    val selected = outlets.firstOrNull()?.id ?: ""
                    _ui.value = _ui.value.copy(
                        outlets = outlets,
                        selectedOutletId = selected,
                        loading = false,
                        error = null
                    )
                    if (selected.isNotBlank()) {
                        loadWarehouses(selected)
                    }
                }
                .onFailure { err ->
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    private fun loadWarehouses(outletId: String) {
        val jwt = session?.token ?: return
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { supabase.listWarehousesByOutlet(jwt, outletId.takeIf { it != "all" }) }
                .onSuccess { rows ->
                    val warehouses = rows.map { WarehouseOption(it.id, it.name ?: it.code ?: it.id, it.code) }
                    val selected = warehouses.firstOrNull()?.id ?: ""
                    _ui.value = _ui.value.copy(
                        warehouses = warehouses,
                        selectedWarehouseId = selected,
                        loading = false,
                        error = null
                    )
                    if (selected.isNotBlank()) {
                        reloadItems()
                    } else {
                        _ui.value = _ui.value.copy(items = emptyList())
                    }
                }
                .onFailure { err ->
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    private fun reloadItems() {
        val jwt = session?.token ?: return
        val state = _ui.value
        val warehouseId = state.selectedWarehouseId
        if (warehouseId.isBlank()) {
            _ui.value = _ui.value.copy(items = emptyList())
            return
        }
        val kinds = buildList {
            if (state.includeIngredients) add("ingredient")
            if (state.includeRaw) add("raw")
            if (state.includeFinished) add("finished")
        }
        if (kinds.isEmpty()) {
            _ui.value = _ui.value.copy(items = emptyList())
            return
        }

        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching {
                val items = supabase.listWarehouseBalanceItems(
                    jwt = jwt,
                    warehouseId = warehouseId,
                    kinds = kinds,
                    search = state.search,
                    baseOnly = state.baseOnly
                )
                val ids = items.map { it.itemId }.distinct()
                val catalog = supabase.listCatalogItemsMeta(jwt, ids)
                items to catalog
            }
                .onSuccess { (items, catalog) ->
                    val variantNames = mutableMapOf<String, String>()
                    val itemUoms = mutableMapOf<String, String>()

                    catalog.forEach { item ->
                        val uom = item.consumptionUnit ?: item.consumptionUom ?: "each"
                        itemUoms[item.id] = uom
                        item.variants.orEmpty().forEach { variant ->
                            val name = variant.name?.trim().orEmpty()
                            if (name.isBlank()) return@forEach
                            variant.id?.let { variantNames[it] = name }
                            variant.key?.let { variantNames[it] = name }
                        }
                    }

                    _ui.value = _ui.value.copy(
                        items = items,
                        variantNames = variantNames,
                        itemUoms = itemUoms,
                        loading = false,
                        error = null
                    )
                }
                .onFailure { err ->
                    _ui.value = _ui.value.copy(loading = false, error = err.message)
                }
        }
    }

    class Factory(private val supabase: SupabaseProvider) : androidx.lifecycle.ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return BalancesViewModel(supabase) as T
        }
    }
}
