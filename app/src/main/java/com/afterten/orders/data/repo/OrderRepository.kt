package com.afterten.orders.data.repo

import com.afterten.orders.data.SupabaseProvider
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

class OrderRepository(private val supabase: SupabaseProvider) {
    @Serializable
    data class OrderRow(
        val id: String,
        @SerialName("order_number") val orderNumber: String,
        @SerialName("created_at") val createdAt: String,
        val status: String,
        @SerialName("outlet_id") val outletId: String? = null,
        @SerialName("outlets") val outlet: OutletRef? = null,
        @SerialName("modified_by_supervisor") val modifiedBySupervisor: Boolean? = null,
        @SerialName("modified_by_supervisor_name") val modifiedBySupervisorName: String? = null
    )

    @Serializable
    data class OutletRef(@SerialName("name") val name: String? = null)

    suspend fun listOrdersForOutlet(jwt: String, outletId: String, limit: Int = 100): List<OrderRow> {
        val path = "/rest/v1/orders" +
            "?select=id,order_number,created_at,status,modified_by_supervisor,modified_by_supervisor_name" +
            "&outlet_id=eq." + outletId +
            "&order=created_at.desc" +
            "&limit=" + limit
        val text = supabase.getWithJwt(path, jwt)
        return Json { ignoreUnknownKeys = true }
            .decodeFromString(ListSerializer(OrderRow.serializer()), text)
    }

    suspend fun listOrdersForSupervisor(jwt: String, limit: Int = 200): List<OrderRow> {
        val select = "id,order_number,created_at,status,outlet_id,outlets(name),modified_by_supervisor,modified_by_supervisor_name"
        val path = "/rest/v1/orders?select=" + encode(select) + "&order=created_at.desc&limit=" + limit
        val text = supabase.getWithJwt(path, jwt)
        return Json { ignoreUnknownKeys = true }
            .decodeFromString(ListSerializer(OrderRow.serializer()), text)
    }

    @Serializable
    data class OrderItemRow(
        val id: String,
        @SerialName("order_id") val orderId: String,
        val name: String,
        val uom: String,
        val cost: Double,
        val qty: Double
    )

    suspend fun listOrderItems(jwt: String, orderId: String): List<OrderItemRow> {
        val path = "/rest/v1/order_items?select=id,order_id,name,uom,cost,qty&order_id=eq." + orderId + "&order=name.asc"
        val text = supabase.getWithJwt(path, jwt)
        return Json { ignoreUnknownKeys = true }.decodeFromString(ListSerializer(OrderItemRow.serializer()), text)
    }

    suspend fun updateOrderItemQty(jwt: String, orderItemId: String, qty: Double) {
        val body = mapOf("id" to orderItemId, "qty" to qty)
        val url = "/rest/v1/order_items?on_conflict=id"
        val resp = supabase.postWithJwt(url, jwt, body, prefer = listOf("resolution=merge-duplicates", "return=minimal"))
        val code = resp.first
        if (code !in 200..299) throw IllegalStateException("updateOrderItemQty failed: HTTP ${code} ${resp.second}")
    }

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")
}
