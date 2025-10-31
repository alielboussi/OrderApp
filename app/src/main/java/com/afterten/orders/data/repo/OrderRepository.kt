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
        val status: String
    )

    suspend fun listOrdersForOutlet(jwt: String, outletId: String, limit: Int = 100): List<OrderRow> {
        val path = "/rest/v1/orders" +
            "?select=id,order_number,created_at,status" +
            "&outlet_id=eq." + outletId +
            "&order=created_at.desc" +
            "&limit=" + limit
        val text = supabase.getWithJwt(path, jwt)
        return Json { ignoreUnknownKeys = true }
            .decodeFromString(ListSerializer(OrderRow.serializer()), text)
    }

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")
}
