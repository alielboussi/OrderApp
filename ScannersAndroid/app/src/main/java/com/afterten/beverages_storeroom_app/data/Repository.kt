package com.afterten.beverages_storeroom_app.data

class Repository(private val client: SupabaseClient) {
  suspend fun login(email: String, pin: String): LoginResponse {
    return client.login(email, pin)
  }

  suspend fun listWarehouses(token: String): List<Warehouse> {
    return client.listWarehouses(token)
  }

  suspend fun listSuppliers(token: String): List<Supplier> {
    return client.listSuppliers(token)
  }

  suspend fun listWarehouseItems(token: String, warehouseId: String): List<WarehouseItem> {
    return client.listWarehouseItems(token, warehouseId)
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
}
