import Foundation

final class TransferFlowState: ObservableObject {
  @Published var toWarehouseId: String? = nil
  @Published var selectedItemId: String? = nil
  @Published var selectedItemName: String? = nil
  @Published var availableItems: [WarehouseItemModel] = []
  @Published var lines: [TransferLine] = []

  func reset() {
    toWarehouseId = nil
    selectedItemId = nil
    selectedItemName = nil
    availableItems = []
    lines = []
  }
}

final class DamageFlowState: ObservableObject {
  @Published var warehouseId: String? = nil
  @Published var selectedItemId: String? = nil
  @Published var selectedItemName: String? = nil
  @Published var availableItems: [WarehouseItemModel] = []
  @Published var lines: [TransferLine] = []

  func reset() {
    warehouseId = nil
    selectedItemId = nil
    selectedItemName = nil
    availableItems = []
    lines = []
  }
}

final class PurchaseFlowState: ObservableObject {
  @Published var warehouseId: String? = nil
  @Published var selectedItemId: String? = nil
  @Published var selectedItemName: String? = nil
  @Published var availableItems: [WarehouseItemModel] = []
  @Published var lines: [PurchaseLine] = []

  func reset() {
    warehouseId = nil
    selectedItemId = nil
    selectedItemName = nil
    availableItems = []
    lines = []
  }
}
