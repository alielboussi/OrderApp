import SwiftUI

struct PurchasesSetupView: View {
  @EnvironmentObject var appState: AppState
  @StateObject private var viewModel = PurchasesSetupViewModel()

  @State private var showSupplierPicker = false

  var body: some View {
    VStack(spacing: 12) {
      Text("Purchase Setup")
        .font(.title3)
        .fontWeight(.semibold)

      if let supplier = appState.selectedSupplier {
        Text("Supplier: \(supplier.name)")
          .font(.subheadline)
          .foregroundColor(.secondary)
      }

      invoiceField

      if viewModel.isLoading {
        Text("Loading suppliers...")
          .font(.footnote)
          .foregroundColor(.secondary)
      }

      if let error = viewModel.errorMessage {
        Text(error)
          .font(.footnote)
          .foregroundColor(AppColors.red)
      }

      Spacer()

      Button("Select items") {
        if appState.purchaseState.warehouseId == nil {
          appState.purchaseState.warehouseId = AppConstants.fromWarehouseId
        }
        appState.route = .purchasesItems
      }
      .buttonStyle(.borderedProminent)
      .disabled(appState.selectedSupplier == nil || appState.invoiceNumber.isEmpty)
    }
    .padding(20)
    .toolbar {
      ToolbarItem(placement: .navigationBarLeading) {
        Button("Back") { appState.route = .dashboard }
      }
    }
    .task {
      viewModel.loadSuppliers(token: appState.token)
    }
    .onChange(of: viewModel.suppliers.count) { count in
      if count > 0 {
        showSupplierPicker = true
      }
    }
    .sheet(isPresented: $showSupplierPicker) {
      let gridItems = viewModel.suppliers.map { SelectableItem(id: $0.id, title: $0.name) }
      VStack(spacing: 16) {
        SelectableGrid(title: "Supplier", items: gridItems, selectedId: viewModel.selectedId) { item in
          viewModel.selectedId = item.id
          if let supplier = viewModel.suppliers.first(where: { $0.id == item.id }) {
            appState.setSupplier(supplier)
          }
        }
        Button("Continue") {
          showSupplierPicker = false
        }
        .disabled(appState.selectedSupplier == nil)
        .buttonStyle(.borderedProminent)
      }
      .padding(20)
      .presentationDetents([.medium])
    }
  }

  private var invoiceField: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Invoice number")
        .font(.subheadline)
        .foregroundColor(.secondary)

      HStack {
        if let prefix = appState.invoicePrefix {
          Text(prefix)
            .font(.body)
            .foregroundColor(.primary)
        }
        TextField("", text: $appState.invoiceSuffix)
          .textInputAutocapitalization(.characters)
          .disableAutocorrection(true)
      }
      .padding(12)
      .background(AppColors.graySurface)
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
  }
}
