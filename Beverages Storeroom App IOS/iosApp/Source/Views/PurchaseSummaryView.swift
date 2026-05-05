import SwiftUI
import Shared

struct PurchaseSummaryView: View {
  @EnvironmentObject var appState: AppState
  @ObservedObject var state: PurchaseFlowState

  @State private var isLoading = false
  @State private var errorMessage: String? = nil
  @State private var infoMessage: String? = nil

  private let repository = SharedRepositoryProvider.shared.repository
  private let uploader = SupabaseStorageUploader()
  private let notifier = TelegramNotifier()
  private let resolver = WarehouseNameResolver()

  var body: some View {
    VStack(spacing: 12) {
      Text("Purchase Summary")
        .font(.title3)
        .fontWeight(.semibold)

      if let supplier = appState.selectedSupplier {
        Text("Supplier: \(supplier.name)")
      }
      Text("Invoice: \(appState.invoiceNumber)")

      List {
        ForEach(groupItems(state.lines.map { $0.item })) { group in
          Section(group.itemName) {
            ForEach(state.lines.filter { $0.item.itemId == group.itemId }) { line in
              HStack {
                Text(line.item.displayName)
                Spacer()
                Text("\(line.quantity)")
              }
            }
          }
        }
      }

      if let error = errorMessage {
        Text(error)
          .foregroundColor(AppColors.red)
      }

      if let info = infoMessage {
        Text(info)
          .foregroundColor(.secondary)
      }

      Button(isLoading ? "Submitting..." : "Confirm purchase") {
        submitPurchase()
      }
      .buttonStyle(.borderedProminent)
      .disabled(isLoading)
    }
    .padding(12)
    .toolbar {
      ToolbarItem(placement: .navigationBarLeading) {
        Button("Back") { appState.route = .purchasesItems }
      }
    }
  }

  private func submitPurchase() {
    guard let token = appState.token,
          let supplierId = appState.selectedSupplier?.id,
          let warehouseId = state.warehouseId,
          !appState.invoiceNumber.isEmpty else {
      errorMessage = "Missing purchase data"
      return
    }
    isLoading = true
    errorMessage = nil
    infoMessage = nil
    let items = state.lines.map {
      SharedPurchaseItemRequest(itemId: $0.item.itemId, variantId: $0.item.variantId, quantity: $0.quantity, unitCost: nil)
    }
    let dateTime = formatDateTime()
    let itemsBlock = buildItemsBlock(lines: state.lines)
    let processedBy = displayUserName(user: appState.user)
    let supplierName = appState.selectedSupplier?.name ?? "Supplier"

    resolver.resolve(token: token, ids: [warehouseId]) { names in
      let warehouseName = names[warehouseId] ?? "Warehouse"
      let pdfName = buildPurchasePdfFileName(supplierName: supplierName, warehouseName: warehouseName, dateTime: dateTime)
      let pdfData = PdfBuilder.buildPurchasePdf(
        supplierName: supplierName,
        warehouseName: warehouseName,
        processedBy: processedBy,
        dateTime: dateTime,
        itemsBlock: itemsBlock
      )

      uploader.uploadPdf(bucket: "Purchases", fileName: pdfName, data: pdfData, token: token) { uploadError in
        DispatchQueue.main.async {
          if let uploadError = uploadError {
            isLoading = false
            errorMessage = uploadError.localizedDescription
            return
          }
          repository.recordPurchaseReceipt(token: token, supplierId: supplierId, invoiceNumber: appState.invoiceNumber, warehouseId: warehouseId, items: items) { _, error in
            DispatchQueue.main.async {
              if let error = error {
                isLoading = false
                errorMessage = error.localizedDescription
                return
              }
              notifier.notify(
                context: "purchase",
                processedBy: processedBy,
                sourceLabel: supplierName,
                destLabel: warehouseName,
                itemsBlock: itemsBlock,
                reference: appState.invoiceNumber,
                dateTime: dateTime
              ) { notifyError in
                DispatchQueue.main.async {
                  isLoading = false
                  if notifyError != nil {
                    infoMessage = "Purchase saved, but Telegram notification failed"
                  }
                  appState.route = .purchasesDone
                }
              }
            }
          }
        }
      }
    }
  }
}
