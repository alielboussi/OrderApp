package com.afterten.orders.ui.screens

import android.content.Intent
import android.app.DownloadManager
import android.content.Context
import android.os.Environment
import android.net.Uri
import androidx.core.net.toUri
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
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import com.afterten.orders.data.SupabaseProvider
import com.afterten.orders.util.PdfLine
import com.afterten.orders.util.PdfProductGroup
import com.afterten.orders.util.formatMoney
import com.afterten.orders.util.generateOrderPdf
import com.afterten.orders.util.rememberScreenLogger
import com.afterten.orders.util.sanitizeForFile
import com.afterten.orders.util.toBlackInk
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
import androidx.compose.ui.draw.clipToBounds
import com.afterten.orders.db.PendingOrderEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.builtins.ListSerializer
import com.afterten.orders.sync.OrderSyncWorker
import kotlinx.coroutines.withContext
import android.graphics.BitmapFactory
// Use fully qualified android.graphics.Color where needed to avoid Compose Color conflict
import kotlinx.coroutines.delay
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun OrderSummaryScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onFinished: (pdfPath: String) -> Unit
) {
    val session by root.session.collectAsState()
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
    val logger = rememberScreenLogger("OrderSummary")

    val hasAccess = session.hasRole(RoleGuards.Branch)
    if (!hasAccess) {
        AccessDeniedCard(
            title = "Branch access required",
            message = "Only branch (outlet) operators can capture employee, driver, and offloader signatures.",
            primaryLabel = "Back to Home",
            onPrimary = onBack
        )
        return
    }

    LaunchedEffect(Unit) {
        logger.enter(mapOf("cartLines" to cart.size))
    }
    LaunchedEffect(cart) {
        logger.state(
            "CartSnapshot",
            mapOf(
                "lines" to cart.size,
                "qty" to cart.sumOf { it.qty },
                "subtotal" to cart.sumOf { it.lineTotal }
            )
        )
    }
    LaunchedEffect(orderNumber) {
        orderNumber?.let { logger.state("OrderNumberAssigned", mapOf("value" to it)) }
    }
    LaunchedEffect(error) {
        error?.let { logger.warn("InlineError", mapOf("message" to it.take(80))) }
    }

    LaunchedEffect(session?.token) {
        val currentSession = session
        val jwt = currentSession?.token ?: return@LaunchedEffect
        try {
            logger.state("FetchingOrderNumber", mapOf("outletId" to currentSession.outletId))
            orderNumber = root.supabaseProvider.rpcNextOrderNumber(jwt, currentSession.outletId)
            logger.state("OrderNumberFetched")
        } catch (t: Throwable) {
            error = t.message
            logger.error("OrderNumberFailed", t)
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
                    Text("Qty", modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.error)
                    Text("UOM", modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.error)
                    Text("Cost", modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.error)
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
                        Text(item.qty.toString(), modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = Color.White)
                        Text(item.purchasePackUnit, modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = Color.White)
                        Text(formatMoney(item.unitPrice), modifier = Modifier.width(colWidth), textAlign = TextAlign.Center, color = Color.White)
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
                    .clipToBounds()
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
                        logger.event(
                            "PlaceOrderTapped",
                            mapOf(
                                "cartLines" to cart.size,
                                "hasOrderNumber" to (orderNumber != null)
                            )
                        )
                        placing = true
                        error = null
                        scope.launch {
                            logger.state(
                                "PlaceOrderCoroutineStart",
                                mapOf(
                                    "cartLines" to cart.size,
                                    "subtotal" to cart.sumOf { it.lineTotal }
                                )
                            )
                            try {
                                val ses = session ?: run {
                                    logger.error("MissingSessionDuringOrder")
                                    error("No active session")
                                }
                                val number = orderNumber ?: run {
                                    logger.error("MissingOrderNumber")
                                    error("No order number")
                                }
                                // Validate employee name and signature
                                val fn = firstName.trim()
                                val ln = lastName.trim()
                                if (fn.isEmpty() || ln.isEmpty()) {
                                    logger.warn("ValidationFailed", mapOf("reason" to "missing_employee_name"))
                                    error("Please enter first and last name")
                                }
                                val title = fn.lowercase().replaceFirstChar { it.titlecase() } + " " + ln.lowercase().replaceFirstChar { it.titlecase() }
                                if (!sigState.isMeaningful()) {
                                    logger.warn("ValidationFailed", mapOf("reason" to "missing_signature"))
                                    error("Please provide a valid signature")
                                }

                                // Build signature bitmap (PNG) with actual canvas size
                                val sigW = sigSize.width.coerceAtLeast(500)
                                val sigH = sigSize.height.coerceAtLeast(160)
                                // Use BLACK for PDF contrast (UI stroke is white)
                                val signatureBitmapLocal = sigState.toBitmap(sigW, sigH, colorOverride = android.graphics.Color.BLACK)

                                withContext(Dispatchers.IO) {
                                    // Upload signature image to Supabase Storage (signatures bucket)
                                    val sigPath = runCatching {
                                        val baos = java.io.ByteArrayOutputStream()
                                        signatureBitmapLocal.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, baos)
                                        val sigBytes = baos.toByteArray()
                                        val capFn = fn.lowercase().replaceFirstChar { it.titlecase() }
                                        val capLn = ln.lowercase().replaceFirstChar { it.titlecase() }
                                        val outletSafe = ses.outletName.sanitizeForFile(ses.outletId.ifBlank { "outlet" })
                                        val sigDate = lusakaNow.format(DateTimeFormatter.ofPattern("dd-MM-yyyy"))
                                        val sigFile = "${capFn}_${capLn}_${sigDate}_${outletSafe}.png"
                                        val sp = "${ses.outletId}/$sigFile"
                                        root.supabaseProvider.uploadToStorage(
                                            jwt = ses.token,
                                            bucket = "signatures",
                                            path = sp,
                                            bytes = sigBytes,
                                            contentType = "image/png",
                                            upsert = true
                                        )
                                        sp
                                    }.getOrElse { "${ses.outletId}/signature-${number}.png" }
                                    logger.state("SignatureUploaded", mapOf("path" to sigPath))

                                    // Build PDF including signature fetched from bucket (ensures the stored one is used)
                                    // Poll up to 5 times for eventual consistency
                                    var signatureBitmap: android.graphics.Bitmap = signatureBitmapLocal
                                    runCatching {
                                        val sigUrl = root.supabaseProvider.publicStorageUrl("signatures", sigPath)
                                        var bytes: ByteArray? = null
                                        repeat(5) { attempt ->
                                            bytes = runCatching { root.supabaseProvider.downloadBytes(sigUrl) }.getOrNull()
                                            if (bytes != null && bytes!!.isNotEmpty()) return@repeat
                                            kotlinx.coroutines.delay(200L * (attempt + 1))
                                        }
                                        bytes?.let {
                                            val bmp = BitmapFactory.decodeByteArray(it, 0, it.size)
                                            // Convert any non-transparent pixels to black for PDF readability
                                            signatureBitmap = bmp.toBlackInk()
                                        }
                                    }

                                    // Build PDF including grouped layout shared with supervisor/driver flows
                                    val productNames = products.associateBy({ it.id }, { it.name })
                                    val pdfGroups = cart.groupBy { it.productId }.map { entry ->
                                        val header = productNames[entry.key] ?: entry.value.firstOrNull()?.name.orEmpty()
                                        PdfProductGroup(
                                            header = header,
                                            lines = entry.value.map {
                                                PdfLine(
                                                    name = it.name,
                                                    qty = it.qty.toDouble(),
                                                    uom = it.purchasePackUnit,
                                                    unitPrice = it.unitPrice
                                                )
                                            }
                                        )
                                    }
                                    val pdf = generateOrderPdf(
                                        cacheDir = ctx.cacheDir,
                                        outletName = ses.outletName,
                                        orderNo = number,
                                        createdAt = lusakaNow,
                                        groups = pdfGroups,
                                        signerLabel = "Signed By Outlet Employee Name",
                                        signerName = title,
                                        signatureBitmap = signatureBitmap
                                    )
                                    val pdfBytes = pdf.readBytes()
                                    val dateStr = lusakaNow.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))
                                    val safeOutlet = ses.outletName.sanitizeForFile(ses.outletId.ifBlank { "outlet" })
                                    val pdfFileName = "${safeOutlet}_${number}_${dateStr}.pdf"
                                    val storagePath = "${ses.outletId}/$pdfFileName"
                                    logger.state("PdfGenerated", mapOf("fileName" to pdfFileName))

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
                                        val qtyCases = it.qty.toDouble()
                                                val unitsPerPack = it.unitsPerPurchasePack.takeIf { size -> size > 0 } ?: 1.0
                                                val qtyUnits = qtyCases * unitsPerPack
                                        SupabaseProvider.PlaceOrderItem(
                                            productId = it.productId,
                                            variationId = it.variationId,
                                            variantKey = it.variationId,
                                            name = it.name,
                                            receivingUom = it.purchasePackUnit,
                                            consumptionUom = it.consumptionUom,
                                            cost = it.unitPrice,
                                            qty = qtyUnits,
                                            qtyCases = qtyCases,
                                            packageContains = unitsPerPack
                                        )
                                    }
                                    var placedRemotely = false
                                    try {
                                        val rpcRes = root.supabaseProvider.rpcPlaceOrder(
                                            jwt = ses.token,
                                            outletId = ses.outletId,
                                            items = itemsReq,
                                            employeeName = title,
                                            signaturePath = sigPath,
                                            pdfPath = storagePath
                                        )
                                        placedRemotely = true
                                        logger.state("OrderRpcSuccess", mapOf("orderId" to rpcRes.orderId))
                                        // Supervisor approval is required before allocation.
                                    } catch (placeErr: Throwable) {
                                        // Fallback: insert directly via PostgREST
                                        runCatching {
                                            val order = root.supabaseProvider.insertOrder(
                                                jwt = ses.token,
                                                outletId = ses.outletId,
                                                orderNumber = number,
                                                tz = lusakaNow.zone.id,
                                                status = "placed"
                                            )
                                            root.supabaseProvider.insertOrderItems(
                                                jwt = ses.token,
                                                orderId = order.id,
                                                items = itemsReq
                                            )
                                        }.onSuccess {
                                            placedRemotely = true
                                            logger.state("OrderFallbackSuccess")
                                        }.onFailure {
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
                                            logger.warn("OrderQueuedForSync", mapOf("outletId" to ses.outletId))
                                            withContext(Dispatchers.Main) {
                                                error = "Order queued for sync and will be sent when online."
                                            }
                                        }
                                    }

                                    // Prepare a signed URL (works for private buckets) and download the PDF via DownloadManager
                                    val publicUrl = try {
                                        root.supabaseProvider.createSignedUrl(
                                            jwt = ses.token,
                                            bucket = "orders",
                                            path = storagePath,
                                            expiresInSeconds = 3600,
                                            downloadName = pdfFileName
                                        )
                                    } catch (_: Throwable) {
                                        // Fallback to public URL if signing fails and bucket is public
                                        root.supabaseProvider.publicStorageUrl("orders", storagePath, pdfFileName)
                                    }
                                    withContext(Dispatchers.Main) {
                                        if (placedRemotely) {
                                            // Proactively notify Orders screen to refresh now
                                            root.supabaseProvider.emitOrdersChanged()
                                            logger.state("OrdersChangeEmitted")
                                        }
                                        // Clear cart and navigate home BEFORE kicking off download
                                        root.clearCart()
                                        logger.state("CartClearedAfterOrder")
                                        onFinished(pdf.absolutePath)
                                        logger.state("OrderSummaryFinished", mapOf("pdf" to pdf.absolutePath))

                                        // Enqueue download
                                        val dm = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                                        val req = DownloadManager.Request(publicUrl.toUri())
                                            .setTitle(pdfFileName)
                                            .setMimeType("application/pdf")
                                            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                                            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, pdfFileName)
                                        runCatching { dm.enqueue(req) }
                                            .onSuccess { logger.state("PdfDownloadEnqueued") }
                                    }
                                }
                            } catch (t: Throwable) {
                                error = t.message
                                logger.error("PlaceOrderFlowFailed", t)
                            } finally {
                                placing = false
                                logger.state("PlaceOrderCoroutineEnd")
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

// Legacy PDF helpers moved to com.afterten.orders.util.OrderPdf
