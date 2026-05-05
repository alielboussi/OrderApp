import SwiftUI

struct LoginView: View {
  @EnvironmentObject var appState: AppState
  @StateObject private var viewModel = LoginViewModel()

  var body: some View {
    VStack(spacing: 16) {
      Text("Beverages Storeroom Login")
        .font(.title3)
        .fontWeight(.semibold)

      TextField("Email", text: $viewModel.email)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .padding(12)
        .background(AppColors.graySurface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

      SecureField("PIN", text: $viewModel.pin)
        .keyboardType(.numberPad)
        .padding(12)
        .background(AppColors.graySurface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

      if let error = viewModel.errorMessage {
        Text(error)
          .foregroundColor(AppColors.red)
          .font(.footnote)
      }

      Button(viewModel.isLoading ? "Signing in..." : "Login") {
        viewModel.login { token, user in
          appState.saveSession(token: token, user: user)
        }
      }
      .buttonStyle(.borderedProminent)
      .disabled(viewModel.isLoading)

      Spacer()
    }
    .padding(20)
  }
}
