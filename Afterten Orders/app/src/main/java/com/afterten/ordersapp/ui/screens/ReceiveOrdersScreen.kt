package com.afterten.ordersapp.ui.screens

import android.app.DownloadManager
import android.graphics.Bitmap
import android.os.Environment
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import com.afterten.ordersapp.RootViewModel
import com.afterten.ordersapp.data.RoleGuards
import com.afterten.ordersapp.data.hasRole
import com.afterten.ordersapp.data.repo.OrderRepository
import com.afterten.ordersapp.ui.components.AccessDeniedCard
import com.afterten.ordersapp.ui.components.OrderStatusIcon
import com.afterten.ordersapp.ui.components.SignatureCaptureDialog
import com.afterten.ordersapp.util.LogAnalytics
import com.afterten.ordersapp.util.generateOrderPdf
import com.afterten.ordersapp.util.rememberScreenLogger
import com.afterten.ordersapp.util.sanitizeForFile
import com.afterten.ordersapp.util.toPdfGroups
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReceiveOrdersScreen(
    root: RootViewModel,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val repo = remember { OrderRepository(root.supabaseProvider) }
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val logger = rememberScreenLogger("ReceiveOrders")

    val hasAccess = session.hasRole(RoleGuards.Branch)
    if (!hasAccess) {
        AccessDeniedCard(
            title = "Branch access required",
            message = "Only branch (outlet) operators can receive deliveries.",
            primaryLabel = "Back to Home",
            onPrimary = onBack
        )
        return
    }

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf(listOf<OrderRepository.OrderRow>()) }
    var receiveTarget by remember { mutableStateOf<OrderRepository.OrderRow?>(null) }
    var receiveDetail by remember { mutableStateOf<OrderRepository.OrderDetail?>(null) }
    var receivePrefillName by remember { mutableStateOf("") }
    var receiveSubmitting by remember { mutableStateOf(false) }

    LaunchedEffect(items.size) {
        logger.state("OrdersListUpdated", mapOf("count" to items.size))
    }

    LaunchedEffect(session?.token, session?.outletId) {
        val s = session
        if (s == null) {
            items = emptyList()
            loading = false
            return@LaunchedEffect
        }
        loading = true
        error = null
        logger.state("InitialLoadStart", mapOf("outletId" to s.outletId))
        try {
            items = repo.listOrdersForOutlet(jwt = s.token, outletId = s.outletId, limit = 200)
            LogAnalytics.event("receive_orders_loaded", mapOf("count" to items.size))
            logger.state("InitialLoadSuccess", mapOf("count" to items.size))
            loading = false
        } catch (t: Throwable) {
            error = t.message ?: t.toString()
            LogAnalytics.error("receive_orders_load_failed", error, t)
            logger.error("InitialLoadFailed", t, mapOf("outletId" to s.outletId))
            loading = false
        }
    }

    LaunchedEffect(session?.token, session?.outletId) {
        val s = session ?: return@LaunchedEffect
        root.supabaseProvider.ordersEvents.collect {
            runCatching {
                logger.event("RealtimeOrdersEvent", mapOf("outletId" to s.outletId))
                val newItems = repo.listOrdersForOutlet(jwt = s.token, outletId = s.outletId, limit = 200)
                items = newItems
                LogAnalytics.event("receive_orders_refreshed", mapOf("count" to newItems.size))
                logger.state("RealtimeRefreshSuccess", mapOf("count" to newItems.size))
            }
        }
    }

    DisposableEffect(session?.token, session?.outletId) {
        val s = session
        val outletId = s?.outletId?.takeIf { it.isNotBlank() }
        if (s != null && outletId != null) {
            val handle = root.supabaseProvider.subscribeOrders(
                jwt = s.token,
                outletId = outletId
            ) {
                root.supabaseProvider.emitOrdersChanged()
            }
            onDispose { handle.close() }
        } else {
            onDispose { }
        }
    }

    suspend fun submitReceive(
        row: OrderRepository.OrderRow,
        cachedDetail: OrderRepository.OrderDetail?,
        signerName: String,
        signatureBitmap: Bitmap
    ) {
        logger.event("ReceiveSubmissionStart", mapOf("orderId" to row.id))
        val s = session ?: error("No active session")
        val detail = cachedDetail
            ?: repo.fetchOrder(jwt = s.token, orderId = row.id)
            ?: error("Order not found")
        val itemsForPdf = repo.listOrderItems(jwt = s.token, orderId = row.id)
        val pdfGroups = itemsForPdf.toPdfGroups()
        if (pdfGroups.isEmpty()) error("Order has no items to receive")
        val tzId = detail.timezone?.takeIf { it.isNotBlank() } ?: "Africa/Lusaka"
        val zone = runCatching { ZoneId.of(tzId) }.getOrElse { ZoneId.of("Africa/Lusaka") }
        val now = ZonedDateTime.now(zone)
        val outletName = detail.outlet?.name ?: s.outletName.ifBlank { detail.outletId ?: "Outlet" }
        val outletFolder = detail.outletId ?: s.outletId.ifBlank { "orders" }
        val safeOutlet = outletName.sanitizeForFile()
        val safeOrder = detail.orderNumber.sanitizeForFile()
        val dateStr = now.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        val signaturePath = "${outletFolder}/deliveries/${safeOrder}_Receipt_${dateStr}.png"
        val pdfPath = "${outletFolder}/deliveries/${safeOutlet}_${safeOrder}_${dateStr}_received.pdf"

        withContext(Dispatchers.IO) {
            ByteArrayOutputStream().use { baos ->
                signatureBitmap.compress(Bitmap.CompressFormat.PNG, 100, baos)
                root.supabaseProvider.uploadToStorage(
                    jwt = s.token,
                    bucket = "signatures",
                    path = signaturePath,
                    bytes = baos.toByteArray(),
                    contentType = "image/png",
                    upsert = true
                )
            }

            val pdfFile = generateOrderPdf(
                cacheDir = ctx.cacheDir,
                outletName = outletName,
                orderNo = detail.orderNumber,
                createdAt = now,
                groups = pdfGroups,
                signerLabel = "Received By",
                signerName = signerName,
                signatureBitmap = signatureBitmap
            )
            val pdfBytes = pdfFile.readBytes()
            pdfFile.delete()
            root.supabaseProvider.uploadToStorage(
                jwt = s.token,
                bucket = "orders",
                path = pdfPath,
                bytes = pdfBytes,
                contentType = "application/pdf",
                upsert = true
            )

            root.supabaseProvider.markOrderOffloaded(
                jwt = s.token,
                orderId = row.id,
                offloaderName = signerName,
                signaturePath = signaturePath,
                pdfPath = pdfPath
            )
        }
        logger.state("OrderReceived", mapOf("orderId" to row.id))
    }

    val filteredItems = remember(items) {
        items.filter { status ->
            val key = status.status.lowercase(Locale.US)
            key == "loaded" || key == "offloaded" || key == "delivered"
        }
    }

    LaunchedEffect(session?.token, receiveTarget?.id) {
        receiveDetail = null
        receivePrefillName = ""
        val s = session ?: return@LaunchedEffect
        val target = receiveTarget ?: return@LaunchedEffect
        runCatching { repo.fetchOrder(jwt = s.token, orderId = target.id) }
            .onSuccess { detail ->
                receiveDetail = detail
                receivePrefillName = detail?.offloaderName.orEmpty()
            }
            .onFailure { t ->
                logger.warn("ReceiveDetailLoadFailed", mapOf("orderId" to target.id), t)
                snackbarHostState.showSnackbar(
                    message = t.message ?: "Unable to load order detail",
                    withDismissAction = true
                )
            }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Receive Orders") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(enabled = !loading, onClick = {
                        scope.launch {
                            val s = session ?: return@launch
                            loading = true
                            error = null
                            logger.event("ManualRefreshStart", mapOf("outletId" to s.outletId))
                            runCatching {
                                repo.listOrdersForOutlet(jwt = s.token, outletId = s.outletId, limit = 200)
                            }.onSuccess { list ->
                                items = list
                                LogAnalytics.event("receive_orders_refreshed", mapOf("count" to list.size))
                                logger.state("ManualRefreshSuccess", mapOf("count" to list.size))
                            }.onFailure { t ->
                                error = t.message ?: t.toString()
                                logger.error("ManualRefreshFailed", t, mapOf("outletId" to s.outletId))
                            }
                            loading = false
                        }
                    }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        when {
            loading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            error != null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("Error: $error")
            }
            else -> LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                if (filteredItems.isEmpty()) {
                    item(key = "empty") {
                        Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                            Text("No loaded orders to receive.")
                        }
                    }
                }
                items(filteredItems) { row ->
                    ReceiveOrderRow(
                        row = row,
                        onDownload = {
                            logger.event("DownloadTapped", mapOf("orderId" to row.id))
                            val ses = session ?: return@ReceiveOrderRow
                            scope.launch {
                                val dateStr = try {
                                    OffsetDateTime.parse(row.createdAt).format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))
                                } catch (_: Throwable) {
                                    row.createdAt.take(10)
                                }
                                val safeOutlet = ses.outletName.sanitizeForFile(ses.outletId.ifBlank { "outlet" })
                                val fileName = "${safeOutlet}_${row.orderNumber}_${dateStr}.pdf"
                                val storagePath = "${ses.outletId}/$fileName"
                                val url = runCatching {
                                    root.supabaseProvider.createSignedUrl(
                                        jwt = ses.token,
                                        bucket = "orders",
                                        path = storagePath,
                                        expiresInSeconds = 3600,
                                        downloadName = fileName
                                    )
                                }.getOrElse {
                                    root.supabaseProvider.publicStorageUrl("orders", storagePath, fileName)
                                }
                                val dm = ctx.getSystemService(android.content.Context.DOWNLOAD_SERVICE) as DownloadManager
                                val req = DownloadManager.Request(url.toUri())
                                    .setTitle(fileName)
                                    .setMimeType("application/pdf")
                                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                                runCatching { dm.enqueue(req) }
                            }
                        },
                        onReceive = {
                            logger.event("ReceiveTapped", mapOf("orderId" to row.id, "status" to row.status))
                            receiveTarget = row
                        }
                    )
                    HorizontalDivider()
                }
            }
        }
    }

    if (receiveTarget != null) {
        SignatureCaptureDialog(
            title = "Receive Order",
            nameLabel = "Received By",
            confirmLabel = if (receiveSubmitting) "Submitting…" else "Sign & Receive",
            initialName = receivePrefillName,
            onDismiss = { if (!receiveSubmitting) receiveTarget = null },
            onConfirm = { name, bitmap ->
                scope.launch {
                    logger.event(
                        "ReceiveDialogConfirmed",
                        mapOf("orderId" to (receiveTarget?.id ?: ""), "nameProvided" to name.isNotBlank())
                    )
                    receiveSubmitting = true
                    val currentTarget = receiveTarget
                    val result = runCatching {
                        currentTarget?.let { submitReceive(it, receiveDetail, name, bitmap) }
                            ?: error("No order selected")
                    }
                    bitmap.recycle()
                    result
                        .onSuccess {
                            val ses = session
                            if (ses != null) {
                                runCatching {
                                    repo.listOrdersForOutlet(jwt = ses.token, outletId = ses.outletId, limit = 200)
                                }.onSuccess { refreshed -> items = refreshed }
                            }
                            root.supabaseProvider.emitOrdersChanged()
                            logger.state("OrderReceived", mapOf("orderId" to (currentTarget?.id ?: "")))
                            snackbarHostState.showSnackbar("Order received")
                            receiveTarget = null
                        }
                        .onFailure { t ->
                            error = t.message
                            logger.error(
                                "ReceiveSubmissionFailed",
                                t,
                                mapOf(
                                    "orderId" to (currentTarget?.id ?: ""),
                                    "status" to (currentTarget?.status ?: ""),
                                    "hasDetail" to (receiveDetail != null)
                                )
                            )
                            snackbarHostState.showSnackbar(
                                message = t.message ?: "Receive failed",
                                withDismissAction = true,
                                duration = SnackbarDuration.Long
                            )
                        }
                    receiveSubmitting = false
                }
            }
        )
    }
}

@Composable
private fun ReceiveOrderRow(
    row: OrderRepository.OrderRow,
    onDownload: () -> Unit,
    onReceive: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                OrderStatusIcon(status = row.status, modifier = Modifier.padding(end = 8.dp))
                Text(
                    text = "Order #${displayOrderNumber(row.orderNumber)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onDownload) {
                    Icon(Icons.Filled.Download, contentDescription = "Download PDF")
                }
                StatusBadge(row.status)
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = formatIso(row.createdAt),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = onReceive,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
            ) {
                Text(
                    if (row.status.equals("offloaded", true) || row.status.equals("delivered", true)) {
                        "Re-sign Receipt"
                    } else {
                        "Mark Received"
                    }
                )
            }
        }
    }
}

@Composable
private fun StatusBadge(status: String) {
    val targetBg = when (status.lowercase()) {
        "order placed", "placed", "approved", "ordered" -> MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
        "processing" -> MaterialTheme.colorScheme.tertiary.copy(alpha = 0.15f)
        "loaded" -> MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f)
        "offloaded", "delivered", "completed" -> MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f)
        "cancelled", "canceled" -> MaterialTheme.colorScheme.error.copy(alpha = 0.15f)
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val targetFg = when (status.lowercase()) {
        "order placed", "placed", "approved", "ordered" -> MaterialTheme.colorScheme.primary
        "processing" -> MaterialTheme.colorScheme.tertiary
        "loaded" -> MaterialTheme.colorScheme.secondary
        "offloaded", "delivered", "completed" -> MaterialTheme.colorScheme.secondary
        "cancelled", "canceled" -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val bg by animateColorAsState(targetValue = targetBg, label = "statusBg")
    val fg by animateColorAsState(targetValue = targetFg, label = "statusFg")
    Surface(color = bg, shape = MaterialTheme.shapes.small) {
        Text(
            text = status,
            color = fg,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold
        )
    }
}

private fun formatIso(iso: String): String {
    return try {
        val odt = OffsetDateTime.parse(iso)
        odt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
    } catch (e: Exception) {
        iso
    }
}

private fun displayOrderNumber(raw: String): String {
    val digits = raw.trim().takeLastWhile { it.isDigit() }
    return if (digits.isNotEmpty()) digits else raw
}
