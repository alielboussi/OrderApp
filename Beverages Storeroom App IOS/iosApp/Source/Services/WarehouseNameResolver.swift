import Foundation
import Shared

final class WarehouseNameResolver {
  private let repository = SharedRepositoryProvider.shared.repository

  func resolve(token: String, ids: [String], completion: @escaping ([String: String]) -> Void) {
    repository.listWarehousesByIds(token: token, ids: ids) { result, _ in
      let map = (result ?? []).reduce(into: [String: String]()) { partial, item in
        partial[item.id] = item.name
      }
      DispatchQueue.main.async {
        completion(map)
      }
    }
  }
}
