import SwiftUI

struct SelectableGrid: View {
  let title: String
  let items: [SelectableItem]
  let selectedId: String?
  let onSelect: (SelectableItem) -> Void

  private let columns = [GridItem(.flexible()), GridItem(.flexible())]

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(title)
        .font(.headline)
      LazyVGrid(columns: columns, spacing: 10) {
        ForEach(items) { item in
          Button {
            onSelect(item)
          } label: {
            Text(item.title)
              .font(.subheadline)
              .foregroundColor(selectedId == item.id ? .white : .black)
              .frame(maxWidth: .infinity, minHeight: 44)
              .padding(.horizontal, 8)
              .background(selectedId == item.id ? AppColors.blue : AppColors.graySurface)
              .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          }
          .buttonStyle(.plain)
        }
      }
    }
  }
}

struct SelectableItem: Identifiable {
  let id: String
  let title: String
}
