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
        val selectedOutletId: String? = null,
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

            viewModelScope.launch {
                loadReferenceData(session.token)
            }

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
                        selectedOutletId = period?.outletId ?: _ui.value.selectedOutletId,
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
        val outletId = _ui.value.selectedOutletId ?: session?.outletId
        pushDebug("loadItems warehouse=$warehouseId outlet=$outletId")
        _ui.value = _ui.value.copy(items = emptyList(), loading = true, error = null)
        runCatching { repo.listWarehouseItems(jwt, warehouseId, outletId, null) }
            .onSuccess { fetched ->
                pushDebug("list_warehouse_items fetched=${fetched.size}")
                fetched.take(5).forEach { row ->
                    pushDebug("item sample id=${row.itemId} name=${row.itemName} kind=${row.itemKind} variant=${row.variantKey} hasRecipe=${row.hasRecipe}")
                }
                val direct = runCatching { repo.listWarehouseIngredientsDirect(jwt, warehouseId) }
                    .onFailure { pushDebug("warehouse_stock_items failed: ${it.message}") }
                    .getOrElse { emptyList() }
                val outletFallback = if (!outletId.isNullOrBlank()) {
                    runCatching { repo.listOutletProductsFallback(jwt, outletId) }
                        .onFailure { pushDebug("outlet_products fallback failed: ${it.message}") }
                        .getOrElse { emptyList() }
                } else {
                    emptyList()
                }
                val combined = (fetched + direct + outletFallback)
                    .distinctBy { it.itemId to (it.variantKey ?: "base") }
                val display = pickDisplayItems(combined)
                if (display.isNotEmpty()) {
                    pushDebug("list_warehouse_items display=${display.size}")
                    _ui.value = _ui.value.copy(allItems = combined, items = display, loading = false, error = null)
                } else {
                    pushDebug("list_warehouse_items empty; trying direct warehouse_stock_items")
                    runCatching { repo.listWarehouseIngredientsDirect(jwt, warehouseId) }
                        .onSuccess { direct ->
                            val directDisplay = pickDisplayItems(direct)
                            if (directDisplay.isNotEmpty()) {
                                pushDebug("warehouse_stock_items fetched=${direct.size} display=${directDisplay.size}")
                                _ui.value = _ui.value.copy(allItems = direct, items = directDisplay, loading = false, error = null)
                            } else {
                                pushDebug("warehouse_stock_items empty; trying outlet_item_routes fallback")
                                val outletKey = outletId

                                suspend fun loadOutletProductsOrCatalog(outletKey: String?) {
                                    if (outletKey.isNullOrBlank()) {
                                        pushDebug("outlet_products skipped: outletId missing; trying catalog_items")
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
                                    } else {
                                        runCatching { repo.listOutletProductsFallback(jwt, outletKey) }
                                            .onSuccess { outletRows ->
                                                val outletDisplay = pickDisplayItems(outletRows)
                                                if (outletDisplay.isNotEmpty()) {
                                                    pushDebug("outlet_products fetched=${outletRows.size} display=${outletDisplay.size}")
                                                    _ui.value = _ui.value.copy(items = outletDisplay, loading = false, error = null)
                                                } else {
                                                    pushDebug("outlet_products empty; trying catalog_items")
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
                                                pushDebug("outlet_products failed: ${err.message}")
                                                _ui.value = _ui.value.copy(items = emptyList(), loading = false, error = err.message)
                                            }
                                    }
                                }

                                if (outletKey.isNullOrBlank()) {
                                    pushDebug("outlet_item_routes skipped: outletId missing")
                                    loadOutletProductsOrCatalog(outletKey)
                                } else {
                                    runCatching { repo.listOutletWarehouseRoutesFallback(jwt, outletKey, warehouseId) }
                                        .onSuccess { routeRows ->
                                            val routeDisplay = pickDisplayItems(routeRows)
                                            if (routeDisplay.isNotEmpty()) {
                                                pushDebug("outlet_item_routes fetched=${routeRows.size} display=${routeDisplay.size}")
                                                _ui.value = _ui.value.copy(items = routeDisplay, loading = false, error = null)
                                            } else {
                                                pushDebug("outlet_item_routes empty; trying outlet_products fallback")
                                                loadOutletProductsOrCatalog(outletKey)
                                            }
                                        }
                                        .onFailure { err ->
                                            pushDebug("outlet_item_routes failed: ${err.message}")
                                            loadOutletProductsOrCatalog(outletKey)
                                        }
                                }
                            }
                        }
                        .onFailure { err ->
                            pushDebug("warehouse_stock_items failed: ${err.message}")
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
