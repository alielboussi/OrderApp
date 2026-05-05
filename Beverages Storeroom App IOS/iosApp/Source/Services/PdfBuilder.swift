import Foundation
import UIKit

enum PdfBuilder {
  static func buildTransferPdf(
    fromName: String,
    toName: String,
    processedBy: String,
    dateTime: String,
    itemsBlock: String
  ) -> Data {
    return buildPdf(
      title: "Transfer Summary",
      lines: [
        "From Warehouse: \(fromName)",
        "To Warehouse: \(toName)",
        "Username: \(processedBy)",
        "Date & Time: \(dateTime)",
        "Products:",
        itemsBlock
      ]
    )
  }

  static func buildDamagePdf(
    warehouseName: String,
    processedBy: String,
    dateTime: String,
    itemsBlock: String
  ) -> Data {
    return buildPdf(
      title: "Damage Summary",
      lines: [
        "Warehouse: \(warehouseName)",
        "Username: \(processedBy)",
        "Date & Time: \(dateTime)",
        "Products:",
        itemsBlock
      ]
    )
  }

  static func buildPurchasePdf(
    supplierName: String,
    warehouseName: String,
    processedBy: String,
    dateTime: String,
    itemsBlock: String
  ) -> Data {
    return buildPdf(
      title: "Purchase Summary",
      lines: [
        "Supplier: \(supplierName)",
        "To Warehouse: \(warehouseName)",
        "Username: \(processedBy)",
        "Date & Time: \(dateTime)",
        "Products:",
        itemsBlock
      ]
    )
  }

  private static func buildPdf(title: String, lines: [String]) -> Data {
    let pageRect = CGRect(x: 0, y: 0, width: 612, height: 792)
    let renderer = UIGraphicsPDFRenderer(bounds: pageRect)
    let data = renderer.pdfData { context in
      context.beginPage()
      let titleFont = UIFont.boldSystemFont(ofSize: 22)
      let bodyFont = UIFont.systemFont(ofSize: 14)
      var cursorY: CGFloat = 40
      let paddingX: CGFloat = 40

      let titleRect = CGRect(x: paddingX, y: cursorY, width: pageRect.width - 2 * paddingX, height: 30)
      title.draw(in: titleRect, withAttributes: [.font: titleFont])
      cursorY += 44

      for line in lines {
        let rect = CGRect(x: paddingX, y: cursorY, width: pageRect.width - 2 * paddingX, height: 60)
        line.draw(in: rect, withAttributes: [.font: bodyFont])
        cursorY += 28
        if cursorY > pageRect.height - 60 {
          context.beginPage()
          cursorY = 40
        }
      }
    }
    return data
  }
}
