import Foundation
import Shared

@MainActor
final class LoginViewModel: ObservableObject {
  @Published var email: String = ""
  @Published var pin: String = ""
  @Published var isLoading: Bool = false
  @Published var errorMessage: String? = nil

  private let repository = SharedRepositoryProvider.shared.repository

  func login(onSuccess: @escaping (String, LoginUserItem) -> Void) {
    errorMessage = nil
    let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedPin = pin.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedEmail.isEmpty, trimmedPin.count == 5 else {
      errorMessage = "Email and 5-digit PIN required"
      return
    }
    isLoading = true
    repository.login(email: trimmedEmail, pin: trimmedPin) { response, error in
      DispatchQueue.main.async {
        self.isLoading = false
        if let error = error {
          self.errorMessage = error.localizedDescription
          return
        }
        guard let response = response else {
          self.errorMessage = "Login failed"
          return
        }
        let user = response.user
        let mapped = LoginUserItem(id: user.id, email: user.email, displayName: user.displayName)
        onSuccess(response.token, mapped)
      }
    }
  }
}
