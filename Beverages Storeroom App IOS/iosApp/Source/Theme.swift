import SwiftUI

enum AppColors {
  static let blue = Color(red: 0.10, green: 0.33, blue: 0.70)
  static let blueSoft = Color(red: 0.92, green: 0.95, blue: 0.99)
  static let red = Color(red: 0.80, green: 0.20, blue: 0.20)
  static let green = Color(red: 0.12, green: 0.55, blue: 0.30)
  static let graySurface = Color(red: 0.92, green: 0.92, blue: 0.94)
}

struct CardStyle: ViewModifier {
  func body(content: Content) -> some View {
    content
      .padding(16)
      .background(AppColors.blueSoft)
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      .shadow(color: Color.black.opacity(0.08), radius: 8, x: 0, y: 6)
  }
}

extension View {
  func cardStyle() -> some View {
    modifier(CardStyle())
  }
}
