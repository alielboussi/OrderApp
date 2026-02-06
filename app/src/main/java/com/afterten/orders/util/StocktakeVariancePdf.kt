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

private fun drawFooter(
    canvas: Canvas,
    pageWidth: Int,
    pageHeight: Int,
    margin: Int
): Int {
    val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF111827.toInt()
        textSize = 10f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textAlign = Paint.Align.LEFT
    }
    val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFB91C1C.toInt()
        strokeWidth = 1.2f
        style = Paint.Style.STROKE
    }
    val disclaimerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF374151.toInt()
        textSize = 9f
        textAlign = Paint.Align.CENTER
    }

    val boxSize = 48f
    val labelGap = 6f
    val stackGap = 18f
    val footerHeight = (labelPaint.textSize + labelGap + boxSize) * 2 + stackGap + 18f
    val top = pageHeight - margin - footerHeight

    val leftX = margin.toFloat()
    val nameLineWidth = 90f
    val nameLineY1 = top + 14f
    canvas.drawText("Managers Name:", leftX, nameLineY1, labelPaint)
    canvas.drawLine(leftX + 110f, nameLineY1 + 2f, leftX + 110f + nameLineWidth, nameLineY1 + 2f, linePaint)
    val box1Top = nameLineY1 + labelGap
    canvas.drawRect(leftX, box1Top, leftX + boxSize, box1Top + boxSize, linePaint)

    val nameLineY2 = box1Top + boxSize + stackGap + labelPaint.textSize
    canvas.drawText("Stocktaker's Name:", leftX, nameLineY2, labelPaint)
    canvas.drawLine(leftX + 130f, nameLineY2 + 2f, leftX + 130f + nameLineWidth, nameLineY2 + 2f, linePaint)
    val box2Top = nameLineY2 + labelGap
    canvas.drawRect(leftX, box2Top, leftX + boxSize, box2Top + boxSize, linePaint)

    val disclaimerY = box2Top + boxSize + 14f
    canvas.drawText(
        "P.S “The above signatures state that the provided data is accurate and valid.”",
        (pageWidth / 2f),
        disclaimerY,
        disclaimerPaint
    )

    return top.toInt()
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
        textSize = 15f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val subPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF374151.toInt()
        textSize = 9.5f
    }
    var y = margin + 14
    logo?.let {
        val target = Rect(margin, margin, margin + 48, margin + 48)
        canvas.drawBitmap(it, null, target, null)
    }
    canvas.drawText(title, (pageWidth / 2f) - (headerPaint.measureText(title) / 2f), y.toFloat(), headerPaint)
    y += 12
    subLines.forEach {
        canvas.drawText(it, (pageWidth / 2f) - (subPaint.measureText(it) / 2f), y.toFloat(), subPaint)
        y += 11
    }
    return y + 4
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
        textSize = 9f
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
        textSize = 9.5f
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
    val margin = 14
    val doc = PdfDocument()
    val logo = loadAppLogo(context, 56)

    val columns = listOf(
        PdfColumn("Variant", 0.30f),
        PdfColumn("Opening", 0.08f, alignRight = true),
        PdfColumn("Transfers", 0.08f, alignRight = true),
        PdfColumn("Damages", 0.07f, alignRight = true),
        PdfColumn("Sales", 0.07f, alignRight = true),
        PdfColumn("Expected", 0.09f, alignRight = true),
        PdfColumn("Closing", 0.08f, alignRight = true),
        PdfColumn("Variance", 0.08f, alignRight = true),
        PdfColumn("Variant Amount", 0.15f, alignRight = true)
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
    val rowHeight = 14f

    while (rowIndex < report.rows.size || rowIndex == 0) {
        val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create()
        val page = doc.startPage(pageInfo)
        val canvas = page.canvas

        drawWatermark(canvas, "Afterten Takeaway & Restaurant Ltd", pageWidth, pageHeight)
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

        val footerTop = drawFooter(canvas, pageWidth, pageHeight, margin)
        val maxY = footerTop - 56
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
