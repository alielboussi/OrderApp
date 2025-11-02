package com.afterten.orders.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.core.net.toUri
import android.graphics.pdf.PdfDocument
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import com.afterten.orders.util.formatMoney
import androidx.compose.foundation.border
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.TopAppBar
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import com.afterten.orders.ui.components.AppOutlinedTextField
import androidx.compose.material3.HorizontalDivider
import com.afterten.orders.data.repo.ProductRepository
import com.afterten.orders.db.AppDatabase
import android.app.Activity
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import com.afterten.orders.db.PendingOrderEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.builtins.ListSerializer
import com.afterten.orders.sync.OrderSyncWorker

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun OrderSummaryScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onFinished: (pdfPath: String) -> Unit
) {
    val session = root.session.collectAsState().value
    val cartMap = root.cart.collectAsState().value
    val cart = cartMap.values.toList()
    val ctx = LocalContext.current
    val repo = remember { ProductRepository(root.supabaseProvider, AppDatabase.get(ctx)) }
    val products by repo.listenProducts().collectAsState(initial = emptyList())
    var orderNumber by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var placing by remember { mutableStateOf(false) }
    val lusakaNow = remember { ZonedDateTime.now(ZoneId.of("Africa/Lusaka")) }
    val sigState = rememberSignatureState()
    var sigSize by remember { mutableStateOf(IntSize.Zero) }
    val scope = rememberCoroutineScope()
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }

    LaunchedEffect(session?.token) {
        if (session?.token != null) {
            try {
                orderNumber = root.supabaseProvider.rpcNextOrderNumber(session.token, session.outletId)
            } catch (t: Throwable) { error = t.message }
        }
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Order Summary") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(imageVector = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        )
    }) { padding ->
        Column(
            Modifier
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            Text(text = "Order #: ${orderNumber ?: "…"}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Color.White)
            Text(text = "Date: ${lusakaNow.format(DateTimeFormatter.ofPattern("dd-MM-yyyy"))}", color = Color.White)
            Spacer(Modifier.height(12.dp))
            Text(text = "Items: ${cart.sumOf { it.qty }}  •  Subtotal: ${formatMoney(cart.sumOf { it.lineTotal })}", color = Color.White)

            // Grouped items with headers and red dividers
            val productsById = products.associateBy({ it.id }, { it.name })
            val groups = cart.groupBy { it.productId }
            Spacer(Modifier.height(12.dp))
            val colWidth = 76.dp
            groups.entries.forEachIndexed { index, entry ->
                val header = productsById[entry.key] ?: (entry.value.firstOrNull()?.name ?: "")
                // Main product header: larger and centered
                Text(
                    text = header,
                    style = MaterialTheme.typography.titleLarge.copy(fontSize = 48.sp),
                    fontWeight = FontWeight.Bold,
                    textDecoration = TextDecoration.Underline,
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(6.dp))
                // Column headers aligned to the right of the name
                Row(Modifier.fillMaxWidth()) {
                    Spacer(Modifier.weight(1f))
                    Text("UOM", modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.error)
                    Text("Cost", modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.error)
                    Text("Qty", modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.error)
                    Text("Amount", modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.error)
                }
                Spacer(Modifier.height(4.dp))
                entry.value.forEach { item ->
                    // Divider before each variance/item
                    HorizontalDivider(color = MaterialTheme.colorScheme.error.copy(alpha = 0.5f))
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = item.name,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                            color = Color.White,
                            modifier = Modifier.weight(1f)
                        )
                        Text(item.uom, modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = Color.White)
                        Text(formatMoney(item.unitPrice), modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = Color.White)
                        Text(item.qty.toString(), modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = Color.White)
                        Text(formatMoney(item.lineTotal), modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = Color.White)
                    }
                    Spacer(Modifier.height(6.dp))
                    // Divider after each variance/item
                    HorizontalDivider(color = MaterialTheme.colorScheme.error.copy(alpha = 0.5f))
                }
                if (index < groups.size - 1) {
                    HorizontalDivider(color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 8.dp))
                }
            }

            Spacer(Modifier.height(12.dp))
            // Employee name (required, auto-capitalized on submit)
            Text(text = "Employee Name", style = MaterialTheme.typography.titleMedium, color = Color.White)
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("First name", style = MaterialTheme.typography.bodyMedium, textDecoration = TextDecoration.Underline, color = Color.White)
                    Spacer(Modifier.height(4.dp))
                    AppOutlinedTextField(
                        value = firstName,
                        onValueChange = { firstName = it },
                        label = "",
                        modifier = Modifier.fillMaxWidth(),
                        borderColor = MaterialTheme.colorScheme.error,
                        borderThickness = 2.dp,
                        shape = RoundedCornerShape(50)
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text("Last name", style = MaterialTheme.typography.bodyMedium, textDecoration = TextDecoration.Underline, color = Color.White)
                    Spacer(Modifier.height(4.dp))
                    AppOutlinedTextField(
                        value = lastName,
                        onValueChange = { lastName = it },
                        label = "",
                        modifier = Modifier.fillMaxWidth(),
                        borderColor = MaterialTheme.colorScheme.error,
                        borderThickness = 2.dp,
                        shape = RoundedCornerShape(50)
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            Text("Customer Signature", style = MaterialTheme.typography.titleMedium, color = Color.White)
            Spacer(Modifier.height(6.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .border(1.5.dp, MaterialTheme.colorScheme.error, RoundedCornerShape(12.dp))
                    .padding(2.dp)
                    .onSizeChanged { sigSize = it }
            ) {
                SignaturePad(modifier = Modifier.fillMaxSize(), state = sigState)
            }
            Spacer(Modifier.height(16.dp))
            if (error != null) Text(text = error!!, color = MaterialTheme.colorScheme.error)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                OutlinedButton(onClick = onBack) { Text("Back") }
                Button(
                    onClick = { sigState.clear() },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError
                    ),
                    shape = RoundedCornerShape(50)
                ) { Text("Clear Signature") }
                Button(
                    onClick = {
                        placing = true
                        error = null
                        scope.launch(Dispatchers.IO) {
                            try {
                                val ses = session ?: error("No active session")
                                val number = orderNumber ?: error("No order number")
                                // Validate employee name and signature
                                val fn = firstName.trim()
                                val ln = lastName.trim()
                                if (fn.isEmpty() || ln.isEmpty()) error("Please enter first and last name")
                                val title = fn.lowercase().replaceFirstChar { it.titlecase() } + " " + ln.lowercase().replaceFirstChar { it.titlecase() }
                                if (!sigState.isMeaningful()) error("Please provide a valid signature")

                                // Build signature bitmap (PNG) with actual canvas size
                                val sigW = sigSize.width.coerceAtLeast(500)
                                val sigH = sigSize.height.coerceAtLeast(160)
                                val signatureBitmap = sigState.toBitmap(sigW, sigH)

                                // Upload signature image to Supabase Storage (signatures bucket)
                                runCatching {
                                    val baos = java.io.ByteArrayOutputStream()
                                    signatureBitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, baos)
                                    val sigBytes = baos.toByteArray()
                                    val capFn = fn.lowercase().replaceFirstChar { it.titlecase() }
                                    val capLn = ln.lowercase().replaceFirstChar { it.titlecase() }
                                    val outletSafe = ses.outletName.replace(" ", "_").replace(Regex("[^A-Za-z0-9_-]"), "")
                                    val sigDate = lusakaNow.format(DateTimeFormatter.ofPattern("dd-MM-yyyy"))
                                    val sigFile = "${capFn}_${capLn}_${sigDate}_${outletSafe}.png"
                                    val sigPath = "${ses.outletId}/$sigFile"
                                    root.supabaseProvider.uploadToStorage(
                                        jwt = ses.token,
                                        bucket = "signatures",
                                        path = sigPath,
                                        bytes = sigBytes,
                                        contentType = "image/png",
                                        upsert = true
                                    )
                                }

                                // Build PDF including all item details
                                val pdf = generateFullPdf(
                                    cacheDir = ctx.cacheDir,
                                    outletName = ses.outletName,
                                    orderNo = number,
                                    createdAt = lusakaNow,
                                    items = cart,
                                    employeeName = title,
                                    signatureBitmap = signatureBitmap
                                )
                                val pdfBytes = pdf.readBytes()
                                val dateStr = lusakaNow.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))
                                val safeOutlet = ses.outletName.replace(" ", "_")
                                    .replace(Regex("[^A-Za-z0-9_-]"), "")
                                val pdfFileName = "${safeOutlet}_${number}_${dateStr}.pdf"
                                val storagePath = "${ses.outletId}/$pdfFileName"

                                // Upload PDF to storage (orders bucket)
                                root.supabaseProvider.uploadToStorage(
                                    jwt = ses.token,
                                    bucket = "orders",
                                    path = storagePath,
                                    bytes = pdfBytes,
                                    contentType = "application/pdf",
                                    upsert = true
                                )

                                // Place order on server with employee name
                                val itemsReq = cart.map {
                                    SupabaseProvider.PlaceOrderItem(
                                        productId = it.productId,
                                        variationId = it.variationId,
                                        name = it.name,
                                        uom = it.uom,
                                        cost = it.unitPrice,
                                        qty = it.qty.toDouble()
                                    )
                                }
                                runCatching {
                                    root.supabaseProvider.rpcPlaceOrder(
                                        jwt = ses.token,
                                        outletId = ses.outletId,
                                        items = itemsReq,
                                        employeeName = title
                                    )
                                }.onFailure { placeErr ->
                                    // Queue for background sync
                                    val itemsJson = Json.encodeToString(
                                        ListSerializer(SupabaseProvider.PlaceOrderItem.serializer()),
                                        itemsReq
                                    )
                                    val db = AppDatabase.get(ctx)
                                    db.pendingOrderDao().upsert(
                                        PendingOrderEntity(
                                            outletId = ses.outletId,
                                            employeeName = title,
                                            itemsJson = itemsJson
                                        )
                                    )
                                    OrderSyncWorker.enqueue(ctx)
                                    // Inform the user and continue clearing cart (queued)
                                    error = "Order queued for sync and will be sent when online."
                                }

                                // Open in browser (prefer Chrome if available)
                                val publicUrl = "${root.supabaseProvider.supabaseUrl}/storage/v1/object/public/orders/${storagePath}"
                                val uri = publicUrl.toUri()
                                var intent = Intent(Intent.ACTION_VIEW, uri)
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                // Try to use Chrome if installed, fall back otherwise
                                intent.setPackage("com.android.chrome")
                                runCatching { ctx.startActivity(intent) }.onFailure {
                                    intent = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    ctx.startActivity(intent)
                                }

                                // Clear cart locally
                                root.clearCart()

                                // Notify completion (MainActivity observes and navigates Home)
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

private fun generateFullPdf(
    cacheDir: File,
    outletName: String,
    orderNo: String,
    createdAt: ZonedDateTime,
    items: List<RootViewModel.CartItem>,
    employeeName: String,
    signatureBitmap: android.graphics.Bitmap
): File {
    val doc = PdfDocument()
    val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // A4 @ 72dpi
    var page = doc.startPage(pageInfo)
    var canvas = page.canvas
    val paint = android.graphics.Paint().apply { textSize = 14f; color = android.graphics.Color.BLACK }

    var y = 40f
    canvas.drawText("Outlet: $outletName", 40f, y, paint); y += 20f
    canvas.drawText("Order #: $orderNo", 40f, y, paint); y += 18f
    canvas.drawText("Date: ${createdAt.format(DateTimeFormatter.ofPattern("dd-MM-yyyy"))}", 40f, y, paint); y += 24f
    canvas.drawText("Items:", 40f, y, paint); y += 18f
    // Table header
    canvas.drawText("Name", 40f, y, paint)
    canvas.drawText("UOM", 260f, y, paint)
    canvas.drawText("Unit", 320f, y, paint)
    canvas.drawText("Qty", 380f, y, paint)
    canvas.drawText("Amount", 430f, y, paint); y += 16f
    // Lines
    canvas.drawLine(40f, y, 555f, y, paint); y += 14f
    var subtotal = 0.0
    items.forEach { it ->
        val amount = it.lineTotal
        subtotal += amount
        canvas.drawText(it.name.take(30), 40f, y, paint)
        canvas.drawText(it.uom, 260f, y, paint)
        canvas.drawText(formatMoney(it.unitPrice), 320f, y, paint)
        canvas.drawText(it.qty.toString(), 380f, y, paint)
        canvas.drawText(formatMoney(amount), 430f, y, paint)
        y += 16f
        if (y > 760f) { // naive pagination
            doc.finishPage(page)
            page = doc.startPage(pageInfo)
            canvas = page.canvas
            y = 40f
            // Re-draw header on new page
            canvas.drawText("Outlet: $outletName", 40f, y, paint); y += 20f
            canvas.drawText("Order #: $orderNo", 40f, y, paint); y += 18f
            canvas.drawText("Date: ${createdAt.format(DateTimeFormatter.ofPattern("dd-MM-yyyy"))}", 40f, y, paint); y += 24f
            canvas.drawText("Items:", 40f, y, paint); y += 18f
            canvas.drawText("Name", 40f, y, paint)
            canvas.drawText("UOM", 260f, y, paint)
            canvas.drawText("Unit", 320f, y, paint)
            canvas.drawText("Qty", 380f, y, paint)
            canvas.drawText("Amount", 430f, y, paint); y += 16f
            canvas.drawLine(40f, y, 555f, y, paint); y += 14f
        }
    }
    y += 10f
    canvas.drawLine(320f, y, 555f, y, paint); y += 18f
    canvas.drawText("Subtotal: ${formatMoney(subtotal)}", 320f, y, paint); y += 24f
    y += 20f
    // Signature
    val sigBmp = signatureBitmap
    canvas.drawText("Signed by: $employeeName", 40f, y, paint); y += 18f
    canvas.drawBitmap(sigBmp, 40f, y, null); y += sigBmp.height + 20f

    doc.finishPage(page)

    val out = File(cacheDir, "order-$orderNo.pdf")
    FileOutputStream(out).use { doc.writeTo(it) }
    doc.close()
    return out
}
