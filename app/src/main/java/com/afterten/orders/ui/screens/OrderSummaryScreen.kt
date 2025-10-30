package com.afterten.orders.ui.screens

import android.graphics.pdf.PdfDocument
import android.os.Environment
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel
import com.afterten.orders.ui.components.SignaturePad
import com.afterten.orders.ui.components.rememberSignatureState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import com.afterten.orders.data.SupabaseProvider
import java.nio.file.Files

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun OrderSummaryScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onFinished: (pdfPath: String) -> Unit
) {
    val session = root.session.collectAsState().value
    val cart = root.cart.collectAsState().value.values.toList()
    val ctx = LocalContext.current
    var orderNumber by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var placing by remember { mutableStateOf(false) }
    val lusakaNow = remember { ZonedDateTime.now(ZoneId.of("Africa/Lusaka")) }
    val sigState = rememberSignatureState()
    val scope = rememberCoroutineScope()

    LaunchedEffect(session?.token) {
        if (session?.token != null) {
            try {
                orderNumber = root.supabaseProvider.rpcNextOrderNumber(session.token, session.outletId)
            } catch (t: Throwable) { error = t.message }
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Order Summary") }) }) { padding ->
        Column(Modifier.padding(padding).padding(16.dp)) {
            Text(text = "Order #: ${orderNumber ?: "…"}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(text = "Time (Lusaka): ${lusakaNow.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))}")
            Spacer(Modifier.height(16.dp))
            Text(text = "Items: ${cart.sumOf { it.qty }}  •  Subtotal: $" + "%.2f".format(cart.sumOf { it.lineTotal }))
            Spacer(Modifier.height(16.dp))
            Text("Customer Signature", style = MaterialTheme.typography.titleMedium)
            SignaturePad(modifier = Modifier.fillMaxWidth().height(180.dp), state = sigState)
            Spacer(Modifier.height(16.dp))
            if (error != null) Text(text = error!!, color = MaterialTheme.colorScheme.error)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                OutlinedButton(onClick = onBack) { Text("Back") }
                Button(
                    onClick = {
                        placing = true
                        error = null
                        scope.launch(Dispatchers.IO) {
                            try {
                                val number = orderNumber ?: error("No order number")
                                val pdf = generatePdf(
                                    ctx.cacheDir,
                                    number,
                                    cart = cart.map { Triple(it.name, it.qty, it.lineTotal) },
                                    signature = sigState
                                )
                                val pdfBytes = pdf.readBytes()
                                val pdfPath = "invoices/${session!!.outletId}/order-$number.pdf"

                                // Upload PDF to storage (make sure the bucket exists and policy allows authenticated uploads)
                                root.supabaseProvider.uploadToStorage(
                                    jwt = session.token,
                                    bucket = "invoices",
                                    path = pdfPath,
                                    bytes = pdfBytes,
                                    contentType = "application/pdf",
                                    upsert = true
                                )

                                // Prepare items per schema
                                val items = cart.map {
                                    SupabaseProvider.PlaceOrderItem(
                                        productId = it.productId,
                                        variationId = it.variationId,
                                        name = it.name,
                                        uom = it.uom,
                                        cost = it.unitPrice,
                                        qty = it.qty.toDouble()
                                    )
                                }

                                val result = root.supabaseProvider.rpcPlaceOrder(
                                    jwt = session!!.token,
                                    outletId = session.outletId,
                                    items = items,
                                    employeeName = "Android App"
                                )

                                // Clear cart locally
                                root.clearCart()

                                // Notify completion
                                onFinished(pdf.absolutePath)
                            } catch (t: Throwable) {
                                error = t.message
                            } finally {
                                placing = false
                            }
                        }
                    },
                    enabled = cart.isNotEmpty() && orderNumber != null && !placing
                ) {
                    Text(if (placing) "Placing…" else "Place Order")
                }
            }
        }
    }
}

private fun generatePdf(cacheDir: File, orderNo: String, cart: List<Triple<String, Int, Double>>, signature: com.afterten.orders.ui.components.SignatureState): File {
    val doc = PdfDocument()
    val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // A4 @ 72dpi
    val page = doc.startPage(pageInfo)
    val c = page.canvas
    val paint = android.graphics.Paint().apply { textSize = 14f; color = android.graphics.Color.BLACK }

    var y = 40f
    c.drawText("Afterten Orders", 40f, y, paint); y += 24f
    c.drawText("Order #$orderNo", 40f, y, paint); y += 20f
    c.drawText("Items:", 40f, y, paint); y += 20f
    cart.forEach { (name, qty, total) ->
        c.drawText("- $name  x$qty  = $" + String.format("%.2f", total), 50f, y, paint); y += 18f
    }
    y += 20f
    // Signature
    val sigBmp = signature.toBitmap(500, 160)
    c.drawText("Signature:", 40f, y, paint); y += 18f
    c.drawBitmap(sigBmp, 40f, y, null); y += sigBmp.height + 20f

    doc.finishPage(page)

    val out = File(cacheDir, "order-$orderNo.pdf")
    FileOutputStream(out).use { doc.writeTo(it) }
    doc.close()
    return out
}
