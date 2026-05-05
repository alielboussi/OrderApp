import SwiftUI

struct QtyEntrySheet: View {
  let title: String
  @State private var qtyText: String
  let onSave: (Double) -> Void

  init(title: String, initialQty: Double?, onSave: @escaping (Double) -> Void) {
    self.title = title
    self.onSave = onSave
    _qtyText = State(initialValue: initialQty.map { String($0) } ?? "")
  }

  var body: some View {
    VStack(spacing: 16) {
      Text(title)
        .font(.headline)

      TextField("Quantity", text: $qtyText)
        .keyboardType(.decimalPad)
        .padding(12)
        .background(AppColors.graySurface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

      Button("Save") {
        let value = Double(qtyText) ?? 0
        if value > 0 {
          onSave(value)
        }
      }
      .buttonStyle(.borderedProminent)
    }
    .padding(20)
  }
}
