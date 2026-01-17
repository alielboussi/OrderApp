package com.afterten.orders.data.repo

import com.afterten.orders.data.SupabaseProvider
import com.afterten.orders.data.relaxedJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.net.URLEncoder

class StocktakeRepository(private val supabase: SupabaseProvider) {
    @Serializable
    data class StockPeriod(
        val id: String,
        @SerialName("warehouse_id") val warehouseId: String,
        @SerialName("outlet_id") val outletId: String,
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
    data class VarianceRow(
        @SerialName("period_id") val periodId: String,
        @SerialName("warehouse_id") val warehouseId: String,
        @SerialName("outlet_id") val outletId: String,
        @SerialName("item_id") val itemId: String,
        @SerialName("variant_key") val variantKey: String? = "base",
        @SerialName("opening_qty") val openingQty: Double = 0.0,
        @SerialName("movement_qty") val movementQty: Double = 0.0,
        @SerialName("closing_qty") val closingQty: Double = 0.0,
        @SerialName("expected_qty") val expectedQty: Double = 0.0,
        @SerialName("variance_qty") val varianceQty: Double = 0.0
    )

    private val json = relaxedJson

    suspend fun listOutlets(jwt: String) = supabase.listOutlets(jwt)

    suspend fun listWarehouses(jwt: String) = supabase.listWarehouses(jwt)

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

    suspend fun recordCount(
        jwt: String,
        periodId: String,
        itemId: String,
        qty: Double,
        variantKey: String = "base",
        kind: String = "closing",
        context: Map<String, Any?> = emptyMap()
    ): StockCount {
        val payload = mapOf(
            "p_period_id" to periodId,
            "p_item_id" to itemId,
            "p_qty" to qty,
            "p_variant_key" to variantKey,
            "p_kind" to kind,
            "p_context" to context
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

    suspend fun fetchVariances(jwt: String, periodId: String): List<VarianceRow> {
        val select = encode("period_id,warehouse_id,outlet_id,item_id,variant_key,opening_qty,movement_qty,closing_qty,expected_qty,variance_qty")
        val path = "/rest/v1/warehouse_stock_variances?select=${select}&period_id=eq.${periodId}&order=item_id.asc"
        val text = supabase.getWithJwt(path, jwt)
        return json.decodeFromString(ListSerializer(VarianceRow.serializer()), text)
    }

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")
}
