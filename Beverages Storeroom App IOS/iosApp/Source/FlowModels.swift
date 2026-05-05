import Foundation
import Shared

struct WarehouseItemModel: Identifiable, Equatable {
  var id: String { itemKey }
  let itemId: String
  let variantId: String?
  let itemName: String
  let variantName: String?
  let sku: String?
  let onHand: Double?
  let imageUrl: String?

  var itemKey: String {
    itemId + ":" + (variantId ?? "base")
  }

  var displayName: String {
    if let variantName = variantName, !variantName.isEmpty {
      return "\(itemName) - \(variantName)"
    }
    return itemName
  }
}

struct ItemGroup: Identifiable {
  let id: String
  let itemId: String
  let itemName: String
  let variants: [WarehouseItemModel]
}

struct TransferLine: Identifiable {
  let id: String
  let item: WarehouseItemModel
  var quantity: Double

  init(item: WarehouseItemModel, quantity: Double) {
    self.item = item
    self.quantity = quantity
    self.id = item.itemKey
  }
}

struct PurchaseLine: Identifiable {
  let id: String
  let item: WarehouseItemModel
  var quantity: Double
  var unitCost: Double?

  init(item: WarehouseItemModel, quantity: Double, unitCost: Double?) {
    self.item = item
    self.quantity = quantity
    self.unitCost = unitCost
    self.id = item.itemKey
  }
}

func mapWarehouseItems(_ items: [SharedWarehouseItem]) -> [WarehouseItemModel] {
  items.map {
    WarehouseItemModel(
      itemId: $0.itemId,
      variantId: $0.variantId,
      itemName: $0.itemName,
      variantName: $0.variantName,
      sku: $0.sku,
      onHand: $0.onHand?.doubleValue,
      imageUrl: $0.imageUrl
    )
  }
}

func groupItems(_ items: [WarehouseItemModel]) -> [ItemGroup] {
  let grouped = Dictionary(grouping: items, by: { $0.itemId })
  return grouped.map { key, variants in
    let baseName = variants.first?.itemName ?? ""
    return ItemGroup(id: key, itemId: key, itemName: baseName, variants: variants)
  }.sorted { $0.itemName.lowercased() < $1.itemName.lowercased() }
}

func hasVariants(_ group: ItemGroup) -> Bool {
  group.variants.contains { ($0.variantId ?? "base").lowercased() != "base" }
}

func filterHiddenVariants(_ items: [WarehouseItemModel]) -> [WarehouseItemModel] {
  items.filter { item in
    guard let variantId = item.variantId else { return true }
    return !AppConstants.hiddenTransferVariantIds.contains(variantId)
  }
}

func variantSortKey(_ item: WarehouseItemModel) -> String {
  if let name = item.variantName, !name.isEmpty {
    return name.lowercased()
  }
  if let sku = item.sku, !sku.isEmpty {
    return sku.lowercased()
  }
  return item.itemKey.lowercased()
}
