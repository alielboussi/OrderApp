import Foundation
import Shared

@MainActor
final class PurchasesSetupViewModel: ObservableObject {
  @Published var suppliers: [SupplierItem] = []
  @Published var selectedId: String? = nil
  @Published var isLoading: Bool = false
  @Published var errorMessage: String? = nil

  private let repository = SharedRepositoryProvider.shared.repository

  private let allowedSupplierIds: Set<String> = [
    "4c5d2b00-1cd8-4d5e-b995-e3040bd26d8c",
    "62cf884d-518b-4d04-a869-4836958fffcf",
    "7bbc14aa-fdfd-4118-be52-bde6f06ae5b3",
    "4a4f8dda-56fa-49f2-943b-2d2569e1e2a2"
  ]

  func loadSuppliers(token: String?) {
    guard let token = token, !isLoading else { return }
    isLoading = true
    errorMessage = nil
    repository.listSuppliers(token: token) { result, error in
      DispatchQueue.main.async {
        self.isLoading = false
        if let error = error {
          self.errorMessage = error.localizedDescription
          return
        }
        let mapped = (result ?? []).map { SupplierItem(id: $0.id, name: $0.name) }
        self.suppliers = mapped.filter { self.allowedSupplierIds.contains($0.id) }
      }
    }
  }
}
