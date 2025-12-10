package com.afterten.orders.util.shadows

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.pdf.PdfDocument
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import org.robolectric.shadow.api.Shadow
import java.io.OutputStream

@Implements(PdfDocument::class)
class TestShadowPdfDocument {
    private var closed = false

    @Implementation
    protected fun __constructor__() {
        closed = false
    }

    @Implementation
    protected fun startPage(pageInfo: PdfDocument.PageInfo): PdfDocument.Page {
        if (closed) throw IllegalStateException("document is closed")
        val page = Shadow.newInstanceOf(PdfDocument.Page::class.java)
        Shadow.extract<TestShadowPdfPage>(page).setup(pageInfo)
        return page
    }

    @Implementation
    protected fun finishPage(page: PdfDocument.Page) {
        // no-op; we just trust calls occur in the right order for smoke testing
    }

    @Implementation
    protected fun writeTo(out: OutputStream) {
        out.write("fake-pdf".toByteArray(Charsets.UTF_8))
    }

    @Implementation
    protected fun close() {
        closed = true
    }
}

@Implements(PdfDocument.Page::class)
class TestShadowPdfPage {
    private lateinit var canvas: Canvas
    private lateinit var info: PdfDocument.PageInfo

    fun setup(pageInfo: PdfDocument.PageInfo) {
        info = pageInfo
        val bitmap = Bitmap.createBitmap(pageInfo.pageWidth, pageInfo.pageHeight, Bitmap.Config.ARGB_8888)
        canvas = Canvas(bitmap)
    }

    @Implementation
    protected fun getCanvas(): Canvas = canvas

    @Implementation
    protected fun getInfo(): PdfDocument.PageInfo = info
}
