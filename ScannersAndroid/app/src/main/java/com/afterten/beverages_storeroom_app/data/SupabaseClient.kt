package com.afterten.beverages_storeroom_app.data

import com.afterten.beverages_storeroom_app.BuildConfig
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

class SupabaseClient {
  private val baseUrl = BuildConfig.SUPABASE_URL.trimEnd('/')
  private val anonKey = BuildConfig.SUPABASE_ANON_KEY

  private val http = HttpClient(OkHttp) {
    install(ContentNegotiation) {
      json(Json { ignoreUnknownKeys = true })
    }
  }

  private fun requireConfig() {
    if (baseUrl.isBlank() || anonKey.isBlank()) {
      error("Supabase credentials missing. Set SUPABASE_URL and SUPABASE_ANON_KEY in gradle.properties.")
    }
  }

  suspend fun login(email: String, pin: String): LoginResponse {
    requireConfig()
    val payload = mapOf("p_email" to email, "p_pin" to pin)
    val raw: LoginResponseRaw = http.post("$baseUrl/rest/v1/rpc/stocktake_app_login") {
      header("apikey", anonKey)
      contentType(ContentType.Application.Json)
      setBody(payload)
    }.body()
    return LoginResponse(
      token = raw.token,
      user = LoginUser(id = raw.userId, email = raw.email)
    )
  }

  suspend fun listWarehouses(token: String): List<Warehouse> {
    requireConfig()
    return http.get("$baseUrl/rest/v1/warehouses?select=id,name&order=name.asc") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
    }.body()
  }

  suspend fun listSuppliers(token: String): List<Supplier> {
    requireConfig()
    return http.get("$baseUrl/rest/v1/suppliers?select=id,name&order=name.asc") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
    }.body()
  }

  suspend fun listWarehouseItems(token: String, warehouseId: String): List<WarehouseItem> {
    requireConfig()
    val payload = mapOf("p_warehouse_id" to warehouseId)
    return http.post("$baseUrl/rest/v1/rpc/list_warehouse_items") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }.body()
  }

  suspend fun transferUnits(
    token: String,
    fromWarehouseId: String,
    toWarehouseId: String,
    items: List<TransferItemRequest>
  ) {
    requireConfig()
    val payload = mapOf(
      "p_from_warehouse_id" to fromWarehouseId,
      "p_to_warehouse_id" to toWarehouseId,
      "p_items" to items
    )
    http.post("$baseUrl/rest/v1/rpc/transfer_units_between_warehouses") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }.body<Unit>()
  }

  suspend fun recordPurchaseReceipt(
    token: String,
    supplierId: String,
    invoiceNumber: String,
    warehouseId: String,
    items: List<PurchaseItemRequest>
  ) {
    requireConfig()
    val payload = mapOf(
      "p_supplier_id" to supplierId,
      "p_invoice_number" to invoiceNumber,
      "p_warehouse_id" to warehouseId,
      "p_items" to items
    )
    http.post("$baseUrl/rest/v1/rpc/record_purchase_receipt") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }.body<Unit>()
  }
}
