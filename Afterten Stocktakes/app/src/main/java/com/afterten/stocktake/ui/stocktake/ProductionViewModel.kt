package com.afterten.stocktake.ui.stocktake

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.afterten.stocktake.data.OutletSession
import com.afterten.stocktake.data.SupabaseProvider
import com.afterten.stocktake.data.repo.StocktakeRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.math.floor

class ProductionViewModel(
    private val supabase: SupabaseProvider,
    private val stocktakeRepo: StocktakeRepository
) : ViewModel() {

    companion object {
        private const val TAG = "Production"
    }

    data class IngredientDetail(
        val ingredientId: String,
        val ingredientName: String,
        val onHand: Double,
        val neededPerUnit: Double,
        val servings: Double
    )

    data class ProductionRow(
        val itemId: String,
        val itemName: String,
        val variantKey: String,
        val maxProducible: Double,
        val producedQty: Double,
        val diffQty: Double,
        val details: List<IngredientDetail>
    )

    data class UiState(
        val warehouses: List<SupabaseProvider.Warehouse> = emptyList(),
        val selectedWarehouseId: String? = null,
        val openPeriod: StocktakeRepository.StockPeriod? = null,
        val ingredientStock: List<SupabaseProvider.WarehouseStockItem> = emptyList(),
        val productionRows: List<ProductionRow> = emptyList(),
        val savingItemIds: Set<String> = emptySet(),
        val loading: Boolean = false,
        val error: String? = null
    )

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    private var session: OutletSession? = null

    private fun normalizeVariantKey(value: String?): String {
        val raw = value?.trim()?.lowercase().orEmpty()
        return if (raw.isBlank()) "base" else raw
    }

    private fun normalizeUom(value: String?): String = value?.trim()?.lowercase().orEmpty()

    private fun isEachLike(value: String?): Boolean {
        val normalized = normalizeUom(value)
        return normalized.isBlank() || normalized in setOf("each", "pc", "piece", "pieces")
    }

    private fun convertUomQty(
        qty: Double,
        from: String?,
        to: String?,
        conversions: Map<String, Double>
    ): Double {
        val fromKey = normalizeUom(from)
        val toKey = normalizeUom(to)
        if (fromKey.isBlank() || toKey.isBlank() || fromKey == toKey) return qty
        val direct = conversions["$fromKey|$toKey"]
        if (direct != null) return qty * direct
        val reverse = conversions["$toKey|$fromKey"]
        if (reverse != null && reverse != 0.0) return qty / reverse
        return qty
    }

    private suspend fun fetchWarehouses(): Pair<List<SupabaseProvider.Warehouse>, Throwable?> {
        val jwt = session?.token ?: return emptyList<SupabaseProvider.Warehouse>() to null
        val result = runCatching {
            val outletIds = buildList {
                session?.outletId?.takeIf { it.isNotBlank() }?.let { add(it) }
                if (isEmpty()) {
                    addAll(stocktakeRepo.listWhoamiOutlets(jwt).mapNotNull { it.outletId.takeIf(String::isNotBlank) })
                }
            }
            if (outletIds.isEmpty()) {
                return@runCatching stocktakeRepo.listWarehouses(jwt)
            }
            val warehouseIds = stocktakeRepo.listWarehouseIdsForOutlets(jwt, outletIds, true)
            stocktakeRepo.listWarehousesByIds(jwt, warehouseIds)
        }
        val warehouses = result.getOrElse { emptyList<SupabaseProvider.Warehouse>() }.filter { it.active }
        return warehouses to result.exceptionOrNull()
    }

    fun bindSession(session: OutletSession?) {
        this.session = session
        if (session == null) {
            _ui.value = UiState()
            return
        }
        viewModelScope.launch {
            _ui.value = _ui.value.copy(loading = true, error = null)
            val (warehouses, err) = fetchWarehouses()
            val preferred = warehouses.firstOrNull()?.id
            _ui.value = _ui.value.copy(
                warehouses = warehouses,
                selectedWarehouseId = preferred,
                loading = false,
                error = err?.message
            )
            preferred?.let { loadProduction(it) }
        }
    }

    fun selectWarehouse(id: String) {
        _ui.value = _ui.value.copy(selectedWarehouseId = id, error = null)
        viewModelScope.launch { loadProduction(id) }
    }

    private suspend fun loadProduction(warehouseId: String) {
        val jwt = session?.token ?: return
        _ui.value = _ui.value.copy(loading = true, error = null)
        try {
            val openPeriod = stocktakeRepo.fetchOpenPeriod(jwt, warehouseId)
            val assignments = supabase.listProductionAssignments(jwt, warehouseId)
            val finishedIds = assignments.map { it.finishedItemId }.distinct()

            val ingredientStock = supabase.listWarehouseBalanceItems(
                jwt = jwt,
                warehouseId = warehouseId,
                kinds = listOf("ingredient", "raw"),
                search = null,
                baseOnly = true
            )
            val stockByItem = ingredientStock.associate { it.itemId to (it.netUnits ?: 0.0) }

            val recipes = supabase.listProductionRecipes(jwt, finishedIds)
                .filter { it.active != false }
                .filter { it.sourceWarehouseId == null || it.sourceWarehouseId == warehouseId }

            val itemIds = (recipes.map { it.finishedItemId } + recipes.map { it.ingredientItemId }).distinct()
            val itemRows = supabase.listProductionCatalogItems(jwt, itemIds)
            val itemById = itemRows.associateBy { it.id }

            val conversions = supabase.listUomConversions(jwt)
                .filter { it.active != false }
                .associate { row ->
                    "${normalizeUom(row.fromUom)}|${normalizeUom(row.toUom)}" to row.multiplier
                }

            val producedRows = supabase.listProductionEntries(jwt, warehouseId, openPeriod?.id)
            val producedByItem = producedRows.groupBy { it.itemId }.mapValues { entry ->
                entry.value.sumOf { it.qtyUnits }
            }

            val rowsByFinished = mutableMapOf<String, ProductionRow>()

            recipes.forEach { recipe ->
                val finished = itemById[recipe.finishedItemId] ?: return@forEach
                val ingredient = itemById[recipe.ingredientItemId] ?: return@forEach
                val variantKey = normalizeVariantKey(recipe.finishedVariantKey)
                if (variantKey != "base") return@forEach

                val qtyPerUnit = recipe.qtyPerUnit
                val yieldUnits = (recipe.yieldQtyUnits ?: 1.0).coerceAtLeast(1.0)
                if (qtyPerUnit <= 0) return@forEach

                var componentQty = convertUomQty(qtyPerUnit, recipe.qtyUnit, ingredient.consumptionUnit, conversions)
                val purchaseUnitMass = ingredient.purchaseUnitMass ?: 0.0
                val purchaseUnitMassUom = ingredient.purchaseUnitMassUom

                if (purchaseUnitMass > 0 && !purchaseUnitMassUom.isNullOrBlank() && isEachLike(ingredient.consumptionUnit)) {
                    val converted = convertUomQty(qtyPerUnit, recipe.qtyUnit, purchaseUnitMassUom, conversions)
                    componentQty = converted / purchaseUnitMass
                }

                if (componentQty <= 0) return@forEach

                val onHand = stockByItem[ingredient.id] ?: 0.0
                val servings = floor((onHand * yieldUnits) / componentQty)

                val detail = IngredientDetail(
                    ingredientId = ingredient.id,
                    ingredientName = ingredient.name ?: "Unnamed",
                    onHand = onHand,
                    neededPerUnit = componentQty,
                    servings = servings
                )

                val key = "${recipe.finishedItemId}|$variantKey"
                val existing = rowsByFinished[key]
                if (existing == null) {
                    val producedQty = producedByItem[recipe.finishedItemId] ?: 0.0
                    rowsByFinished[key] = ProductionRow(
                        itemId = recipe.finishedItemId,
                        itemName = finished.name ?: "Unnamed",
                        variantKey = variantKey,
                        maxProducible = servings,
                        producedQty = producedQty,
                        diffQty = servings - producedQty,
                        details = listOf(detail)
                    )
                } else {
                    val nextDetails = existing.details + detail
                    val nextMax = minOf(existing.maxProducible, servings)
                    rowsByFinished[key] = existing.copy(
                        maxProducible = nextMax,
                        diffQty = nextMax - existing.producedQty,
                        details = nextDetails
                    )
                }
            }

            val rows = rowsByFinished.values.sortedBy { it.itemName }

            _ui.value = _ui.value.copy(
                openPeriod = openPeriod,
                ingredientStock = ingredientStock.sortedBy { it.itemName ?: "" },
                productionRows = rows,
                loading = false,
                error = null
            )
        } catch (err: Throwable) {
            Log.e(TAG, "loadProduction failed", err)
            _ui.value = _ui.value.copy(
                loading = false,
                error = err.message ?: "Failed to load production."
            )
        }
    }

    fun recordProduction(itemId: String, qty: Double, note: String? = null, onComplete: (Throwable?) -> Unit) {
        val jwt = session?.token
        val warehouseId = _ui.value.selectedWarehouseId
        if (jwt.isNullOrBlank() || warehouseId.isNullOrBlank()) {
            onComplete(IllegalStateException("Missing session or warehouse"))
            return
        }
        _ui.value = _ui.value.copy(savingItemIds = _ui.value.savingItemIds + itemId)
        viewModelScope.launch {
            val result = runCatching {
                supabase.recordProductionEntry(
                    jwt = jwt,
                    itemId = itemId,
                    qtyUnits = qty,
                    warehouseId = warehouseId,
                    variantKey = "base",
                    note = note
                )
            }
            result.onSuccess {
                loadProduction(warehouseId)
            }
            _ui.value = _ui.value.copy(savingItemIds = _ui.value.savingItemIds - itemId)
            onComplete(result.exceptionOrNull())
        }
    }

    class Factory(private val supabase: SupabaseProvider) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            if (modelClass.isAssignableFrom(ProductionViewModel::class.java)) {
                val repo = StocktakeRepository(supabase)
                @Suppress("UNCHECKED_CAST")
                return ProductionViewModel(supabase, repo) as T
            }
            throw IllegalArgumentException("Unknown ViewModel class")
        }
    }
}
