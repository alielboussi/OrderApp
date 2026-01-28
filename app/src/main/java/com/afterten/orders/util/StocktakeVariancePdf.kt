package com.afterten.orders.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.graphics.drawable.toBitmap
import java.io.File
import java.io.FileOutputStream
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Locale

private data class PdfColumn(
    val title: String,
    val weight: Float,
    val alignRight: Boolean = false
)

private val decimalSymbols = DecimalFormatSymbols(Locale.US)
private val qtyFormat = DecimalFormat("#,##0.###", decimalSymbols)
private val currencyFormat = DecimalFormat("#,##0", decimalSymbols)

private fun formatQty(value: Double): String = qtyFormat.format(value)

private fun formatCurrencyK(value: Double): String {
    val sign = if (value < 0) "-" else ""
    val abs = kotlin.math.abs(value)
    return "${sign}K ${currencyFormat.format(abs)}"
}

private fun formatStamp(raw: String?): String {
    if (raw.isNullOrBlank()) return "—"
    val trimmed = raw.replace('T', ' ')
    return if (trimmed.length > 19) trimmed.take(19) else trimmed
}

private fun loadAppLogo(context: Context, sizePx: Int): Bitmap? {
    return runCatching {
        val drawable = context.packageManager.getApplicationIcon(context.packageName)
        drawable.toBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    }.getOrNull()
}

private fun drawWatermark(canvas: Canvas, text: String, pageWidth: Int, pageHeight: Int) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x1A111827
        textSize = 24f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    canvas.save()
    canvas.rotate(-28f, pageWidth / 2f, pageHeight / 2f)
    val stepX = 260
    val stepY = 140
    var y = -pageHeight
    while (y < pageHeight * 2) {
        var x = -pageWidth
        while (x < pageWidth * 2) {
            canvas.drawText(text, x.toFloat(), y.toFloat(), paint)
            x += stepX
        }
        y += stepY
    }
    canvas.restore()
}

private fun drawHeader(
    canvas: Canvas,
    pageWidth: Int,
    margin: Int,
    logo: Bitmap?,
    title: String,
    subLines: List<String>
): Int {
    val headerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF111827.toInt()
        textSize = 18f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val subPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF374151.toInt()
        textSize = 11f
    }
    var y = margin + 18
    logo?.let {
        val target = Rect(margin, margin, margin + 56, margin + 56)
        canvas.drawBitmap(it, null, target, null)
    }
    canvas.drawText(title, (pageWidth / 2f) - (headerPaint.measureText(title) / 2f), y.toFloat(), headerPaint)
    y += 14
    subLines.forEach {
        canvas.drawText(it, (pageWidth / 2f) - (subPaint.measureText(it) / 2f), y.toFloat(), subPaint)
        y += 13
    }
    return y + 6
}

private fun drawTableHeader(
    canvas: Canvas,
    columns: List<PdfColumn>,
    left: Float,
    top: Float,
    tableWidth: Float
): Float {
    val headerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF6B7280.toInt()
        textSize = 10f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    var x = left
    columns.forEach { col ->
        val width = tableWidth * col.weight
        canvas.drawText(col.title, x + 4, top, headerPaint)
        x += width
    }
    val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFF2B6B6.toInt()
        strokeWidth = 1f
    }
    canvas.drawLine(left, top + 6, left + tableWidth, top + 6, linePaint)
    return top + 18
}

private fun drawBorder(canvas: Canvas, pageWidth: Int, pageHeight: Int, margin: Int) {
    val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFB91C1C.toInt()
        style = Paint.Style.STROKE
        strokeWidth = 2f
    }
    canvas.drawRect(
        margin.toFloat(),
        margin.toFloat(),
        (pageWidth - margin).toFloat(),
        (pageHeight - margin).toFloat(),
        borderPaint
    )
}

private fun drawRow(
    canvas: Canvas,
    columns: List<PdfColumn>,
    left: Float,
    top: Float,
    tableWidth: Float,
    values: List<String>
) {
    val rowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF111827.toInt()
        textSize = 11f
    }
    var x = left
    columns.forEachIndexed { index, col ->
        val width = tableWidth * col.weight
        val value = values.getOrNull(index).orEmpty()
        val textX = if (col.alignRight) x + width - rowPaint.measureText(value) - 4 else x + 4
        canvas.drawText(value, textX, top, rowPaint)
        x += width
    }
    val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFF2B6B6.toInt()
        strokeWidth = 1f
    }
    canvas.drawLine(left, top + 6, left + tableWidth, top + 6, linePaint)
}

fun generateStocktakeVariancePdf(
    cacheDir: File,
    context: Context,
    report: com.afterten.orders.ui.stocktake.StocktakeViewModel.VarianceReport
): File {
    val pageWidth = 595
    val pageHeight = 842
    val margin = 24
    val doc = PdfDocument()
    val logo = loadAppLogo(context, 56)

    val columns = listOf(
        PdfColumn("Item Name", 0.26f),
        PdfColumn("Opening Stock Qty", 0.09f, alignRight = true),
        PdfColumn("Transfers", 0.09f, alignRight = true),
        PdfColumn("Damages", 0.08f, alignRight = true),
        PdfColumn("Sales", 0.08f, alignRight = true),
        PdfColumn("Expected Stock", 0.10f, alignRight = true),
        PdfColumn("Actual Closing Stock", 0.10f, alignRight = true),
        PdfColumn("Variance Qty", 0.10f, alignRight = true),
        PdfColumn("Variance Amount", 0.10f, alignRight = true)
    )

    val openedAt = formatStamp(report.period.openedAt)
    val closedAt = if (report.period.status.equals("closed", true)) {
        formatStamp(report.period.closedAt)
    } else {
        formatStamp(report.generatedAt)
    }
    val headerLines = listOf(
        "Opened: $openedAt",
        "Closed: $closedAt",
        "Status: ${report.period.status.uppercase()}"
    )

    var rowIndex = 0
    var pageNumber = 1
    val tableLeft = margin.toFloat()
    val tableWidth = (pageWidth - margin * 2).toFloat()
    val rowHeight = 18f

    while (rowIndex < report.rows.size || rowIndex == 0) {
        val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create()
        val page = doc.startPage(pageInfo)
        val canvas = page.canvas

        drawWatermark(canvas, "Afterten Takeaway & Restaurant", pageWidth, pageHeight)
        drawBorder(canvas, pageWidth, pageHeight, margin)

        var cursorY = drawHeader(
            canvas = canvas,
            pageWidth = pageWidth,
            margin = margin,
            logo = logo,
            title = "Afterten Stocktake",
            subLines = headerLines
        )

        val headerY = cursorY.toFloat()
        cursorY = drawTableHeader(canvas, columns, tableLeft, headerY, tableWidth).toInt()

        val maxY = pageHeight - margin - 20
        while (rowIndex < report.rows.size && cursorY + rowHeight < maxY) {
            val row = report.rows[rowIndex]
            drawRow(
                canvas = canvas,
                columns = columns,
                left = tableLeft,
                top = cursorY.toFloat(),
                tableWidth = tableWidth,
                values = listOf(
                    row.itemLabel,
                    formatQty(row.openingQty),
                    formatQty(row.transfersQty),
                    formatQty(row.damagesQty),
                    formatQty(row.salesQty),
                    formatQty(row.expectedQty),
                    formatQty(row.closingQty),
                    formatQty(row.varianceQty),
                    formatCurrencyK(row.varianceAmount)
                )
            )
            rowIndex += 1
            cursorY += rowHeight.toInt()
        }

        val footerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF374151.toInt()
            textSize = 9f
        }
        val footerText = "Page $pageNumber"
        canvas.drawText(footerText, pageWidth - margin - footerPaint.measureText(footerText), (pageHeight - margin / 2).toFloat(), footerPaint)

        doc.finishPage(page)
        pageNumber += 1
        if (report.rows.isEmpty()) break
    }

    val fileName = "stocktake-variance-${report.period.id.take(8)}.pdf"
    val outputFile = File(cacheDir, fileName)
    FileOutputStream(outputFile).use { out ->
        doc.writeTo(out)
    }
    doc.close()
    return outputFile
}
