import Foundation

final class SupabaseStorageUploader {
  func uploadPdf(
    bucket: String,
    fileName: String,
    data: Data,
    token: String,
    completion: @escaping (Error?) -> Void
  ) {
    let baseUrl = normalizeBaseUrl(AppSecrets.supabaseUrl)
    let urlString = "\(baseUrl)/storage/v1/object/\(bucket)/\(fileName)"
    guard let url = URL(string: urlString) else {
      completion(NSError(domain: "Supabase", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid storage URL"]))
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(AppSecrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("false", forHTTPHeaderField: "x-upsert")
    request.setValue("application/pdf", forHTTPHeaderField: "Content-Type")
    request.httpBody = data

    URLSession.shared.dataTask(with: request) { _, response, error in
      if let error = error {
        completion(error)
        return
      }
      guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
        completion(NSError(domain: "Supabase", code: -1, userInfo: [NSLocalizedDescriptionKey: "PDF upload failed"]))
        return
      }
      completion(nil)
    }.resume()
  }

  private func normalizeBaseUrl(_ raw: String) -> String {
    var url = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if url.hasSuffix("/") {
      url = String(url.dropLast())
    }
    if url.hasSuffix("/rest/v1") {
      url = String(url.dropLast("/rest/v1".count))
    }
    return url
  }
}
