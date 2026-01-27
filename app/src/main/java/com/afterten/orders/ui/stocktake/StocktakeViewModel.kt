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
        val warehouses: List<SupabaseProvider.Warehouse> = emptyList(),
        val allItems: List<SupabaseProvider.WarehouseStockItem> = emptyList(),
        val items: List<SupabaseProvider.WarehouseStockItem> = emptyList(),
        val variations: List<SupabaseProvider.SimpleVariation> = emptyList(),
        val periodOpeningCounts: List<PeriodCountDisplay> = emptyList(),
        val periodClosingCounts: List<PeriodCountDisplay> = emptyList(),
        val periodCountsLoading: Boolean = false,
        val periodCountsError: String? = null,
        val recipeIngredients: Map<String, List<String>> = emptyMap(),
        val recipeIngredientsLoading: Set<String> = emptySet(),
        val recipeIngredientsError: String? = null,
        val productUoms: Map<String, String> = emptyMap(),
        val stocktakeUoms: Map<String, String> = emptyMap(),
        val qtyDecimals: Map<String, Int> = emptyMap(),
        val selectedWarehouseId: String? = null,
        val openPeriod: StocktakeRepository.StockPeriod? = null,
        val periods: List<StocktakeRepository.StockPeriod> = emptyList(),
        val periodsLoading: Boolean = false,
        val periodsError: String? = null,
        val variance: List<StocktakeRepository.VarianceRow> = emptyList(),
        val openingLockedKeys: Set<String> = emptySet(),
        val lastCount: StocktakeRepository.StockCount? = null,
        val loading: Boolean = false,
        val error: String? = null,
        val debug: List<String> = emptyList()
    )

    data class PeriodCountDisplay(
        val itemId: String,
        val itemName: String,
        val variantKey: String,
        val variantName: String,
        val qty: Double,
        val kind: String
    )

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    private var session: OutletSession? = null

    private fun pushDebug(message: String) {
        val next = (_ui.value.debug + "[${System.currentTimeMillis()}] $message").takeLast(80)
        _ui.value = _ui.value.copy(debug = next)
        Log.d(TAG, message)
    }

    private suspend fun fetchWarehouses(): Pair<List<SupabaseProvider.Warehouse>, Throwable?> {
        val jwt = session?.token ?: return emptyList<SupabaseProvider.Warehouse>() to null
        val result = runCatching {
            val outletIds = buildList {
                session?.outletId?.takeIf { it.isNotBlank() }?.let { add(it) }
                if (isEmpty()) {
                    addAll(repo.listWhoamiOutlets(jwt).mapNotNull { it.outletId.takeIf(String::isNotBlank) })
                }
            }
            val warehouseIds = repo.listWarehouseIdsForOutlets(jwt, outletIds, true)
            repo.listWarehousesByIds(jwt, warehouseIds)
        }
        val warehouses = result.getOrElse { emptyList<SupabaseProvider.Warehouse>() }
            .filter { it.active }
        return warehouses to result.exceptionOrNull()
    }

    fun bindSession(session: OutletSession?) {
        this.session = session
        if (session == null) {
            _ui.value = UiState()
            return
        }
        viewModelScope.launch {
            pushDebug("bindSession: start")
            _ui.value = _ui.value.copy(loading = true, error = null)

            viewModelScope.launch {
                loadReferenceData(session.token)
            }

            val warehousesResult = runCatching { fetchWarehouses() }
            val (warehouses, whErr) = warehousesResult.getOrElse { emptyList<SupabaseProvider.Warehouse>() to it }
            val current = _ui.value
            val retainedWarehouse = current.selectedWarehouseId?.takeIf { id -> warehouses.any { it.id == id } }
            val preferredWarehouse = retainedWarehouse ?: warehouses.firstOrNull()?.id
            val itemsToKeep = if (retainedWarehouse != null && current.items.isNotEmpty()) current.items else emptyList()
            val openPeriodToKeep = if (retainedWarehouse != null) current.openPeriod else null

            whErr?.let { Log.e(TAG, "listWarehouses failed", it) }
            if (warehouses.isNotEmpty()) {
                pushDebug("Warehouses loaded count=${warehouses.size}")
            } else {
                pushDebug("No mapped warehouses returned")
            }

            fun summarize(t: Throwable?): String? = t?.message?.take(140)
            val errorMessage = when {
                whErr != null -> "Unable to load warehouses: ${summarize(whErr) ?: "unknown error"}"
                warehouses.isEmpty() -> "No mapped warehouses found for your outlet."
                else -> null
            }

            _ui.value = _ui.value.copy(
                warehouses = warehouses,
                selectedWarehouseId = preferredWarehouse,
                items = itemsToKeep,
                openPeriod = openPeriodToKeep,
                variance = emptyList(),
                lastCount = null,
                loading = false,
                error = errorMessage
            )

            preferredWarehouse?.let {
                refreshOpenPeriod(it)
                loadItems(it)
            }
        }
    }


    private suspend fun loadReferenceData(jwt: String) {
        val variations = runCatching { repo.listAllVariations(jwt) }
            .onFailure { pushDebug("listAllVariations failed: ${it.message}") }
            .getOrElse { emptyList() }
        val products = runCatching { repo.listActiveProducts(jwt) }
            .onFailure { pushDebug("listActiveProducts failed: ${it.message}") }
            .getOrElse { emptyList() }

        val productUoms = products.associate { product ->
            val uom = product.consumptionUom.ifBlank { product.uom.ifBlank { "each" } }
            product.id to uom
        }
        val stocktakeUoms = products.mapNotNull { product ->
            val uom = product.stocktakeUom?.ifBlank { null }
                ?: product.consumptionUom.ifBlank { product.uom.ifBlank { "each" } }
            product.id to uom
        }.toMap()
        fun decimalKey(itemId: String, variantKey: String?) = "${itemId}|${variantKey?.ifBlank { "base" } ?: "base"}".lowercase()
        val qtyDecimals = mutableMapOf<String, Int>()
        products.forEach { product ->
            product.qtyDecimalPlaces?.let { qtyDecimals[decimalKey(product.id, "base")] = it }
        }
        variations.forEach { variation ->
            val vKey = variation.key ?: variation.id
            variation.qtyDecimalPlaces?.let { qtyDecimals[decimalKey(variation.productId, vKey)] = it }
        }

        _ui.value = _ui.value.copy(
            variations = variations,
            productUoms = productUoms,
            stocktakeUoms = stocktakeUoms,
            qtyDecimals = qtyDecimals
        )
    }

    fun selectWarehouse(id: String) {
        pushDebug("selectWarehouse=$id")
        _ui.value = _ui.value.copy(selectedWarehouseId = id, openPeriod = null, variance = emptyList(), error = null)
        viewModelScope.launch {
            refreshOpenPeriod(id)
            loadItems(id)
        }
    }

    fun refreshItems() {
        val jwt = session?.token ?: return
        val warehouseId = _ui.value.selectedWarehouseId ?: return
        pushDebug("refreshItems warehouse=$warehouseId")
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            loadReferenceData(jwt)
            refreshOpenPeriod(warehouseId)
            loadItems(warehouseId)
        }
    }

    fun startStocktake(note: String?) {
        val jwt = session?.token ?: return
        val warehouseId = _ui.value.selectedWarehouseId ?: return
        pushDebug("startStocktake for warehouse=$warehouseId note=${note?.take(30)}")
        Log.d(TAG, "startStocktake: warehouse=$warehouseId note=${note?.take(120)}")
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            Log.d(TAG, "startStocktake: checking existing open period")
            val existing = runCatching { repo.fetchOpenPeriod(jwt, warehouseId) }.getOrNull()
            if (existing != null) {
                Log.d(TAG, "startStocktake: open period exists id=${existing.id}")
                pushDebug("Open period already exists id=${existing.id}")
                _ui.value = _ui.value.copy(openPeriod = existing, loading = false, error = null)
                return@launch
            }
            runCatching { repo.startPeriod(jwt, warehouseId, note) }
                .onSuccess { period ->
                    Log.d(TAG, "startStocktake: started id=${period.id} number=${period.stocktakeNumber}")
                    pushDebug("Started period id=${period.id} number=${period.stocktakeNumber}")
                    _ui.value = _ui.value.copy(openPeriod = period, loading = false, error = null)
                }
                .onFailure { err ->
                    Log.e(TAG, "startStocktake failed", err)
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
                    refreshOpeningLocks(periodId)
                }
                .onFailure { err ->
                    Log.e(TAG, "recordCount failed", err)
                    pushDebug("recordCount failed: ${err.message}")
                    _ui.value = _ui.value.copy(loading = false, error = null)
                }
        }
    }

    fun closePeriod() {
        val jwt = session?.token ?: return
        val periodId = _ui.value.openPeriod?.id ?: return
        val warehouseId = _ui.value.selectedWarehouseId ?: return
        pushDebug("closePeriod id=$periodId")
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { repo.closePeriod(jwt, periodId) }
                .onSuccess { period ->
                    pushDebug("closePeriod success id=${period.id}")
                    val newPeriod = runCatching { repo.startPeriod(jwt, warehouseId, "Auto-opened from ${period.stocktakeNumber ?: period.id}") }
                        .onFailure { err -> pushDebug("auto startPeriod failed: ${err.message}") }
                        .getOrNull()

                    if (newPeriod != null) {
                        val closingCounts = runCatching { repo.listClosingCountsForPeriod(jwt, periodId) }
                            .onFailure { err -> pushDebug("listClosingCountsForPeriod failed: ${err.message}") }
                            .getOrElse { emptyList() }

                        closingCounts.forEach { row ->
                            val key = row.variantKey?.ifBlank { "base" } ?: "base"
                            runCatching {
                                repo.recordCount(
                                    jwt = jwt,
                                    periodId = newPeriod.id,
                                    itemId = row.itemId,
                                    qty = row.countedQty,
                                    variantKey = key,
                                    kind = "opening",
                                    context = mapOf(
                                        "source" to "auto-carryover",
                                        "from_period_id" to periodId
                                    )
                                )
                            }.onFailure { err ->
                                pushDebug("auto opening record failed item=${row.itemId} variant=$key: ${err.message}")
                            }
                        }
                        _ui.value = _ui.value.copy(openPeriod = newPeriod, loading = false, error = null)
                        refreshOpeningLocks(newPeriod.id)
                        loadItems(warehouseId)
                    } else {
                        _ui.value = _ui.value.copy(openPeriod = period, loading = false, error = null)
                    }
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

    fun loadPeriods(warehouseId: String) {
        val jwt = session?.token ?: return
        pushDebug("loadPeriods warehouse=$warehouseId")
        _ui.value = _ui.value.copy(periodsLoading = true, periodsError = null)
        viewModelScope.launch {
            runCatching { repo.listPeriods(jwt, warehouseId) }
                .onSuccess { rows ->
                    pushDebug("periods fetched=${rows.size}")
                    _ui.value = _ui.value.copy(periods = rows, periodsLoading = false, periodsError = null)
                }
                .onFailure { err ->
                    pushDebug("loadPeriods failed: ${err.message}")
                    _ui.value = _ui.value.copy(periodsLoading = false, periodsError = err.message)
                }
        }
    }

    fun loadPeriodCounts(periodId: String) {
        val jwt = session?.token ?: return
        pushDebug("loadPeriodCounts period=$periodId")
        _ui.value = _ui.value.copy(periodCountsLoading = true, periodCountsError = null)
        viewModelScope.launch {
            runCatching {
                val opening = repo.listCountsForPeriod(jwt, periodId, "opening")
                val closing = repo.listCountsForPeriod(jwt, periodId, "closing")
                val catalog = repo.listCatalogItemsForStocktake(jwt)
                Triple(opening, closing, catalog)
            }
                .onSuccess { (opening, closing, catalog) ->
                    val itemNameMap = catalog.associate { it.itemId to (it.itemName ?: "Item") }
                    val variantMap = _ui.value.variations
                        .groupBy { it.productId }
                        .mapValues { entry ->
                            entry.value.associateBy { v ->
                                v.key?.trim()?.lowercase() ?: v.id.trim().lowercase()
                            }
                        }

                    fun formatVariantName(itemId: String, keyRaw: String?): String {
                        val key = keyRaw?.trim()?.ifBlank { "base" } ?: "base"
                        if (key.equals("base", ignoreCase = true)) return "Base"
                        val lookup = key.lowercase()
                        val variation = variantMap[itemId]?.get(lookup)
                        return variation?.name ?: key
                    }

                    fun toDisplay(rows: List<StocktakeRepository.StockCountRow>, kind: String): List<PeriodCountDisplay> {
                        return rows.map { row ->
                            val itemName = itemNameMap[row.itemId] ?: "Item"
                            val variantKey = row.variantKey?.ifBlank { "base" } ?: "base"
                            PeriodCountDisplay(
                                itemId = row.itemId,
                                itemName = itemName,
                                variantKey = variantKey,
                                variantName = formatVariantName(row.itemId, variantKey),
                                qty = row.countedQty,
                                kind = kind
                            )
                        }
                    }

                    _ui.value = _ui.value.copy(
                        periodOpeningCounts = toDisplay(opening, "opening"),
                        periodClosingCounts = toDisplay(closing, "closing"),
                        periodCountsLoading = false,
                        periodCountsError = null
                    )
                }
                .onFailure { err ->
                    pushDebug("loadPeriodCounts failed: ${err.message}")
                    _ui.value = _ui.value.copy(periodCountsLoading = false, periodCountsError = err.message)
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
                        error = null
                    )
                    period?.warehouseId?.let { loadItems(it) }
                    period?.id?.let { refreshOpeningLocks(it) }
                }
                .onFailure { err ->
                    pushDebug("loadPeriod failed: ${err.message}")
                    _ui.value = _ui.value.copy(error = err.message)
                }
        }
    }

    private fun refreshOpeningLocks(periodId: String) {
        val jwt = session?.token ?: return
        viewModelScope.launch {
            runCatching { repo.listStockCountsForPeriod(jwt, periodId, "opening") }
                .onSuccess { rows ->
                    val keys = rows.map { row ->
                        val variant = row.variantKey?.ifBlank { "base" } ?: "base"
                        "${row.itemId}|${variant}"
                    }.toSet()
                    _ui.value = _ui.value.copy(openingLockedKeys = keys)
                }
                .onFailure { err ->
                    pushDebug("refreshOpeningLocks failed: ${err.message}")
                }
        }
    }

    private fun pickDisplayItems(items: List<SupabaseProvider.WarehouseStockItem>): List<SupabaseProvider.WarehouseStockItem> {
        val total = items.size

        val nonIngredients = items.filterNot { it.itemKind?.equals("ingredient", ignoreCase = true) == true }
        val grouped = nonIngredients.groupBy { it.itemId }
        val variantSelections = grouped.values.flatMap { group ->
            group.filter { (it.variantKey ?: "base").lowercase() != "base" }
        }
        val recipeBases = grouped.values.mapNotNull { group ->
            val hasRecipe = group.any { it.hasRecipe == true }
            if (!hasRecipe) return@mapNotNull null
            group.firstOrNull { (it.variantKey ?: "base").lowercase() == "base" } ?: group.firstOrNull()
        }
        val baseSingles = grouped.values.mapNotNull { group ->
            val hasNonBase = group.any { (it.variantKey ?: "base").lowercase() != "base" }
            val hasRecipe = group.any { it.hasRecipe == true }
            if (hasNonBase || hasRecipe) return@mapNotNull null
            group.firstOrNull { (it.variantKey ?: "base").lowercase() == "base" } ?: group.firstOrNull()
        }

        val result = (recipeBases + variantSelections + baseSingles)
            .distinctBy { it.itemId to (it.variantKey ?: "base") }
            .sortedBy { it.itemName ?: it.itemId }

        val excluded = items.filterNot { candidate ->
            result.any { it.itemId == candidate.itemId && (it.variantKey ?: "base") == (candidate.variantKey ?: "base") }
        }

        fun exclusionReason(item: SupabaseProvider.WarehouseStockItem): String {
            val isIngredient = item.itemKind?.equals("ingredient", ignoreCase = true) == true
            val isBaseVariant = (item.variantKey ?: "base").lowercase() == "base"
            return when {
                isIngredient -> "ingredient"
                isBaseVariant -> "base-finished"
                else -> "deduped-or-unexpected"
            }
        }

        pushDebug("pickDisplayItems total=$total recipeBases=${recipeBases.size} variants=${variantSelections.size} result=${result.size} excluded=${excluded.size}")
        excluded.take(6).forEach { row ->
            pushDebug("excluded id=${row.itemId} name=${row.itemName} kind=${row.itemKind} variant=${row.variantKey} hasRecipe=${row.hasRecipe} reason=${exclusionReason(row)}")
        }

        return result
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
        pushDebug("loadItems warehouse=$warehouseId")
        _ui.value = _ui.value.copy(items = emptyList(), loading = true, error = null)
        runCatching { repo.listWarehouseItems(jwt, warehouseId, null, null) }
            .onSuccess { fetched ->
                pushDebug("list_warehouse_items fetched=${fetched.size}")
                fetched.take(5).forEach { row ->
                    pushDebug("item sample id=${row.itemId} name=${row.itemName} kind=${row.itemKind} variant=${row.variantKey} hasRecipe=${row.hasRecipe}")
                }
                val direct = runCatching { repo.listWarehouseIngredientsDirect(jwt, warehouseId) }
                    .onFailure { pushDebug("warehouse_stock_items failed: ${it.message}") }
                    .getOrElse { emptyList() }
                val combined = (fetched + direct)
                    .distinctBy { it.itemId to (it.variantKey ?: "base") }
                val display = pickDisplayItems(combined)
                if (display.isNotEmpty()) {
                    pushDebug("list_warehouse_items display=${display.size}")
                    _ui.value = _ui.value.copy(allItems = combined, items = display, loading = false, error = null)
                } else {
                    pushDebug("list_warehouse_items empty; trying catalog_items")
                    runCatching { repo.listCatalogItemsForStocktake(jwt) }
                        .onSuccess { catalogItems ->
                            val catalogDisplay = pickDisplayItems(catalogItems)
                            pushDebug("catalog_items fetched=${catalogItems.size} display=${catalogDisplay.size}")
                            _ui.value = _ui.value.copy(items = catalogDisplay, loading = false, error = null)
                        }
                        .onFailure { err ->
                            pushDebug("catalog_items failed: ${err.message}")
                            _ui.value = _ui.value.copy(items = emptyList(), loading = false, error = err.message)
                        }
                }
            }
            .onFailure { err ->
                pushDebug("list_warehouse_items failed: ${err.message}")
                _ui.value = _ui.value.copy(items = emptyList(), loading = false, error = err.message)
            }
    }

    fun loadRecipeIngredients(itemId: String, variantKey: String = "base") {
        val jwt = session?.token ?: return
        val normalized = variantKey.ifBlank { "base" }
        val key = "$itemId|$normalized"
        val current = _ui.value
        if (current.recipeIngredientsLoading.contains(key)) return
        if (current.recipeIngredients.containsKey(key)) return

        _ui.value = current.copy(
            recipeIngredientsLoading = current.recipeIngredientsLoading + key,
            recipeIngredientsError = null
        )

        viewModelScope.launch {
            runCatching { repo.listRecipeIngredientIds(jwt, itemId, normalized) }
                .onSuccess { ids ->
                    val updated = _ui.value
                    _ui.value = updated.copy(
                        recipeIngredients = updated.recipeIngredients + (key to ids),
                        recipeIngredientsLoading = updated.recipeIngredientsLoading - key,
                        recipeIngredientsError = null
                    )
                }
                .onFailure { err ->
                    val updated = _ui.value
                    _ui.value = updated.copy(
                        recipeIngredientsLoading = updated.recipeIngredientsLoading - key,
                        recipeIngredientsError = err.message
                    )
                    pushDebug("listRecipeIngredientIds failed: ${err.message}")
                }
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
