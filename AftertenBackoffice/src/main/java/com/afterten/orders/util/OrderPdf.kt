package com.afterten.orders.util

import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.pdf.PdfDocument
import com.afterten.orders.data.repo.OrderRepository
import java.io.File
import java.io.FileOutputStream
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Shared PDF generator used by outlet placement, supervisor approval, driver loading and offloading flows.
 */
data class PdfLine(
    val name: String,
    val qty: Double,
    val uom: String,
    val unitPrice: Double
)

data class PdfProductGroup(
    val header: String,
    val lines: List<PdfLine>
)

fun generateOrderPdf(
    cacheDir: File,
    outletName: String,
    orderNo: String,
    createdAt: ZonedDateTime,
    groups: List<PdfProductGroup>,
    signerLabel: String,
    signerName: String,
    signatureBitmap: Bitmap
): File {
    val doc = PdfDocument()
    val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // A4 @ 72dpi
    var page = doc.startPage(pageInfo)
    var canvas = page.canvas
    val paint = Paint().apply { textSize = 14f; color = android.graphics.Color.BLACK }
    val headerPaint = Paint().apply { textSize = 24f; isFakeBoldText = true; color = android.graphics.Color.BLACK }
    val underlinePaint = Paint().apply { strokeWidth = 2f; color = android.graphics.Color.BLACK }
    val redPaint = Paint().apply { strokeWidth = 1.5f; color = android.graphics.Color.rgb(220, 20, 60) }
    val lineSpacing = paint.textSize + 2f
    val nameColumnWidth = 240f

    fun wrapProductName(text: String, maxWidth: Float): List<String> {
        if (text.isBlank()) return listOf("")
        val lines = mutableListOf<String>()
        var remaining = text.trim()
        while (remaining.isNotEmpty()) {
            val count = paint.breakText(remaining, true, maxWidth, null)
            if (count <= 0) break
            var take = count
            if (take < remaining.length) {
                val lastSpace = remaining.substring(0, count).lastIndexOf(' ')
                if (lastSpace > 0) take = lastSpace + 1
            }
            val line = remaining.substring(0, take).trim()
            if (line.isNotEmpty()) lines += line else lines += remaining.substring(0, take)
            remaining = remaining.substring(take).trimStart()
        }
        return if (lines.isEmpty()) listOf("") else lines
    }

    var y = 40f
    canvas.drawText("Outlet: $outletName", 40f, y, paint); y += 20f
    canvas.drawText("Order #: $orderNo", 40f, y, paint); y += 18f
    canvas.drawText("Date: ${createdAt.format(DateTimeFormatter.ofPattern("dd-MM-yyyy"))}", 40f, y, paint); y += 24f
    canvas.drawText("Items:", 40f, y, paint); y += 10f

    fun newPageIfNeeded(targetY: Float) {
        if (targetY > 780f) {
            doc.finishPage(page)
            page = doc.startPage(pageInfo)
            canvas = page.canvas
            y = 40f
            canvas.drawText("Outlet: $outletName", 40f, y, paint); y += 20f
            canvas.drawText("Order #: $orderNo", 40f, y, paint); y += 18f
            canvas.drawText("Date: ${createdAt.format(DateTimeFormatter.ofPattern("dd-MM-yyyy"))}", 40f, y, paint); y += 24f
            canvas.drawText("Items:", 40f, y, paint); y += 10f
        }
    }

    var subtotal = 0.0
    groups.forEachIndexed { idx, group ->
        val header = group.header
        val headerWidth = headerPaint.measureText(header)
        val centerX = (595 - 40 - 40) / 2f + 40
        newPageIfNeeded(y + 64f)
        val headerBaseline = y + 28f
        canvas.drawText(header, centerX - headerWidth / 2f, headerBaseline, headerPaint)
        val ulY = headerBaseline + 4f
        canvas.drawLine(centerX - headerWidth / 2f, ulY, centerX + headerWidth / 2f, ulY, underlinePaint)
        y = ulY + 12f
        canvas.drawLine(40f, y, 555f, y, redPaint)
        y += 18f
        canvas.drawText("Qty", 300f, y, paint)
        canvas.drawText("UOM", 340f, y, paint)
        canvas.drawText("Cost", 400f, y, paint)
        canvas.drawText("Amount", 470f, y, paint)
        y += 16f
        group.lines.forEach { line ->
            val wrappedNameLines = wrapProductName(line.name, nameColumnWidth)
            val extraNameHeight = if (wrappedNameLines.size <= 1) 0f else (wrappedNameLines.size - 1) * lineSpacing
            newPageIfNeeded(y + 26f + extraNameHeight)
            canvas.drawLine(40f, y, 555f, y, redPaint); y += 14f
            val amount = line.qty * line.unitPrice
            subtotal += amount
            val nameBaseline = y
            wrappedNameLines.forEachIndexed { index, text ->
                canvas.drawText(text, 40f, nameBaseline + index * lineSpacing, paint)
            }
            canvas.drawText(line.qty.renderQty(), 300f, nameBaseline, paint)
            canvas.drawText(line.uom, 340f, nameBaseline, paint)
            canvas.drawText(formatMoney(line.unitPrice), 400f, nameBaseline, paint)
            canvas.drawText(formatMoney(amount), 470f, nameBaseline, paint)
            y = nameBaseline + extraNameHeight + 12f
            canvas.drawLine(40f, y, 555f, y, redPaint)
            y += 4f
        }
        if (idx < groups.size - 1) {
            y += 10f
            canvas.drawLine(40f, y, 555f, y, paint)
            y += 6f
        }
    }

    y += 10f
    canvas.drawLine(320f, y, 555f, y, paint); y += 18f
    canvas.drawText("Subtotal: ${formatMoney(subtotal)}", 320f, y, paint); y += 24f
    y += 20f

    val sigBmp = signatureBitmap
    val cm = 72f / 2.54f
    val boxSize = 6f * cm
    val innerMax = 5f * cm
    val boxLeft = 40f
    newPageIfNeeded(y + 18f + boxSize + 20f)
    canvas.drawText("$signerLabel: $signerName", boxLeft, y, paint)
    y += 18f
    val rectPaint = Paint().apply { style = Paint.Style.STROKE; strokeWidth = 1.5f; color = android.graphics.Color.BLACK }
    canvas.drawRect(boxLeft, y, boxLeft + boxSize, y + boxSize, rectPaint)
    val pad = max(2f, (boxSize - innerMax) / 2f)
    val availW = innerMax
    val availH = innerMax
    val scale = min(availW / sigBmp.width, availH / sigBmp.height)
    val drawW = sigBmp.width * scale
    val drawH = sigBmp.height * scale
    val dx = boxLeft + pad + (availW - drawW) / 2f
    val dy = y + pad + (availH - drawH) / 2f
    val dest = RectF(dx, dy, dx + drawW, dy + drawH)
    canvas.drawBitmap(sigBmp, null, dest, null)
    y += boxSize + 20f

    doc.finishPage(page)

    val out = File(cacheDir, "order-$orderNo.pdf")
    FileOutputStream(out).use { doc.writeTo(it) }
    doc.close()
    return out
}

private fun Double.renderQty(): String {
    val rounded = toLong()
    return if (abs(this - rounded.toDouble()) < 0.0001) rounded.toString() else String.format(java.util.Locale.US, "%.2f", this)
}

fun Bitmap.toBlackInk(): Bitmap {
    val w = width
    val h = height
    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val pixels = IntArray(w * h)
    getPixels(pixels, 0, w, 0, 0, w, h)
    for (i in pixels.indices) {
        val a = (pixels[i] ushr 24) and 0xFF
        pixels[i] = if (a > 8) (a shl 24) else 0x00000000.toInt()
    }
    out.setPixels(pixels, 0, w, 0, 0, w, h)
    return out
}

fun List<OrderRepository.OrderItemRow>.toPdfGroups(): List<PdfProductGroup> =
    this.groupBy { it.product?.name?.takeIf { name -> name.isNotBlank() } ?: it.name }
        .entries
        .sortedBy { it.key }
        .map { (header, items) ->
            PdfProductGroup(
                header = header,
                lines = items.map {
                    PdfLine(
                        name = it.name,
                        qty = it.qty,
                        uom = it.uom,
                        unitPrice = it.cost
                    )
                }
            )
        }

fun String?.sanitizeForFile(fallback: String = "value"): String = this
    ?.takeIf { it.isNotBlank() }
    ?.replace(" ", "_")
    ?.replace(Regex("[^A-Za-z0-9_-]"), "")
    ?.ifBlank { null }
    ?: fallback
