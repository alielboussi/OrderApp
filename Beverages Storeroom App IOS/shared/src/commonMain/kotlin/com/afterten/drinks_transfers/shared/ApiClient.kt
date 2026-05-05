package com.afterten.drinks_transfers.shared

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

class SupabaseApi {
  private val json = Json { ignoreUnknownKeys = true }
  private val http = HttpClient {
    install(ContentNegotiation) {
      json(json)
    }
  }

  private fun baseUrl(): String {
    val raw = AppConfig.supabaseUrl.trim().removeSuffix("/")
    return if (raw.endsWith("/rest/v1")) raw.removeSuffix("/rest/v1") else raw
  }

  private fun requireConfig() {
    if (AppConfig.supabaseUrl.isBlank() || AppConfig.supabaseAnonKey.isBlank()) {
      error("Supabase credentials missing. Set AppConfig.supabaseUrl and AppConfig.supabaseAnonKey.")
    }
  }

  private suspend inline fun <reified T> parse(response: HttpResponse): T {
    val bodyText = response.bodyAsText()
    if (!response.status.isSuccess()) {
      error("Request failed (HTTP ${response.status.value}): ${bodyText.ifBlank { "No details" }}")
    }
    return json.decodeFromString(bodyText)
  }

  suspend fun login(email: String, pin: String): LoginResponse {
    requireConfig()
    val payload = mapOf("p_email" to email, "p_pin" to pin)
    val response = http.post("${baseUrl()}/rest/v1/rpc/stocktake_app_login") {
      header("apikey", AppConfig.supabaseAnonKey)
      contentType(ContentType.Application.Json)
      setBody(payload)
    }
    val raw: LoginResponseRaw = parse(response)
    return LoginResponse(
      token = raw.token,
      user = LoginUser(id = raw.userId, email = raw.email, displayName = raw.displayName)
    )
  }

  suspend fun listWarehouses(token: String): List<Warehouse> {
    requireConfig()
    val response = http.get("${baseUrl()}/rest/v1/warehouses?select=id,name&order=name.asc") {
      header("apikey", AppConfig.supabaseAnonKey)
      header("Authorization", "Bearer $token")
    }
    return parse(response)
  }

  suspend fun listWarehousesByIds(token: String, ids: List<String>): List<Warehouse> {
    requireConfig()
    if (ids.isEmpty()) return emptyList()
    val inClause = ids.joinToString(",")
    val response = http.get("${baseUrl()}/rest/v1/warehouses?select=id,name&id=in.($inClause)") {
      header("apikey", AppConfig.supabaseAnonKey)
      header("Authorization", "Bearer $token")
    }
    return parse(response)
  }

  suspend fun listSuppliers(token: String): List<Supplier> {
    requireConfig()
    val response = http.get("${baseUrl()}/rest/v1/suppliers?select=id,name&order=name.asc") {
      header("apikey", AppConfig.supabaseAnonKey)
      header("Authorization", "Bearer $token")
    }
    return parse(response)
  }

  suspend fun listWarehouseItems(token: String, warehouseId: String): List<WarehouseItem> {
    requireConfig()
    val payload = mapOf(
      "p_outlet_id" to null,
      "p_search" to null,
      "p_warehouse_id" to warehouseId
    )
    val response = http.post("${baseUrl()}/rest/v1/rpc/list_warehouse_items") {
      header("apikey", AppConfig.supabaseAnonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }
    return parse(response)
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
    val response = http.post("${baseUrl()}/rest/v1/rpc/transfer_units_between_warehouses") {
      header("apikey", AppConfig.supabaseAnonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }
    if (!response.status.isSuccess()) {
      error("Transfer failed (HTTP ${response.status.value})")
    }
  }

  suspend fun recordPurchaseReceipt(
    token: String,
    supplierId: String,
    invoiceNumber: String,
    warehouseId: String,
    items: List<PurchaseItemRequest>
  ) {
    requireConfig()
    val payload = PurchaseReceiptRequest(
      supplierId = supplierId,
      invoiceNumber = invoiceNumber,
      warehouseId = warehouseId,
      items = items
    )
    val response = http.post("${baseUrl()}/rest/v1/rpc/record_purchase_receipt") {
      header("apikey", AppConfig.supabaseAnonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }
    if (!response.status.isSuccess()) {
      error("Purchase failed (HTTP ${response.status.value})")
    }
  }

  suspend fun recordDamage(
    token: String,
    warehouseId: String,
    items: List<DamageItemRequest>
  ) {
    requireConfig()
    val payload = DamageRequest(
      warehouseId = warehouseId,
      items = items.map { line ->
        DamageLineRequest(
          productId = line.itemId,
          variantKey = line.variantId ?: "base",
          quantity = line.quantity
        )
      }
    )
    val response = http.post("${baseUrl()}/rest/v1/rpc/record_damage") {
      header("apikey", AppConfig.supabaseAnonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }
    if (!response.status.isSuccess()) {
      error("Damage failed (HTTP ${response.status.value})")
    }
  }
}
