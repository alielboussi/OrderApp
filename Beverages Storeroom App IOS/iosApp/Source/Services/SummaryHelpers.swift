import Foundation

func formatDateTime() -> String {
  let formatter = DateFormatter()
  formatter.dateFormat = "dd/MM/yyyy HH:mm"
  return formatter.string(from: Date())
}

func sanitizeFileName(_ value: String) -> String {
  let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
  let cleaned = value.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" }
  return String(cleaned)
}

func displayUserName(user: LoginUserItem?) -> String {
  return user?.displayName ?? user?.email ?? "User"
}

func buildItemsBlock(lines: [TransferLine]) -> String {
  if lines.isEmpty { return "• No line items provided" }
  return lines.map { line in
    let variant = line.item.variantName ?? line.item.variantId ?? ""
    let label = variant.isEmpty ? line.item.itemName : "\(line.item.itemName) - \(variant)"
    return "• \(label): \(line.quantity)"
  }.joined(separator: "\n")
}

func buildItemsBlock(lines: [PurchaseLine]) -> String {
  if lines.isEmpty { return "• No line items provided" }
  return lines.map { line in
    let variant = line.item.variantName ?? line.item.variantId ?? ""
    let label = variant.isEmpty ? line.item.itemName : "\(line.item.itemName) - \(variant)"
    return "• \(label): \(line.quantity)"
  }.joined(separator: "\n")
}

func buildTransferPdfFileName(fromName: String, toName: String, dateTime: String) -> String {
  let fromSafe = sanitizeFileName(fromName)
  let toSafe = sanitizeFileName(toName)
  let dateSafe = sanitizeFileName(dateTime)
  return "Transfer_\(fromSafe)_to_\(toSafe)_\(dateSafe).pdf"
}

func buildDamagePdfFileName(warehouseName: String, dateTime: String) -> String {
  let warehouseSafe = sanitizeFileName(warehouseName)
  let dateSafe = sanitizeFileName(dateTime)
  return "Damage_\(warehouseSafe)_\(dateSafe).pdf"
}

func buildPurchasePdfFileName(supplierName: String, warehouseName: String, dateTime: String) -> String {
  let supplierSafe = sanitizeFileName(supplierName)
  let warehouseSafe = sanitizeFileName(warehouseName)
  let dateSafe = sanitizeFileName(dateTime)
  return "Purchase_\(supplierSafe)_\(warehouseSafe)_\(dateSafe).pdf"
}
