import Foundation
import Shared

final class SharedRepositoryProvider {
  static let shared = SharedRepositoryProvider()

  let repository: SharedRepository

  private init() {
    let config = SharedAppConfig.shared
    config.supabaseUrl = AppSecrets.supabaseUrl
    config.supabaseAnonKey = AppSecrets.supabaseAnonKey
    let api = SharedSupabaseApi()
    repository = SharedRepository(api: api)
  }
}
