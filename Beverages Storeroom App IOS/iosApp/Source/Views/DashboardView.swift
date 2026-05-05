import SwiftUI

struct DashboardView: View {
  @EnvironmentObject var appState: AppState

  var body: some View {
    VStack(spacing: 18) {
      Text("Beverages Storeroom App")
        .font(.title2)
        .fontWeight(.semibold)

      Text("Welcome \(appState.user?.displayName ?? appState.user?.email ?? "")")
        .font(.subheadline)
        .foregroundColor(.secondary)

      DashboardCard(title: "Transfers", subtitle: "Move stock between warehouses") {
        appState.startTransfers()
      }
      DashboardCard(title: "Purchases", subtitle: "Record inbound stock receipts") {
        appState.startPurchases()
      }
      DashboardCard(title: "Homes", subtitle: "Send stock to home warehouses") {
        appState.startHomes()
      }
      DashboardCard(title: "Damages", subtitle: "Record damaged stock") {
        appState.startDamages()
      }

      Spacer()
    }
    .padding(20)
    .toolbar {
      ToolbarItem(placement: .navigationBarTrailing) {
        Button("Logout") {
          appState.logout()
        }
      }
    }
  }
}

struct DashboardCard: View {
  let title: String
  let subtitle: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: 6) {
        Text(title)
          .font(.headline)
        Text(subtitle)
          .font(.subheadline)
          .foregroundColor(.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .cardStyle()
    }
    .buttonStyle(.plain)
  }
}
