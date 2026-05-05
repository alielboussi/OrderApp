import Foundation

final class TelegramNotifier {
  func notify(
    context: String,
    processedBy: String,
    sourceLabel: String,
    destLabel: String,
    itemsBlock: String,
    reference: String?,
    dateTime: String?,
    completion: @escaping (Error?) -> Void
  ) {
    let token = AppSecrets.telegramBotToken
    let chatId = AppSecrets.telegramChatId
    if token.isEmpty || chatId.isEmpty {
      completion(NSError(domain: "Telegram", code: -1, userInfo: [NSLocalizedDescriptionKey: "Telegram credentials missing"]))
      return
    }

    let typeLabel: String
    switch context.lowercased() {
    case "purchase":
      typeLabel = "Purchase"
    case "damage":
      typeLabel = "Damage"
    default:
      typeLabel = "Transfer"
    }

    var lines: [String] = []
    lines.append("<b>\(escapeHtml(typeLabel))</b>")
    if context.lowercased() != "damage" {
      lines.append("From: \(escapeHtml(sourceLabel))")
      lines.append("To: \(escapeHtml(destLabel))")
    }
    if context.lowercased() == "purchase", let reference = reference, !reference.isEmpty {
      lines.append("Reference / Invoice #: \(escapeHtml(reference))")
    }
    if let dateTime = dateTime, !dateTime.isEmpty {
      lines.append("Date &amp; Time: \(escapeHtml(dateTime))")
    }
    lines.append("Operator: \(escapeHtml(processedBy))")
    lines.append("Products:")
    lines.append(itemsBlock.isEmpty ? "• No line items provided" : escapeHtml(itemsBlock))

    let message = lines.joined(separator: "\n")
    let payload: [String: Any] = [
      "chat_id": chatId,
      "text": message,
      "parse_mode": "HTML"
    ]

    guard let url = URL(string: "https://api.telegram.org/bot\(token)/sendMessage") else {
      completion(NSError(domain: "Telegram", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid Telegram URL"]))
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: payload, options: [])

    URLSession.shared.dataTask(with: request) { _, response, error in
      if let error = error {
        completion(error)
        return
      }
      guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
        completion(NSError(domain: "Telegram", code: -1, userInfo: [NSLocalizedDescriptionKey: "Telegram notify failed"]))
        return
      }
      completion(nil)
    }.resume()
  }

  private func escapeHtml(_ value: String) -> String {
    return value
      .replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
      .replacingOccurrences(of: "\"", with: "&quot;")
      .replacingOccurrences(of: "'", with: "&#39;")
  }
}
