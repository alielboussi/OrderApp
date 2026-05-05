import Foundation
import Shared

@MainActor
final class WarehousesByIdViewModel: ObservableObject {
  @Published var warehouses: [SelectableItem] = []
  @Published var selectedId: String? = nil
  @Published var isLoading: Bool = false
  @Published var errorMessage: String? = nil

  private let repository = SharedRepositoryProvider.shared.repository
  private let ids: [String]

  init(ids: [String]) {
    self.ids = ids
  }

  func load(token: String?) {
    guard let token = token, !isLoading else { return }
    isLoading = true
    errorMessage = nil
    repository.listWarehousesByIds(token: token, ids: ids) { result, error in
      DispatchQueue.main.async {
        self.isLoading = false
        if let error = error {
          self.errorMessage = error.localizedDescription
          return
        }
        self.warehouses = (result ?? []).map { SelectableItem(id: $0.id, title: $0.name) }
        if self.selectedId == nil {
          self.selectedId = self.warehouses.first?.id
        }
      }
    }
  }
}
