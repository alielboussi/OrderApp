package com.afterten.orders.util

import android.graphics.Bitmap
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import com.afterten.orders.util.shadows.TestShadowPdfDocument
import com.afterten.orders.util.shadows.TestShadowPdfPage
import java.time.ZonedDateTime

@RunWith(RobolectricTestRunner::class)
@Config(
    sdk = [34],
    manifest = Config.NONE,
    shadows = [TestShadowPdfDocument::class, TestShadowPdfPage::class]
)
class OrderPdfTest {
    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun generatesPdfWithPurchasePackUnits() {
        val cacheDir = tmp.newFolder("pdf-cache")
        val signature = Bitmap.createBitmap(24, 24, Bitmap.Config.ARGB_8888)
        val groups = listOf(
            PdfProductGroup(
                header = "Mayonnaise",
                lines = listOf(
                    PdfLine(
                        name = "Bulk Mayo Case",
                        qty = 5.0,
                        uom = "CASE",
                        unitPrice = 120.0
                    )
                )
            )
        )

        val pdfFile = generateOrderPdf(
            cacheDir = cacheDir,
            outletName = "Test Outlet",
            orderNo = "OUT-0001",
            createdAt = ZonedDateTime.now(),
            groups = groups,
            signerLabel = "Signed By",
            signerName = "Automated Test",
            signatureBitmap = signature
        )

        assertTrue("PDF file should exist", pdfFile.exists())
        assertTrue("PDF file should not be empty", pdfFile.length() > 0)
    }
}
