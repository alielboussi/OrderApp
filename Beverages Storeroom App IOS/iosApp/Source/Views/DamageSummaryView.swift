import SwiftUI
import Shared

struct DamageSummaryView: View {
  @EnvironmentObject var appState: AppState
  @ObservedObject var state: DamageFlowState

  @State private var isLoading = false
  @State private var errorMessage: String? = nil
  @State private var infoMessage: String? = nil

  private let repository = SharedRepositoryProvider.shared.repository
  private let uploader = SupabaseStorageUploader()
  private let notifier = TelegramNotifier()
  private let resolver = WarehouseNameResolver()

  var body: some View {
    VStack(spacing: 12) {
      Text("Damage Summary")
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

      Button(isLoading ? "Submitting..." : "Confirm damage") {
        submitDamage()
      }
      .buttonStyle(.borderedProminent)
      .disabled(isLoading)
    }
    .padding(12)
    .toolbar {
      ToolbarItem(placement: .navigationBarLeading) {
        Button("Back") { appState.route = .damages }
      }
    }
  }

  private func submitDamage() {
    guard let token = appState.token, let warehouseId = state.warehouseId else {
      errorMessage = "Missing warehouse selection"
      return
    }
    isLoading = true
    errorMessage = nil
    infoMessage = nil
    let items = state.lines.map {
      SharedDamageItemRequest(itemId: $0.item.itemId, variantId: $0.item.variantId, quantity: $0.quantity)
    }
    let dateTime = formatDateTime()
    let itemsBlock = buildItemsBlock(lines: state.lines)
    let processedBy = displayUserName(user: appState.user)

    resolver.resolve(token: token, ids: [warehouseId]) { names in
      let warehouseName = names[warehouseId] ?? "Warehouse"
      let pdfName = buildDamagePdfFileName(warehouseName: warehouseName, dateTime: dateTime)
      let pdfData = PdfBuilder.buildDamagePdf(
        warehouseName: warehouseName,
        processedBy: processedBy,
        dateTime: dateTime,
        itemsBlock: itemsBlock
      )

      uploader.uploadPdf(bucket: "Damages", fileName: pdfName, data: pdfData, token: token) { uploadError in
        DispatchQueue.main.async {
          if let uploadError = uploadError {
            isLoading = false
            errorMessage = uploadError.localizedDescription
            return
          }
          repository.recordDamage(token: token, warehouseId: warehouseId, items: items) { _, error in
            DispatchQueue.main.async {
              if let error = error {
                isLoading = false
                errorMessage = error.localizedDescription
                return
              }
              notifier.notify(
                context: "damage",
                processedBy: processedBy,
                sourceLabel: warehouseName,
                destLabel: "Damages",
                itemsBlock: itemsBlock,
                reference: nil,
                dateTime: dateTime
              ) { notifyError in
                DispatchQueue.main.async {
                  isLoading = false
                  if notifyError != nil {
                    infoMessage = "Damage saved, but Telegram notification failed"
                  }
                  appState.route = .damagesDone
                }
              }
            }
          }
        }
      }
    }
  }
}
