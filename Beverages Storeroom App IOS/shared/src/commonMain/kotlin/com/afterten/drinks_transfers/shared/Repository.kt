package com.afterten.drinks_transfers.shared

class Repository(private val api: SupabaseApi) {
  suspend fun login(email: String, pin: String): LoginResponse {
    return api.login(email, pin)
  }

  suspend fun listWarehouses(token: String): List<Warehouse> {
    return api.listWarehouses(token)
  }

  suspend fun listWarehousesByIds(token: String, ids: List<String>): List<Warehouse> {
    return api.listWarehousesByIds(token, ids)
  }

  suspend fun listSuppliers(token: String): List<Supplier> {
    return api.listSuppliers(token)
  }

  suspend fun listWarehouseItems(token: String, warehouseId: String): List<WarehouseItem> {
    return api.listWarehouseItems(token, warehouseId)
  }

  suspend fun transferUnits(
    token: String,
    fromWarehouseId: String,
    toWarehouseId: String,
    items: List<TransferItemRequest>
  ) {
    api.transferUnits(token, fromWarehouseId, toWarehouseId, items)
  }

  suspend fun recordPurchaseReceipt(
    token: String,
    supplierId: String,
    invoiceNumber: String,
    warehouseId: String,
    items: List<PurchaseItemRequest>
  ) {
    api.recordPurchaseReceipt(token, supplierId, invoiceNumber, warehouseId, items)
  }

  suspend fun recordDamage(
    token: String,
    warehouseId: String,
    items: List<DamageItemRequest>
  ) {
    api.recordDamage(token, warehouseId, items)
  }
}
