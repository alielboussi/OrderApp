import SwiftUI

final class AppState: ObservableObject {
  private let sessionStore = SessionStore()
  private let sessionTimeoutMs: Int64 = 15 * 60 * 1000

  @Published var route: AppRoute = .login
  @Published var token: String? = nil
  @Published var user: LoginUserItem? = nil
  @Published var selectedSupplier: SupplierItem? = nil
  @Published var invoicePrefix: String? = nil
  @Published var invoiceSuffix: String = ""

  let transferState = TransferFlowState()
  let homesState = TransferFlowState()
  let damageState = DamageFlowState()
  let purchaseState = PurchaseFlowState()

  init() {
    restoreSession()
  }

  func setSupplier(_ supplier: SupplierItem) {
    selectedSupplier = supplier
    switch supplier.id {
    case "7bbc14aa-fdfd-4118-be52-bde6f06ae5b3":
      invoicePrefix = "INV-"
    case "4c5d2b00-1cd8-4d5e-b995-e3040bd26d8c":
      invoicePrefix = "INV"
    default:
      invoicePrefix = nil
    }
    invoiceSuffix = ""
  }

  var invoiceNumber: String {
    (invoicePrefix ?? "") + invoiceSuffix.uppercased()
  }

  func restoreSession() {
    guard let stored = sessionStore.readSession() else { return }
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    if now - stored.loginAtMs > sessionTimeoutMs {
      sessionStore.clearSession()
      return
    }
    token = stored.token
    user = LoginUserItem(id: stored.userId, email: stored.email, displayName: stored.displayName)
    route = .dashboard
  }

  func saveSession(token: String, user: LoginUserItem) {
    self.token = token
    self.user = user
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    sessionStore.saveSession(token: token, userId: user.id, email: user.email, displayName: user.displayName, loginAtMs: now)
    route = .dashboard
  }

  func logout() {
    sessionStore.clearSession()
    token = nil
    user = nil
    route = .login
  }

  func startTransfers() {
    transferState.reset()
    route = .transfers
  }

  func startHomes() {
    homesState.reset()
    route = .homes
  }

  func startDamages() {
    damageState.reset()
    route = .damages
  }

  func startPurchases() {
    purchaseState.reset()
    selectedSupplier = nil
    invoicePrefix = nil
    invoiceSuffix = ""
    route = .purchasesSetup
  }
}

enum AppRoute {
  case login
  case dashboard
  case transfers
  case transfersVariants
  case transfersSummary
  case transfersDone
  case homes
  case homesVariants
  case homesSummary
  case homesDone
  case damages
  case damagesVariants
  case damagesSummary
  case damagesDone
  case purchasesSetup
  case purchasesItems
  case purchasesVariants
  case purchasesSummary
  case purchasesDone
}

struct ContentView: View {
  @EnvironmentObject var appState: AppState

  var body: some View {
    NavigationStack {
      Group {
        switch appState.route {
        case .login:
          LoginView()
        case .dashboard:
          DashboardView()
        case .transfers:
          TransfersView(state: appState.transferState)
        case .transfersVariants:
          TransferVariantsView(state: appState.transferState)
        case .transfersSummary:
          TransferSummaryView(state: appState.transferState)
        case .transfersDone:
          SuccessView(title: "Transfer complete", subtitle: "Stock transfer recorded", buttonLabel: "Back to dashboard") {
            appState.route = .dashboard
          }
        case .homes:
          HomesView(state: appState.homesState)
        case .homesVariants:
          HomeVariantsView(state: appState.homesState)
        case .homesSummary:
          HomeSummaryView(state: appState.homesState)
        case .homesDone:
          SuccessView(title: "Transfer complete", subtitle: "Stock transfer recorded", buttonLabel: "Back to dashboard") {
            appState.route = .dashboard
          }
        case .damages:
          DamagesView(state: appState.damageState)
        case .damagesVariants:
          DamageVariantsView(state: appState.damageState)
        case .damagesSummary:
          DamageSummaryView(state: appState.damageState)
        case .damagesDone:
          SuccessView(title: "Damages recorded", subtitle: "Stock updated", buttonLabel: "Back to dashboard") {
            appState.route = .dashboard
          }
        case .purchasesSetup:
          PurchasesSetupView()
        case .purchasesItems:
          PurchasesItemsView(state: appState.purchaseState)
        case .purchasesVariants:
          PurchaseVariantsView(state: appState.purchaseState)
        case .purchasesSummary:
          PurchaseSummaryView(state: appState.purchaseState)
        case .purchasesDone:
          SuccessView(title: "Purchase recorded", subtitle: "Receipt saved", buttonLabel: "Back to dashboard") {
            appState.route = .dashboard
          }
        }
      }
      .animation(.spring(response: 0.4, dampingFraction: 0.85), value: appState.route)
      .transition(.opacity.combined(with: .move(edge: .trailing)))
    }
  }
}

struct SupplierItem: Identifiable {
  let id: String
  let name: String
}

struct LoginUserItem {
  let id: String
  let email: String
  let displayName: String?
}
