import SwiftUI

struct SuccessView: View {
  let title: String
  let subtitle: String
  let buttonLabel: String
  let onAction: () -> Void

  var body: some View {
    VStack(spacing: 12) {
      Text(title)
        .font(.title3)
        .fontWeight(.semibold)

      Text(subtitle)
        .foregroundColor(.secondary)

      Button(buttonLabel) {
        onAction()
      }
      .buttonStyle(.borderedProminent)
    }
    .padding(20)
  }
}
