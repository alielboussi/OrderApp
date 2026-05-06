package com.afterten.coldrooms.app.data

class Repository(private val client: SupabaseClient) {
  suspend fun login(email: String, pin: String): LoginResponse {
    return client.login(email, pin)
  }

  suspend fun listWarehouses(token: String): List<Warehouse> {
    return client.listWarehouses(token)
  }

  suspend fun listWarehousesByIds(token: String, ids: List<String>): List<Warehouse> {
    return client.listWarehousesByIds(token, ids)
  }

  suspend fun listSuppliers(token: String): List<Supplier> {
    return client.listSuppliers(token)
  }

  suspend fun listCatalogItemsByIds(token: String, ids: List<String>): List<CatalogItemRow> {
    return client.listCatalogItemsByIds(token, ids)
  }

  suspend fun listCatalogVariantsByIds(token: String, ids: List<String>): List<CatalogVariantRow> {
    return client.listCatalogVariantsByIds(token, ids)
  }

  suspend fun listWarehouseStockItems(
    token: String,
    warehouseId: String,
    itemIds: List<String>
  ): List<WarehouseStockRow> {
    return client.listWarehouseStockItems(token, warehouseId, itemIds)
  }

  suspend fun getOpenWarehousePeriod(token: String, warehouseId: String): WarehouseStockPeriodRow? {
    return client.getOpenWarehousePeriod(token, warehouseId)
  }

  suspend fun listWarehouseOpeningCounts(
    token: String,
    periodId: String,
    itemIds: List<String>
  ): List<WarehouseOpeningKeyRow> {
    return client.listWarehouseOpeningCounts(token, periodId, itemIds)
  }

  suspend fun getAndroidAppVersion(appKey: String): AndroidAppVersionRow? {
    return client.getAndroidAppVersion(appKey)
  }

  suspend fun getUserDisplayName(token: String, userId: String): String? {
    return client.getStocktakeUserDisplayName(token, userId)
  }

  suspend fun listWarehouseItems(token: String, warehouseId: String): List<WarehouseItem> {
    return client.listWarehouseItems(token, warehouseId)
  }

  suspend fun hasOpenWarehousePeriod(token: String, warehouseId: String): Boolean {
    return client.hasOpenWarehousePeriod(token, warehouseId)
  }

  suspend fun transferUnits(
    token: String,
    fromWarehouseId: String,
    toWarehouseId: String,
    items: List<TransferItemRequest>
  ) {
    client.transferUnits(token, fromWarehouseId, toWarehouseId, items)
  }

  suspend fun recordPurchaseReceipt(
    token: String,
    supplierId: String,
    invoiceNumber: String,
    warehouseId: String,
    items: List<PurchaseItemRequest>
  ) {
    client.recordPurchaseReceipt(token, supplierId, invoiceNumber, warehouseId, items)
  }

  suspend fun recordDamage(
    token: String,
    warehouseId: String,
    items: List<DamageItemRequest>
  ) {
    client.recordDamage(token, warehouseId, items)
  }

  suspend fun uploadTransferPdf(token: String, fileName: String, bytes: ByteArray) {
    client.uploadTransferPdf(token, fileName, bytes)
  }

  suspend fun uploadPurchasePdf(token: String, fileName: String, bytes: ByteArray) {
    client.uploadPurchasePdf(token, fileName, bytes)
  }

  suspend fun uploadDamagePdf(token: String, fileName: String, bytes: ByteArray) {
    client.uploadDamagePdf(token, fileName, bytes)
  }

  suspend fun createTransferPdfSignedUrl(token: String, fileName: String): String {
    return client.createTransferPdfSignedUrl(token, fileName)
  }

  suspend fun createPurchasePdfSignedUrl(token: String, fileName: String): String {
    return client.createPurchasePdfSignedUrl(token, fileName)
  }

  suspend fun createDamagePdfSignedUrl(token: String, fileName: String): String {
    return client.createDamagePdfSignedUrl(token, fileName)
  }
}
