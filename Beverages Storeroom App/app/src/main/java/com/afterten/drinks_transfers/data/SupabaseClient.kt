package com.afterten.drinks_transfers.data

import android.util.Log
import com.afterten.drinks_transfers.BuildConfig
import com.afterten.drinks_transfers.data.DamageLineRequest
import com.afterten.drinks_transfers.data.DamageRequest
import com.afterten.drinks_transfers.data.PurchaseReceiptRequest
import com.afterten.drinks_transfers.data.TransferUnitsRequest
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.okhttp.OkHttp
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
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

class SupabaseClient {
  private val baseUrl = normalizeBaseUrl(BuildConfig.SUPABASE_URL)
  private val anonKey = BuildConfig.SUPABASE_ANON_KEY
  private val telegramBotToken = BuildConfig.TELEGRAM_BEVERAGES_BOT_TOKEN
  private val telegramChatId = BuildConfig.TELEGRAM_BEVERAGES_CHAT_ID

  private val json = Json { ignoreUnknownKeys = true }

  private val http = HttpClient(OkHttp) {
    install(ContentNegotiation) {
      json(json)
    }
  }

  private fun normalizeBaseUrl(rawUrl: String): String {
    var url = rawUrl.trim()
    if (url.endsWith("/")) {
      url = url.trimEnd('/')
    }
    return if (url.endsWith("/rest/v1")) {
      url.removeSuffix("/rest/v1")
    } else {
      url
    }
  }

  private fun requireConfig() {
    if (baseUrl.isBlank() || anonKey.isBlank()) {
      error("Supabase credentials missing. Set SUPABASE_URL and SUPABASE_ANON_KEY in gradle.properties.")
    }
  }

  private fun requireTelegramConfig() {
    if (telegramBotToken.isBlank() || telegramChatId.isBlank()) {
      error("Telegram credentials missing. Set TELEGRAM_BEVERAGES_BOT_TOKEN and TELEGRAM_BEVERAGES_CHAT_ID in gradle.properties.")
    }
  }

  private fun escapeHtml(value: String): String {
    return value
      .replace("&", "&amp;")
      .replace("<", "&lt;")
      .replace(">", "&gt;")
      .replace("\"", "&quot;")
      .replace("'", "&#39;")
  }

  private fun buildTelegramMessage(request: TelegramNotifyRequest): String {
    val context = request.context.trim().lowercase()
    val typeLabel = when (context) {
      "purchase" -> "Purchase"
      "damage" -> "Damage"
      else -> "Transfer"
    }
    val summary = request.summary
    val operator = summary.processedBy.trim().ifBlank { "Unknown operator" }
    val sourceLabel = summary.sourceLabel.trim().ifBlank { "Unknown source" }
    val destLabel = summary.destLabel.trim().ifBlank { "Unknown destination" }
    val reference = summary.reference?.trim().orEmpty()
    val dateTime = summary.dateTime?.trim().orEmpty()
    val itemsBlock = summary.itemsBlock.trim()
    val lines = mutableListOf<String>()

    lines.add("<b>${escapeHtml(typeLabel)}</b>")
    if (context != "damage") {
      lines.add("From: ${escapeHtml(sourceLabel)}")
      lines.add("To: ${escapeHtml(destLabel)}")
    }
    if (context == "purchase" && reference.isNotEmpty()) {
      lines.add("Reference / Invoice #: ${escapeHtml(reference)}")
    }
    if (dateTime.isNotEmpty()) {
      lines.add("Date &amp; Time: ${escapeHtml(dateTime)}")
    }
    lines.add("Operator: ${escapeHtml(operator)}")
    lines.add("Products:")
    lines.add(if (itemsBlock.isNotEmpty()) escapeHtml(itemsBlock) else "• No line items provided")

    return lines.joinToString("\n")
  }

  private suspend inline fun <reified T> parseJsonResponse(response: HttpResponse): T {
    val bodyText = response.bodyAsText()
    if (!response.status.isSuccess()) {
      val error = runCatching { json.decodeFromString<PostgrestError>(bodyText) }.getOrNull()
      val message = error?.message ?: error?.error ?: "Request failed"
      val detail = error?.details ?: error?.hint ?: ""
      val raw = if (bodyText.isBlank()) "<empty>" else bodyText
      val extra = listOfNotNull(
        "HTTP ${response.status.value}",
        detail.takeIf { it.isNotBlank() }
      ).joinToString(" | ")
      throw IllegalStateException("$message (${extra.ifBlank { "no details" }}) Raw: $raw")
    }
    return json.decodeFromString(bodyText)
  }

  suspend fun login(email: String, pin: String): LoginResponse {
    requireConfig()
    val payload = mapOf("p_email" to email, "p_pin" to pin)
    val response = http.post("$baseUrl/rest/v1/rpc/stocktake_app_login") {
      header("apikey", anonKey)
      contentType(ContentType.Application.Json)
      setBody(payload)
    }
    val bodyText = response.bodyAsText()
    if (!response.status.isSuccess()) {
      val error = runCatching { json.decodeFromString<PostgrestError>(bodyText) }.getOrNull()
      val message = error?.message ?: error?.error ?: "Login failed"
      val detail = error?.details ?: error?.hint ?: ""
      val raw = if (bodyText.isBlank()) "<empty>" else bodyText
      val extra = listOfNotNull(
        "HTTP ${response.status.value}",
        detail.takeIf { it.isNotBlank() }
      ).joinToString(" | ")
      throw IllegalStateException("$message (${extra.ifBlank { "no details" }}) Raw: $raw")
    }
    val raw = json.decodeFromString<LoginResponseRaw>(bodyText)
    return LoginResponse(
      token = raw.token,
      user = LoginUser(id = raw.userId, email = raw.email, displayName = raw.displayName)
    )
  }

  suspend fun listWarehouses(token: String): List<Warehouse> {
    requireConfig()
    val response = http.get("$baseUrl/rest/v1/warehouses?select=id,name&order=name.asc") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
    }
    return parseJsonResponse(response)
  }

  suspend fun listWarehousesByIds(token: String, ids: List<String>): List<Warehouse> {
    requireConfig()
    if (ids.isEmpty()) return emptyList()
    val inClause = ids.joinToString(",") { it }
    val response = http.get("$baseUrl/rest/v1/warehouses?select=id,name&id=in.($inClause)") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
    }
    val bodyText = response.bodyAsText()
    Log.i("Warehouses", "IDs fetch status=${response.status.value} body=$bodyText")
    if (!response.status.isSuccess()) {
      val error = runCatching { json.decodeFromString<PostgrestError>(bodyText) }.getOrNull()
      val message = error?.message ?: error?.error ?: "Request failed"
      val detail = error?.details ?: error?.hint ?: ""
      val raw = if (bodyText.isBlank()) "<empty>" else bodyText
      val extra = listOfNotNull(
        "HTTP ${response.status.value}",
        detail.takeIf { it.isNotBlank() }
      ).joinToString(" | ")
      throw IllegalStateException("$message (${extra.ifBlank { "no details" }}) Raw: $raw")
    }
    return json.decodeFromString(bodyText)
  }

  suspend fun listSuppliers(token: String): List<Supplier> {
    requireConfig()
    val response = http.get("$baseUrl/rest/v1/suppliers?select=id,name&order=name.asc") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
    }
    return parseJsonResponse(response)
  }

  suspend fun getStocktakeUserDisplayName(token: String, userId: String): String? {
    requireConfig()
    val response = http.get("$baseUrl/rest/v1/stocktake_app_users?select=display_name&id=eq.$userId&limit=1") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
    }
    val bodyText = response.bodyAsText()
    Log.d("SupabaseClient", "display_name lookup status=${response.status.value} body=$bodyText")
    if (!response.status.isSuccess()) {
      val error = runCatching { json.decodeFromString<PostgrestError>(bodyText) }.getOrNull()
      val message = error?.message ?: error?.error ?: "Request failed"
      val detail = error?.details ?: error?.hint ?: ""
      val extra = listOfNotNull(
        "HTTP ${response.status.value}",
        detail.takeIf { it.isNotBlank() }
      ).joinToString(" | ")
      throw IllegalStateException("$message (${extra.ifBlank { "no details" }}) Raw: $bodyText")
    }
    val rows = json.decodeFromString<List<StocktakeUserRow>>(bodyText)
    return rows.firstOrNull()?.displayName?.trim()?.takeIf { it.isNotBlank() }
  }

  suspend fun getAndroidAppVersion(appKey: String): AndroidAppVersionRow? {
    requireConfig()
    val response = http.get(
      "$baseUrl/rest/v1/android_app_versions?select=app_key,min_version_code,min_version_name,force_update&app_key=eq.$appKey&limit=1"
    ) {
      header("apikey", anonKey)
    }
    val rows: List<AndroidAppVersionRow> = parseJsonResponse(response)
    return rows.firstOrNull()
  }

  suspend fun listWarehouseItems(token: String, warehouseId: String): List<WarehouseItem> {
    requireConfig()
    val payload = mapOf(
      "p_outlet_id" to null,
      "p_search" to null,
      "p_warehouse_id" to warehouseId
    )
    val response = http.post("$baseUrl/rest/v1/rpc/list_warehouse_items") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }
    return parseJsonResponse(response)
  }

  suspend fun hasOpenWarehousePeriod(token: String, warehouseId: String): Boolean {
    requireConfig()
    val payload = mapOf("p_warehouse_id" to warehouseId)
    val response = http.post("$baseUrl/rest/v1/rpc/has_open_warehouse_period") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }
    return parseJsonResponse(response)
  }

  suspend fun transferUnits(
    token: String,
    fromWarehouseId: String,
    toWarehouseId: String,
    items: List<TransferItemRequest>
  ) {
    requireConfig()
    val payload = TransferUnitsRequest(
      fromWarehouseId = fromWarehouseId,
      toWarehouseId = toWarehouseId,
      items = items
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
    val payload = PurchaseReceiptRequest(
      supplierId = supplierId,
      invoiceNumber = invoiceNumber,
      warehouseId = warehouseId,
      items = items
    )
    http.post("$baseUrl/rest/v1/rpc/record_purchase_receipt") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }.body<Unit>()
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
    http.post("$baseUrl/rest/v1/rpc/record_damage") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }.body<Unit>()
  }

  suspend fun uploadTransferPdf(token: String, fileName: String, bytes: ByteArray) {
    requireConfig()
    val response = http.post("$baseUrl/storage/v1/object/Transfers/$fileName") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      header("x-upsert", "false")
      contentType(ContentType.parse("application/pdf"))
      setBody(bytes)
    }
    if (!response.status.isSuccess()) {
      val bodyText = response.bodyAsText()
      throw IllegalStateException("PDF upload failed (HTTP ${response.status.value}). ${bodyText.ifBlank { "No details" }}")
    }
  }

  suspend fun uploadPurchasePdf(token: String, fileName: String, bytes: ByteArray) {
    requireConfig()
    val response = http.post("$baseUrl/storage/v1/object/Purchases/$fileName") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      header("x-upsert", "false")
      contentType(ContentType.parse("application/pdf"))
      setBody(bytes)
    }
    if (!response.status.isSuccess()) {
      val bodyText = response.bodyAsText()
      throw IllegalStateException("PDF upload failed (HTTP ${response.status.value}). ${bodyText.ifBlank { "No details" }}")
    }
  }

  suspend fun uploadDamagePdf(token: String, fileName: String, bytes: ByteArray) {
    requireConfig()
    val response = http.post("$baseUrl/storage/v1/object/Damages/$fileName") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      header("x-upsert", "false")
      contentType(ContentType.parse("application/pdf"))
      setBody(bytes)
    }
    if (!response.status.isSuccess()) {
      val bodyText = response.bodyAsText()
      throw IllegalStateException("PDF upload failed (HTTP ${response.status.value}). ${bodyText.ifBlank { "No details" }}")
    }
  }

  suspend fun createTransferPdfSignedUrl(token: String, fileName: String): String {
    requireConfig()
    val payload = mapOf("expiresIn" to 3600)
    val response = http.post("$baseUrl/storage/v1/object/sign/Transfers/$fileName") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }
    val signed = parseJsonResponse<SignedUrlResponse>(response)
    val path = signed.signedURL.trim()
    return if (path.startsWith("http")) path else "$baseUrl$path"
  }

  suspend fun createPurchasePdfSignedUrl(token: String, fileName: String): String {
    requireConfig()
    val payload = mapOf("expiresIn" to 3600)
    val response = http.post("$baseUrl/storage/v1/object/sign/Purchases/$fileName") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }
    val signed = parseJsonResponse<SignedUrlResponse>(response)
    val path = signed.signedURL.trim()
    return if (path.startsWith("http")) path else "$baseUrl$path"
  }

  suspend fun createDamagePdfSignedUrl(token: String, fileName: String): String {
    requireConfig()
    val payload = mapOf("expiresIn" to 3600)
    val response = http.post("$baseUrl/storage/v1/object/sign/Damages/$fileName") {
      header("apikey", anonKey)
      header("Authorization", "Bearer $token")
      contentType(ContentType.Application.Json)
      setBody(payload)
    }
    val signed = parseJsonResponse<SignedUrlResponse>(response)
    val path = signed.signedURL.trim()
    return if (path.startsWith("http")) path else "$baseUrl$path"
  }

  suspend fun notifyTelegram(request: TelegramNotifyRequest) {
    requireTelegramConfig()
    val message = buildTelegramMessage(request)
    val payload = mapOf(
      "chat_id" to telegramChatId,
      "text" to message,
      "parse_mode" to "HTML"
    )
    val response = http.post("https://api.telegram.org/bot$telegramBotToken/sendMessage") {
      contentType(ContentType.Application.Json)
      setBody(payload)
    }
    if (!response.status.isSuccess()) {
      val bodyText = response.bodyAsText()
      throw IllegalStateException("Telegram notify failed (HTTP ${response.status.value}). ${bodyText.ifBlank { "No details" }}")
    }
  }
}

@Serializable
data class PostgrestError(
  val message: String? = null,
  val error: String? = null,
  val details: String? = null,
  val hint: String? = null
)

@Serializable
data class SignedUrlResponse(
  val signedURL: String
)

@Serializable
data class StocktakeUserRow(
  @SerialName("display_name") val displayName: String? = null
)
