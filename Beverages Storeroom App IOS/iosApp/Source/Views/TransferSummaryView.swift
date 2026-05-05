import SwiftUI
import Shared

struct TransferSummaryView: View {
  @EnvironmentObject var appState: AppState
  @ObservedObject var state: TransferFlowState

  @State private var isLoading = false
  @State private var errorMessage: String? = nil
  @State private var infoMessage: String? = nil

  private let repository = SharedRepositoryProvider.shared.repository
  private let uploader = SupabaseStorageUploader()
  private let notifier = TelegramNotifier()
  private let resolver = WarehouseNameResolver()

  var body: some View {
    VStack(spacing: 12) {
      Text("Transfer Summary")
        .font(.title3)
        .fontWeight(.semibold)

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

      Button(isLoading ? "Processing..." : "Process transfer") {
        submitTransfer()
      }
      .buttonStyle(.borderedProminent)
      .disabled(isLoading)
    }
    .padding(12)
    .toolbar {
      ToolbarItem(placement: .navigationBarLeading) {
        Button("Back") { appState.route = .transfers }
      }
    }
  }

  private func submitTransfer() {
    guard let token = appState.token, let toWarehouseId = state.toWarehouseId else {
      errorMessage = "Missing warehouse selection"
      return
    }
    isLoading = true
    errorMessage = nil
    infoMessage = nil
    let items = state.lines.map {
      SharedTransferItemRequest(itemId: $0.item.itemId, variantId: $0.item.variantId, quantity: $0.quantity)
    }
    let dateTime = formatDateTime()
    let itemsBlock = buildItemsBlock(lines: state.lines)
    let processedBy = displayUserName(user: appState.user)

    resolver.resolve(token: token, ids: [AppConstants.fromWarehouseId, toWarehouseId]) { names in
      let fromName = names[AppConstants.fromWarehouseId] ?? "From Warehouse"
      let toName = names[toWarehouseId] ?? "To Warehouse"
      let pdfName = buildTransferPdfFileName(fromName: fromName, toName: toName, dateTime: dateTime)
      let pdfData = PdfBuilder.buildTransferPdf(
        fromName: fromName,
        toName: toName,
        processedBy: processedBy,
        dateTime: dateTime,
        itemsBlock: itemsBlock
      )

      uploader.uploadPdf(bucket: "Transfers", fileName: pdfName, data: pdfData, token: token) { uploadError in
        DispatchQueue.main.async {
          if let uploadError = uploadError {
            isLoading = false
            errorMessage = uploadError.localizedDescription
            return
          }
          repository.transferUnits(token: token, fromWarehouseId: AppConstants.fromWarehouseId, toWarehouseId: toWarehouseId, items: items) { _, error in
            DispatchQueue.main.async {
              if let error = error {
                isLoading = false
                errorMessage = error.localizedDescription
                return
              }
              notifier.notify(
                context: "transfer",
                processedBy: processedBy,
                sourceLabel: fromName,
                destLabel: toName,
                itemsBlock: itemsBlock,
                reference: nil,
                dateTime: dateTime
              ) { notifyError in
                DispatchQueue.main.async {
                  isLoading = false
                  if notifyError != nil {
                    infoMessage = "Transfer done, but Telegram notification failed"
                  }
                  appState.route = .transfersDone
                }
              }
            }
          }
        }
      }
    }
  }
}
