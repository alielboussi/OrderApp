package com.afterten.stocktake.data.repo

import com.afterten.stocktake.data.SupabaseProvider
import com.afterten.stocktake.data.relaxedJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.net.URLEncoder

class StocktakeRepository(private val supabase: SupabaseProvider) {
    @Serializable
    data class RecordCountPayload(
        @SerialName("p_period_id") val periodId: String,
        @SerialName("p_item_id") val itemId: String,
        @SerialName("p_qty") val qty: Double,
        @SerialName("p_variant_key") val variantKey: String,
        @SerialName("p_kind") val kind: String,
        @SerialName("p_context") val context: Map<String, String>? = null
    )
    @Serializable
    data class StockPeriod(
        val id: String,
        @SerialName("warehouse_id") val warehouseId: String,
        @SerialName("outlet_id") val outletId: String? = null,
        val status: String,
        @SerialName("opened_at") val openedAt: String? = null,
        @SerialName("closed_at") val closedAt: String? = null,
        val note: String? = null,
        @SerialName("stocktake_number") val stocktakeNumber: String? = null
    )

    @Serializable
    data class StockCount(
        val id: String,
        @SerialName("period_id") val periodId: String,
        @SerialName("item_id") val itemId: String,
        @SerialName("variant_key") val variantKey: String? = "base",
        @SerialName("counted_qty") val countedQty: Double,
        val kind: String,
        @SerialName("counted_at") val countedAt: String? = null
    )

    @Serializable
    data class StockCountKeyRow(
        @SerialName("item_id") val itemId: String,
        @SerialName("variant_key") val variantKey: String? = "base",
        val kind: String? = null
    )

    @Serializable
    data class StockCountRow(
        @SerialName("item_id") val itemId: String,
        @SerialName("variant_key") val variantKey: String? = "base",
        @SerialName("counted_qty") val countedQty: Double,
        val kind: String? = null,
        @SerialName("counted_at") val countedAt: String? = null
    )

    @Serializable
    data class VarianceRow(
        @SerialName("period_id") val periodId: String,
        @SerialName("warehouse_id") val warehouseId: String,
        @SerialName("outlet_id") val outletId: String? = null,
        @SerialName("item_id") val itemId: String,
        @SerialName("item_name") val itemName: String? = null,
        @SerialName("variant_key") val variantKey: String? = "base",
        @SerialName("opening_qty") val openingQty: Double? = null,
        @SerialName("movement_qty") val movementQty: Double? = null,
        @SerialName("closing_qty") val closingQty: Double? = null,
        @SerialName("expected_qty") val expectedQty: Double? = null,
        @SerialName("variance_qty") val varianceQty: Double? = null,
        @SerialName("unit_cost") val unitCost: Double? = null,
        @SerialName("variance_cost") val varianceCost: Double? = null
    )

    @Serializable
    data class StockLedgerRow(
        @SerialName("item_id") val itemId: String,
        @SerialName("variant_key") val variantKey: String? = "base",
        @SerialName("delta_units") val deltaUnits: Double? = null,
        val reason: String? = null,
        @SerialName("occurred_at") val occurredAt: String? = null
    )

    private val json = relaxedJson

    suspend fun listOutlets(jwt: String) = supabase.listOutlets(jwt)

    suspend fun listWhoamiOutlets(jwt: String) = supabase.listWhoamiOutlets(jwt)

    suspend fun listWarehousesForOutlet(jwt: String, outletId: String?) = supabase.listWarehousesForOutlet(jwt, outletId)

    suspend fun listWarehouses(jwt: String) = supabase.listWarehouses(jwt)

    suspend fun listWarehouseIdsForOutlets(
        jwt: String,
        outletIds: Collection<String>,
        showInStocktakeOnly: Boolean = true
    ) = supabase.listWarehouseIdsForOutlets(jwt, outletIds, showInStocktakeOnly)

    suspend fun listOutletsForWarehouse(
        jwt: String,
        warehouseId: String,
        showInStocktakeOnly: Boolean = true
    ) = supabase.listOutletsForWarehouse(jwt, warehouseId, showInStocktakeOnly)

    suspend fun listWarehousesByIds(jwt: String, ids: Collection<String>) =
        supabase.fetchWarehousesByIds(jwt, ids)

    suspend fun listWarehouseItems(jwt: String, warehouseId: String, outletId: String?, search: String? = null) =
        supabase.listWarehouseItems(jwt, warehouseId, outletId, search)

    suspend fun listWarehouseIngredientsDirect(jwt: String, warehouseId: String) =
        supabase.listWarehouseIngredientsDirect(jwt, warehouseId)

    suspend fun listOutletProductsFallback(jwt: String, outletId: String) =
        supabase.listOutletProductsFallback(jwt, outletId)

    suspend fun listCatalogItemsForStocktake(jwt: String) =
        supabase.listCatalogItemsForStocktake(jwt)

    suspend fun listAllVariations(jwt: String) =
        supabase.listAllVariations(jwt)

    suspend fun listActiveProducts(jwt: String) =
        supabase.listActiveProducts(jwt)

    suspend fun listOutletWarehouseRoutesFallback(jwt: String, outletId: String, warehouseId: String) =
        supabase.listOutletWarehouseRoutesFallback(jwt, outletId, warehouseId)

    suspend fun listRecipeIngredientIds(jwt: String, finishedItemId: String, variantKey: String = "base") =
        supabase.listRecipeIngredientIds(jwt, finishedItemId, variantKey)

    suspend fun fetchOpenPeriod(jwt: String, warehouseId: String): StockPeriod? {
        val select = encode("id,warehouse_id,outlet_id,status,opened_at,closed_at,note,stocktake_number")
        val path = "/rest/v1/warehouse_stock_periods?select=${select}&warehouse_id=eq.${warehouseId}&status=eq.open&order=opened_at.desc&limit=1"
        val text = supabase.getWithJwt(path, jwt)
        val list = json.decodeFromString(ListSerializer(StockPeriod.serializer()), text)
        return list.firstOrNull()
    }

    suspend fun startPeriod(jwt: String, warehouseId: String, note: String?): StockPeriod {
        val payload = mutableMapOf<String, Any?>("p_warehouse_id" to warehouseId)
        if (!note.isNullOrBlank()) payload["p_note"] = note
        val (code, body) = supabase.postWithJwt(
            pathAndQuery = "/rest/v1/rpc/start_stock_period",
            jwt = jwt,
            bodyObj = payload
        )
        if (code !in 200..299) throw IllegalStateException("start_stock_period failed: HTTP ${code} ${body ?: ""}")
        val text = body ?: throw IllegalStateException("start_stock_period returned empty body")
        return json.decodeFromString(StockPeriod.serializer(), text)
    }

    suspend fun fetchPeriodById(jwt: String, periodId: String): StockPeriod? {
        val select = encode("id,warehouse_id,outlet_id,status,opened_at,closed_at,note,stocktake_number")
        val path = "/rest/v1/warehouse_stock_periods?select=${select}&id=eq.${periodId}&limit=1"
        val text = supabase.getWithJwt(path, jwt)
        val list = json.decodeFromString(ListSerializer(StockPeriod.serializer()), text)
        return list.firstOrNull()
    }

    suspend fun listPeriods(jwt: String, warehouseId: String, limit: Int = 30): List<StockPeriod> {
        val select = encode("id,warehouse_id,outlet_id,status,opened_at,closed_at,note,stocktake_number")
        val path = "/rest/v1/warehouse_stock_periods?select=${select}&warehouse_id=eq.${warehouseId}&order=opened_at.desc&limit=${limit}"
        val text = supabase.getWithJwt(path, jwt)
        return json.decodeFromString(ListSerializer(StockPeriod.serializer()), text)
    }

    suspend fun recordCount(
        jwt: String,
        periodId: String,
        itemId: String,
        qty: Double,
        variantKey: String = "base",
        kind: String = "closing",
        context: Map<String, String>? = null
    ): StockCount {
        val payload = RecordCountPayload(
            periodId = periodId,
            itemId = itemId,
            qty = qty,
            variantKey = variantKey,
            kind = kind,
            context = context?.takeIf { it.isNotEmpty() }
        )
        val (code, body) = supabase.postWithJwt(
            pathAndQuery = "/rest/v1/rpc/record_stock_count",
            jwt = jwt,
            bodyObj = payload
        )
        if (code !in 200..299) throw IllegalStateException("record_stock_count failed: HTTP ${code} ${body ?: ""}")
        val text = body ?: throw IllegalStateException("record_stock_count returned empty body")
        return json.decodeFromString(StockCount.serializer(), text)
    }

    suspend fun closePeriod(jwt: String, periodId: String): StockPeriod {
        val payload = mapOf("p_period_id" to periodId)
        val (code, body) = supabase.postWithJwt(
            pathAndQuery = "/rest/v1/rpc/close_stock_period",
            jwt = jwt,
            bodyObj = payload
        )
        if (code !in 200..299) throw IllegalStateException("close_stock_period failed: HTTP ${code} ${body ?: ""}")
        val text = body ?: throw IllegalStateException("close_stock_period returned empty body")
        return json.decodeFromString(StockPeriod.serializer(), text)
    }

    suspend fun setPosSyncOpeningForWarehouse(jwt: String, warehouseId: String, openedUtc: String) {
        val payload = mapOf(
            "p_warehouse_id" to warehouseId,
            "p_opened" to openedUtc
        )
        val (code, body) = supabase.postWithJwt(
            pathAndQuery = "/rest/v1/rpc/set_pos_sync_opening_for_warehouse",
            jwt = jwt,
            bodyObj = payload
        )
        if (code !in 200..299) throw IllegalStateException("set_pos_sync_opening_for_warehouse failed: HTTP ${code} ${body ?: ""}")
    }

    suspend fun setPosSyncCutoffForWarehouse(jwt: String, warehouseId: String, cutoffUtc: String) {
        val payload = mapOf(
            "p_warehouse_id" to warehouseId,
            "p_cutoff" to cutoffUtc
        )
        val (code, body) = supabase.postWithJwt(
            pathAndQuery = "/rest/v1/rpc/set_pos_sync_cutoff_for_warehouse",
            jwt = jwt,
            bodyObj = payload
        )
        if (code !in 200..299) throw IllegalStateException("set_pos_sync_cutoff_for_warehouse failed: HTTP ${code} ${body ?: ""}")
    }

    suspend fun fetchVariances(jwt: String, periodId: String): List<VarianceRow> {
        val select = encode("period_id,warehouse_id,outlet_id,item_id,item_name,variant_key,opening_qty,movement_qty,closing_qty,expected_qty,variance_qty,unit_cost,variance_cost")
        val path = "/rest/v1/warehouse_stock_variances?select=${select}&period_id=eq.${periodId}&order=item_id.asc"
        val text = supabase.getWithJwt(path, jwt)
        return json.decodeFromString(ListSerializer(VarianceRow.serializer()), text)
    }

    suspend fun listStockCountsForPeriod(jwt: String, periodId: String, kind: String): List<StockCountKeyRow> {
        val select = encode("item_id,variant_key,kind")
        val path = "/rest/v1/warehouse_stock_counts?select=${select}&period_id=eq.${periodId}&kind=eq.${kind}"
        val text = supabase.getWithJwt(path, jwt)
        return json.decodeFromString(ListSerializer(StockCountKeyRow.serializer()), text)
    }

    suspend fun listCountsForPeriod(jwt: String, periodId: String, kind: String): List<StockCountRow> {
        val select = encode("item_id,variant_key,counted_qty,kind,counted_at")
        val path = "/rest/v1/warehouse_stock_counts?select=${select}&period_id=eq.${periodId}&kind=eq.${kind}"
        val text = supabase.getWithJwt(path, jwt)
        return json.decodeFromString(ListSerializer(StockCountRow.serializer()), text)
    }

    suspend fun listClosingCountsForPeriod(jwt: String, periodId: String): List<StockCountRow> {
        val select = encode("item_id,variant_key,counted_qty,kind,counted_at")
        val path = "/rest/v1/warehouse_stock_counts?select=${select}&period_id=eq.${periodId}&kind=eq.closing"
        val text = supabase.getWithJwt(path, jwt)
        return json.decodeFromString(ListSerializer(StockCountRow.serializer()), text)
    }

    suspend fun listStockLedgerForPeriod(
        jwt: String,
        warehouseId: String,
        openedAt: String,
        closedAt: String
    ): List<StockLedgerRow> {
        val select = encode("item_id,variant_key,delta_units,reason,occurred_at")
        val opened = encode(openedAt)
        val closed = encode(closedAt)
        val path = "/rest/v1/stock_ledger?select=${select}" +
            "&warehouse_id=eq.${warehouseId}" +
            "&location_type=eq.warehouse" +
            "&item_id=not.is.null" +
            "&occurred_at=gte.${opened}" +
            "&occurred_at=lte.${closed}" +
            "&reason=in.(warehouse_transfer,outlet_sale,damage,recipe_consumption)"
        val text = supabase.getWithJwt(path, jwt)
        return json.decodeFromString(ListSerializer(StockLedgerRow.serializer()), text)
    }

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")
}
