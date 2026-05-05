import Foundation

struct StoredSession {
  let token: String
  let userId: String
  let email: String
  let displayName: String?
  let loginAtMs: Int64
}

final class SessionStore {
  private let defaults = UserDefaults.standard

  private let tokenKey = "token"
  private let userIdKey = "user_id"
  private let emailKey = "email"
  private let displayNameKey = "display_name"
  private let loginAtKey = "login_at_ms"

  func readSession() -> StoredSession? {
    guard let token = defaults.string(forKey: tokenKey),
          let userId = defaults.string(forKey: userIdKey),
          let email = defaults.string(forKey: emailKey) else {
      return nil
    }
    let displayName = defaults.string(forKey: displayNameKey)
    let loginAt = defaults.object(forKey: loginAtKey) as? Int64
    if let loginAt = loginAt {
      return StoredSession(token: token, userId: userId, email: email, displayName: displayName, loginAtMs: loginAt)
    }
    return nil
  }

  func saveSession(token: String, userId: String, email: String, displayName: String?, loginAtMs: Int64) {
    defaults.set(token, forKey: tokenKey)
    defaults.set(userId, forKey: userIdKey)
    defaults.set(email, forKey: emailKey)
    defaults.set(displayName, forKey: displayNameKey)
    defaults.set(loginAtMs, forKey: loginAtKey)
  }

  func clearSession() {
    defaults.removeObject(forKey: tokenKey)
    defaults.removeObject(forKey: userIdKey)
    defaults.removeObject(forKey: emailKey)
    defaults.removeObject(forKey: displayNameKey)
    defaults.removeObject(forKey: loginAtKey)
  }
}
