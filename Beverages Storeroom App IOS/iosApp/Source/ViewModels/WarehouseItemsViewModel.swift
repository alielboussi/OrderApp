import Foundation
import Shared

@MainActor
final class WarehouseItemsViewModel: ObservableObject {
  @Published var items: [WarehouseItemModel] = []
  @Published var isLoading: Bool = false
  @Published var errorMessage: String? = nil

  private let repository = SharedRepositoryProvider.shared.repository

  func load(token: String?, warehouseId: String?) {
    guard let token = token, let warehouseId = warehouseId, !isLoading else { return }
    isLoading = true
    errorMessage = nil
    repository.listWarehouseItems(token: token, warehouseId: warehouseId) { result, error in
      DispatchQueue.main.async {
        self.isLoading = false
        if let error = error {
          self.errorMessage = error.localizedDescription
          return
        }
        self.items = mapWarehouseItems(result ?? [])
      }
    }
  }
}
