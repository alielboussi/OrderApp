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
        @SerialName("locked") val locked: Boolean = false,
        @SerialName("outlet_id") val outletId: String? = null,
        @SerialName("outlets") val outlet: OutletRef? = null,
        @SerialName("modified_by_supervisor") val modifiedBySupervisor: Boolean? = null,
        @SerialName("modified_by_supervisor_name") val modifiedBySupervisorName: String? = null
    )

    @Serializable
    data class OutletRef(@SerialName("name") val name: String? = null)

    @Serializable
    data class ProductRef(@SerialName("name") val name: String? = null)

    @Serializable
    data class VariationRef(
        @SerialName("name") val name: String? = null,
        @SerialName("receiving_uom") val uom: String? = null,
        @SerialName("consumption_uom") val consumptionUom: String? = null
    )

    @Serializable
    data class OrderDetail(
        val id: String,
        @SerialName("order_number") val orderNumber: String,
        @SerialName("created_at") val createdAt: String,
        val status: String,
        @SerialName("locked") val locked: Boolean = false,
        @SerialName("outlet_id") val outletId: String? = null,
        @SerialName("tz") val timezone: String? = null,
        @SerialName("pdf_path") val pdfPath: String? = null,
        @SerialName("approved_pdf_path") val approvedPdfPath: String? = null,
        @SerialName("loaded_pdf_path") val loadedPdfPath: String? = null,
        @SerialName("offloaded_pdf_path") val offloadedPdfPath: String? = null,
        @SerialName("employee_signed_name") val employeeName: String? = null,
        @SerialName("employee_signature_path") val employeeSignaturePath: String? = null,
        @SerialName("employee_signed_at") val employeeSignedAt: String? = null,
        @SerialName("supervisor_signed_name") val supervisorName: String? = null,
        @SerialName("supervisor_signature_path") val supervisorSignaturePath: String? = null,
        @SerialName("supervisor_signed_at") val supervisorSignedAt: String? = null,
        @SerialName("driver_signed_name") val driverName: String? = null,
        @SerialName("driver_signature_path") val driverSignaturePath: String? = null,
        @SerialName("driver_signed_at") val driverSignedAt: String? = null,
        @SerialName("offloader_signed_name") val offloaderName: String? = null,
        @SerialName("offloader_signature_path") val offloaderSignaturePath: String? = null,
        @SerialName("offloader_signed_at") val offloaderSignedAt: String? = null,
        @SerialName("outlets") val outlet: OutletRef? = null
    )

    suspend fun listOrdersForOutlet(jwt: String, outletId: String, limit: Int = 100): List<OrderRow> {
        val path = "/rest/v1/orders" +
            "?select=id,order_number,created_at,status,locked,modified_by_supervisor,modified_by_supervisor_name" +
            "&outlet_id=eq." + outletId +
            "&order=created_at.desc" +
            "&limit=" + limit
        val text = supabase.getWithJwt(path, jwt)
        return Json { ignoreUnknownKeys = true }
            .decodeFromString(ListSerializer(OrderRow.serializer()), text)
    }

    suspend fun listOrdersForSupervisor(jwt: String, limit: Int = 200): List<OrderRow> {
        val select = "id,order_number,created_at,status,locked,outlet_id,outlets(name),modified_by_supervisor,modified_by_supervisor_name"
        val path = "/rest/v1/orders?select=" + encode(select) + "&order=created_at.desc&limit=" + limit
        val text = supabase.getWithJwt(path, jwt)
        return Json { ignoreUnknownKeys = true }
            .decodeFromString(ListSerializer(OrderRow.serializer()), text)
    }

    @Serializable
    data class OrderItemRow(
        val id: String,
        @SerialName("order_id") val orderId: String,
        @SerialName("product_id") val productId: String? = null,
        @SerialName("variation_key") val variantKey: String? = null,
        val name: String,
        @SerialName("receiving_uom") val uom: String,
        @SerialName("consumption_uom") val consumptionUom: String,
        val cost: Double,
        val qty: Double,
        @SerialName("receiving_contains") val packageContains: Double? = null,
        @SerialName("qty_cases") val qtyCases: Double? = null,
        @SerialName("catalog_items") val product: ProductRef? = null
    )

    suspend fun listOrderItems(jwt: String, orderId: String): List<OrderItemRow> {
        val select = encode(
            "id,order_id,product_id,variation_key,catalog_items(name)," +
                "name,receiving_uom,consumption_uom,cost,qty,receiving_contains,qty_cases"
        )
        val groupedOrder = encode("products(name).asc")
        val path = "/rest/v1/order_items?select=" + select + "&order_id=eq." + orderId + "&order=" + groupedOrder + "&order=name.asc"
        val text = supabase.getWithJwt(path, jwt)
        return Json { ignoreUnknownKeys = true }.decodeFromString(ListSerializer(OrderItemRow.serializer()), text)
    }

    suspend fun fetchOrder(jwt: String, orderId: String): OrderDetail? {
        val select = encode(
            "id,order_number,created_at,status,locked,outlet_id,outlets(name),tz,pdf_path,approved_pdf_path,loaded_pdf_path,offloaded_pdf_path," +
                "employee_signed_name,employee_signature_path,employee_signed_at," +
                "supervisor_signed_name,supervisor_signature_path,supervisor_signed_at," +
                "driver_signed_name,driver_signature_path,driver_signed_at," +
                "offloader_signed_name,offloader_signature_path,offloader_signed_at"
        )
        val path = "/rest/v1/orders?select=" + select + "&id=eq." + orderId + "&limit=1"
        val text = supabase.getWithJwt(path, jwt)
        val list = Json { ignoreUnknownKeys = true }.decodeFromString(ListSerializer(OrderDetail.serializer()), text)
        return list.firstOrNull()
    }

    suspend fun updateOrderItemQty(jwt: String, orderItemId: String, qty: Double) {
        val body = mapOf("id" to orderItemId, "qty" to qty)
        val url = "/rest/v1/order_items?on_conflict=id"
        val resp = supabase.postWithJwt(url, jwt, body, prefer = listOf("resolution=merge-duplicates", "return=minimal"))
        val code = resp.first
        if (code !in 200..299) throw IllegalStateException("updateOrderItemQty failed: HTTP ${code} ${resp.second}")
    }

    suspend fun updateOrderItemVariation(
        jwt: String,
        orderItemId: String,
        variantKey: String,
        name: String,
        receivingUom: String,
        consumptionUom: String,
        cost: Double,
        packageContains: Double?,
        qtyUnits: Double
    ) {
        val body = mutableMapOf<String, Any?>(
            "id" to orderItemId,
            "variation_key" to variantKey,
            "name" to name,
            "receiving_uom" to receivingUom,
            "consumption_uom" to consumptionUom,
            "cost" to cost,
            "amount" to cost * qtyUnits
        )
        packageContains?.takeIf { it > 0 }?.let {
            body["receiving_contains"] = it
            body["qty_cases"] = qtyUnits / it
        }
        val resp = supabase.postWithJwt(
            "/rest/v1/order_items?on_conflict=id",
            jwt,
            body,
            prefer = listOf("resolution=merge-duplicates", "return=minimal")
        )
        val code = resp.first
        if (code !in 200..299) throw IllegalStateException("updateOrderItemVariation failed: HTTP ${code} ${resp.second}")
    }

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")
}
