import SwiftUI

struct DamagesView: View {
  @EnvironmentObject var appState: AppState
  @ObservedObject private var state: DamageFlowState

  @StateObject private var itemsViewModel = WarehouseItemsViewModel()
  @StateObject private var warehousesViewModel = WarehousesByIdViewModel(ids: AppConstants.damageWarehouseIds)

  @State private var showPicker = false
  @State private var query: String = ""
  @State private var qtyItem: WarehouseItemModel? = nil

  init(state: DamageFlowState) {
    _state = ObservedObject(wrappedValue: state)
  }

  var body: some View {
    VStack(spacing: 12) {
      Text("Damages")
        .font(.title3)
        .fontWeight(.semibold)

      TextField("Search or scan", text: $query)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .padding(12)
        .background(AppColors.graySurface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

      if itemsViewModel.isLoading || warehousesViewModel.isLoading {
        Text("Loading...")
          .font(.footnote)
          .foregroundColor(.secondary)
      }

      if let error = itemsViewModel.errorMessage ?? warehousesViewModel.errorMessage {
        Text(error)
          .font(.footnote)
          .foregroundColor(AppColors.red)
      }

      itemList

      Button("Review damage (\(state.lines.count))") {
        appState.route = .damagesSummary
      }
      .buttonStyle(.borderedProminent)
      .disabled(state.lines.isEmpty)

      Spacer()
    }
    .padding(20)
    .toolbar {
      ToolbarItem(placement: .navigationBarLeading) {
        Button("Back") { appState.route = .dashboard }
      }
    }
    .task {
      warehousesViewModel.load(token: appState.token)
      if state.warehouseId != nil {
        itemsViewModel.load(token: appState.token, warehouseId: state.warehouseId)
      }
    }
    .onChange(of: warehousesViewModel.warehouses.count) { count in
      if count > 0 && state.warehouseId == nil {
        showPicker = true
      }
    }
    .onChange(of: itemsViewModel.items) { newValue in
      state.availableItems = newValue
    }
    .sheet(isPresented: $showPicker) {
      VStack(spacing: 16) {
        SelectableGrid(title: "Warehouse", items: warehousesViewModel.warehouses, selectedId: warehousesViewModel.selectedId) { item in
          warehousesViewModel.selectedId = item.id
        }
        Button("Continue") {
          state.warehouseId = warehousesViewModel.selectedId
          itemsViewModel.load(token: appState.token, warehouseId: state.warehouseId)
          showPicker = false
        }
        .disabled(warehousesViewModel.selectedId == nil)
        .buttonStyle(.borderedProminent)
      }
      .padding(20)
      .presentationDetents([.medium])
    }
    .sheet(item: $qtyItem) { item in
      QtyEntrySheet(title: item.displayName, initialQty: existingQty(itemKey: item.itemKey)) { qty in
        upsertLine(item: item, qty: qty)
        qtyItem = nil
      }
    }
  }

  private var itemList: some View {
    let queryValue = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let filteredItems = state.availableItems
    let variantMatches = queryValue.isEmpty ? [] : filteredItems.filter { item in
      let isVariant = (item.variantId ?? "base").lowercased() != "base"
      guard isVariant else { return false }
      return [item.variantName, item.variantId, item.sku]
        .compactMap { $0?.lowercased() }
        .contains { $0.contains(queryValue) }
    }
    let matchingItemIds: Set<String> = queryValue.isEmpty ? [] : Set(
      filteredItems.filter { item in
        [item.itemName, item.sku]
          .compactMap { $0?.lowercased() }
          .contains { $0.contains(queryValue) }
      }.map { $0.itemId }
    )
    let baseCandidates = queryValue.isEmpty ? filteredItems : filteredItems.filter { matchingItemIds.contains($0.itemId) }

    return List {
      if !queryValue.isEmpty && !variantMatches.isEmpty {
        ForEach(variantMatches.sorted { variantSortKey($0) < variantSortKey($1) }) { item in
          Button(item.displayName) { qtyItem = item }
        }
      } else {
        ForEach(groupItems(baseCandidates)) { group in
          Button(group.itemName) {
            if hasVariants(group) {
              state.selectedItemId = group.itemId
              state.selectedItemName = group.itemName
              appState.route = .damagesVariants
            } else if let item = group.variants.first {
              qtyItem = item
            }
          }
        }
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
