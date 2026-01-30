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
import java.time.Instant

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
        val productPrices: Map<String, Double> = emptyMap(),
        val selectedWarehouseId: String? = null,
        val selectedWarehouseOutlets: List<SupabaseProvider.Outlet> = emptyList(),
        val openPeriod: StocktakeRepository.StockPeriod? = null,
        val periods: List<StocktakeRepository.StockPeriod> = emptyList(),
        val periodsLoading: Boolean = false,
        val periodsError: String? = null,
        val variance: List<StocktakeRepository.VarianceRow> = emptyList(),
        val openingLockedKeys: Set<String> = emptySet(),
        val closingLockedKeys: Set<String> = emptySet(),
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

    data class VarianceReportRow(
        val itemId: String,
        val variantKey: String,
        val itemLabel: String,
        val openingQty: Double,
        val transfersQty: Double,
        val damagesQty: Double,
        val salesQty: Double,
        val expectedQty: Double,
        val closingQty: Double,
        val varianceQty: Double,
        val varianceAmount: Double
    )

    data class VarianceReport(
        val period: StocktakeRepository.StockPeriod,
        val rows: List<VarianceReportRow>,
        val generatedAt: String
    )

    data class CountInput(
        val itemId: String,
        val qty: Double,
        val variantKey: String,
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
            Log.d(TAG, "stocktake fetchWarehouses outlets=${outletIds.size} ids=$outletIds")
            if (outletIds.isEmpty()) {
                Log.e(TAG, "stocktake fetchWarehouses: no outlet ids from session or whoami.")
            }
            val warehouseIds = repo.listWarehouseIdsForOutlets(jwt, outletIds, true)
            if (warehouseIds.isEmpty()) {
                Log.w(TAG, "stocktake fetchWarehouses: outlet_warehouses returned 0 rows (RLS or missing mappings).")
            } else {
                Log.d(TAG, "stocktake fetchWarehouses warehouses=${warehouseIds.size} ids=$warehouseIds")
            }
            repo.listWarehousesByIds(jwt, warehouseIds)
        }
        val warehouses = result.getOrElse { emptyList<SupabaseProvider.Warehouse>() }
            .filter { it.active }
        return warehouses to result.exceptionOrNull()
    }

    fun bindSession(session: OutletSession?) {
        this.session = session
        if (session == null) {
            Log.e(TAG, "stocktake bindSession: session is null")
            _ui.value = UiState()
            return
        }
        viewModelScope.launch {
            Log.e(TAG, "stocktake bindSession: start user=${session.userId} outlet=${session.outletId}")
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
                Log.e(TAG, "stocktake: No mapped warehouses returned")
                pushDebug("No mapped warehouses returned")
            }

            fun summarize(t: Throwable?): String? = t?.message?.take(140)
            val errorMessage = when {
                whErr != null -> "Unable to load warehouses: ${summarize(whErr) ?: "unknown error"}"
                warehouses.isEmpty() -> "No mapped warehouses found."
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
                refreshWarehouseOutlets(it)
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
        val productPrices = products.associate { product ->
            product.id to (product.sellingPrice ?: 0.0)
        }
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
            qtyDecimals = qtyDecimals,
            productPrices = productPrices
        )
    }

    fun selectWarehouse(id: String) {
        pushDebug("selectWarehouse=$id")
        _ui.value = _ui.value.copy(selectedWarehouseId = id, openPeriod = null, variance = emptyList(), error = null)
        viewModelScope.launch {
            refreshOpenPeriod(id)
            loadItems(id)
            refreshWarehouseOutlets(id)
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
            refreshWarehouseOutlets(warehouseId)
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
        val normalizedVariant = variantKey.ifBlank { "base" }
        val key = "${itemId}|${normalizedVariant}"
        pushDebug("recordCount period=$periodId item=$itemId qty=$qty variant=$variantKey kind=$kind")
        _ui.value = _ui.value.copy(
            loading = true,
            error = null,
            openingLockedKeys = if (kind == "opening") _ui.value.openingLockedKeys + key else _ui.value.openingLockedKeys,
            closingLockedKeys = if (kind == "closing") _ui.value.closingLockedKeys + key else _ui.value.closingLockedKeys
        )
        viewModelScope.launch {
            runCatching { repo.recordCount(jwt, periodId, itemId, qty, variantKey, kind) }
                .onSuccess { count ->
                    pushDebug("recordCount success id=${count.id} kind=${count.kind} qty=${count.countedQty}")
                    _ui.value = _ui.value.copy(lastCount = count, loading = false, error = null)
                    // Refresh items so ingredient counts reflect immediately; recipe-based availability is derived from updated stock.
                    loadItems(warehouseId)
                    refreshOpeningLocks(periodId)
                    refreshClosingLocks(periodId)
                }
                .onFailure { err ->
                    Log.e(TAG, "recordCount failed", err)
                    pushDebug("recordCount failed: ${err.message}")
                    _ui.value = _ui.value.copy(loading = false, error = null)
                }
        }
    }

    fun recordCountsBatch(entries: List<CountInput>) {
        if (entries.isEmpty()) return
        val jwt = session?.token ?: return
        val periodId = _ui.value.openPeriod?.id ?: return
        val warehouseId = _ui.value.selectedWarehouseId ?: return
        val openingKeys = entries
            .filter { it.kind == "opening" }
            .map { "${it.itemId}|${it.variantKey.ifBlank { "base" }}" }
        val closingKeys = entries
            .filter { it.kind == "closing" }
            .map { "${it.itemId}|${it.variantKey.ifBlank { "base" }}" }
        _ui.value = _ui.value.copy(
            loading = true,
            error = null,
            openingLockedKeys = _ui.value.openingLockedKeys + openingKeys,
            closingLockedKeys = _ui.value.closingLockedKeys + closingKeys
        )
        viewModelScope.launch {
            var last: StocktakeRepository.StockCount? = null
            var hadFailure = false
            entries.forEach { entry ->
                runCatching {
                    repo.recordCount(jwt, periodId, entry.itemId, entry.qty, entry.variantKey, entry.kind)
                }.onSuccess { count ->
                    last = count
                }.onFailure { err ->
                    hadFailure = true
                    Log.e(TAG, "recordCount batch failed", err)
                    pushDebug("recordCount batch failed: ${err.message}")
                }
            }
            _ui.value = _ui.value.copy(lastCount = last, loading = false, error = if (hadFailure) "Some counts failed to save." else null)
            loadItems(warehouseId)
            refreshOpeningLocks(periodId)
            refreshClosingLocks(periodId)
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
                    val cutoffUtc = period.closedAt ?: Instant.now().toString()
                    runCatching { repo.setPosSyncCutoffForWarehouse(jwt, period.warehouseId, cutoffUtc) }
                        .onSuccess { pushDebug("pos sync cutoff updated for warehouse=${period.warehouseId} cutoff=$cutoffUtc") }
                        .onFailure { err ->
                            Log.e(TAG, "setPosSyncCutoffForWarehouse failed", err)
                            pushDebug("setPosSyncCutoffForWarehouse failed: ${err.message}")
                        }
                    _ui.value = _ui.value.copy(
                        openPeriod = null,
                        openingLockedKeys = emptySet(),
                        closingLockedKeys = emptySet(),
                        lastCount = null,
                        loading = false,
                        error = null
                    )
                    refreshOpenPeriod(warehouseId)
                    loadItems(warehouseId)
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

                    val openingKeys = opening.map { row ->
                        val variantKey = row.variantKey?.ifBlank { "base" } ?: "base"
                        "${row.itemId}|${variantKey}"
                    }.toSet()
                    val closingKeys = closing.map { row ->
                        val variantKey = row.variantKey?.ifBlank { "base" } ?: "base"
                        "${row.itemId}|${variantKey}"
                    }.toSet()

                    _ui.value = _ui.value.copy(
                        periodOpeningCounts = toDisplay(opening, "opening"),
                        periodClosingCounts = toDisplay(closing, "closing"),
                        openingLockedKeys = openingKeys,
                        closingLockedKeys = closingKeys,
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
                    period?.warehouseId?.let {
                        loadItems(it)
                        refreshWarehouseOutlets(it)
                    }
                    period?.id?.let {
                        refreshOpeningLocks(it)
                        refreshClosingLocks(it)
                    }
                }
                .onFailure { err ->
                    pushDebug("loadPeriod failed: ${err.message}")
                    _ui.value = _ui.value.copy(error = err.message)
                }
        }
    }

    suspend fun buildVarianceReport(periodId: String): VarianceReport {
        val jwt = session?.token ?: error("No session")
        val period = repo.fetchPeriodById(jwt, periodId) ?: error("Stocktake period not found")
        val openedAt = period.openedAt ?: error("Period missing opening time")
        val closedAt = period.closedAt ?: java.time.ZonedDateTime.now(java.time.ZoneId.of("Africa/Lusaka"))
            .toString()

        val varianceRows = repo.fetchVariances(jwt, periodId)
        val openingCounts = repo.listCountsForPeriod(jwt, periodId, "opening")
        val closingCounts = repo.listCountsForPeriod(jwt, periodId, "closing")
        val includedKeys = (openingCounts + closingCounts)
            .map { row -> "${row.itemId}|${row.variantKey?.ifBlank { "base" } ?: "base"}".lowercase() }
            .toSet()

        val ledgerRows = repo.listStockLedgerForPeriod(jwt, period.warehouseId, openedAt, closedAt)
        val transfersByKey = mutableMapOf<String, Double>()
        val damagesByKey = mutableMapOf<String, Double>()
        val salesByKey = mutableMapOf<String, Double>()

        ledgerRows.forEach { row ->
            val key = "${row.itemId}|${row.variantKey?.ifBlank { "base" } ?: "base"}".lowercase()
            when (row.reason?.lowercase()) {
                "warehouse_transfer" -> {
                    transfersByKey[key] = (transfersByKey[key] ?: 0.0) + row.deltaUnits
                }
                "damage" -> {
                    damagesByKey[key] = (damagesByKey[key] ?: 0.0) + row.deltaUnits
                }
                "outlet_sale" -> {
                    salesByKey[key] = (salesByKey[key] ?: 0.0) + kotlin.math.abs(row.deltaUnits)
                }
            }
        }

        val variationMap = _ui.value.variations
            .groupBy { it.productId }
            .mapValues { entry ->
                entry.value.associateBy { v -> v.key?.trim()?.lowercase() ?: v.id.trim().lowercase() }
            }

        fun variantLabel(itemId: String, variantKey: String): String {
            if (variantKey.equals("base", ignoreCase = true)) return ""
            val variant = variationMap[itemId]?.get(variantKey.lowercase())
            return variant?.name?.ifBlank { variantKey } ?: variantKey
        }

        val priceMap = _ui.value.productPrices

        val rows = varianceRows
            .filter { row ->
                val key = "${row.itemId}|${row.variantKey?.ifBlank { "base" } ?: "base"}".lowercase()
                includedKeys.isEmpty() || includedKeys.contains(key)
            }
            .map { row ->
                val variantKey = row.variantKey?.ifBlank { "base" } ?: "base"
                val key = "${row.itemId}|${variantKey}".lowercase()
                val baseName = row.itemName ?: row.itemId
                val variant = variantLabel(row.itemId, variantKey)
                val label = if (variant.isBlank()) baseName else "$baseName ($variant)"
                val transfers = transfersByKey[key] ?: 0.0
                val damages = damagesByKey[key] ?: 0.0
                val sales = salesByKey[key] ?: 0.0
                val expected = row.openingQty + transfers + damages - sales
                val closing = row.closingQty
                val varianceQty = expected - closing
                val sellingPrice = priceMap[row.itemId] ?: 0.0
                val varianceAmount = varianceQty * sellingPrice
                VarianceReportRow(
                    itemId = row.itemId,
                    variantKey = variantKey,
                    itemLabel = label,
                    openingQty = row.openingQty,
                    transfersQty = transfers,
                    damagesQty = damages,
                    salesQty = sales,
                    expectedQty = expected,
                    closingQty = closing,
                    varianceQty = varianceQty,
                    varianceAmount = varianceAmount
                )
            }
            .sortedBy { it.itemLabel.lowercase() }

        val nowLabel = java.time.ZonedDateTime.now(java.time.ZoneId.of("Africa/Lusaka"))
            .toString()

        return VarianceReport(period = period, rows = rows, generatedAt = nowLabel)
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

    private fun refreshClosingLocks(periodId: String) {
        val jwt = session?.token ?: return
        viewModelScope.launch {
            runCatching { repo.listStockCountsForPeriod(jwt, periodId, "closing") }
                .onSuccess { rows ->
                    val keys = rows.map { row ->
                        val variant = row.variantKey?.ifBlank { "base" } ?: "base"
                        "${row.itemId}|${variant}"
                    }.toSet()
                    _ui.value = _ui.value.copy(closingLockedKeys = keys)
                }
                .onFailure { err ->
                    pushDebug("refreshClosingLocks failed: ${err.message}")
                }
        }
    }

    private fun refreshWarehouseOutlets(warehouseId: String) {
        val jwt = session?.token ?: return
        viewModelScope.launch {
            runCatching { repo.listOutletsForWarehouse(jwt, warehouseId, true) }
                .onSuccess { outlets ->
                    _ui.value = _ui.value.copy(selectedWarehouseOutlets = outlets)
                }
                .onFailure { err ->
                    pushDebug("refreshWarehouseOutlets failed: ${err.message}")
                }
        }
    }

    private fun pickDisplayItems(items: List<SupabaseProvider.WarehouseStockItem>): List<SupabaseProvider.WarehouseStockItem> {
        val total = items.size

        val grouped = items.groupBy { it.itemId }
        val result = grouped.values.mapNotNull { group ->
            group.firstOrNull { (it.variantKey ?: "base").lowercase() == "base" } ?: group.firstOrNull()
        }
            .distinctBy { it.itemId }
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

        pushDebug("pickDisplayItems total=$total result=${result.size} excluded=${excluded.size}")
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
                    pushDebug("list_warehouse_items empty for warehouse=$warehouseId")
                    _ui.value = _ui.value.copy(
                        items = emptyList(),
                        loading = false,
                        error = "No stocktake items found for this warehouse."
                    )
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
