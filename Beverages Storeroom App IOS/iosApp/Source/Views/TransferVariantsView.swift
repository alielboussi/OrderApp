import SwiftUI

struct TransferVariantsView: View {
  @EnvironmentObject var appState: AppState
  @ObservedObject var state: TransferFlowState

  @State private var selectedItem: WarehouseItemModel? = nil

  var body: some View {
    let selectedId = state.selectedItemId
    let variants = filterHiddenVariants(state.availableItems)
      .filter { $0.itemId == selectedId }
      .filter { ($0.variantId ?? "base").lowercased() != "base" }

    List {
      ForEach(variants.sorted { variantSortKey($0) < variantSortKey($1) }) { item in
        Button(item.displayName) {
          selectedItem = item
        }
      }
    }
    .navigationTitle(state.selectedItemName ?? "Variants")
    .toolbar {
      ToolbarItem(placement: .navigationBarLeading) {
        Button("Back") { appState.route = .transfers }
      }
    }
    .sheet(item: $selectedItem) { item in
      QtyEntrySheet(title: item.displayName, initialQty: existingQty(itemKey: item.itemKey)) { qty in
        upsertLine(item: item, qty: qty)
        selectedItem = nil
      }
    }
  }

  private func existingQty(itemKey: String) -> Double? {
    state.lines.first(where: { $0.id == itemKey })?.quantity
  }

  private func upsertLine(item: WarehouseItemModel, qty: Double) {
    if let index = state.lines.firstIndex(where: { $0.id == item.itemKey }) {
      state.lines[index].quantity = qty
    } else {
      state.lines.append(TransferLine(item: item, quantity: qty))
    }
  }
}
