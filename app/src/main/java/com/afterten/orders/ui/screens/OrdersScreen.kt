package com.afterten.orders.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.Icons
import androidx.compose.material3.*
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.ui.platform.LocalContext
import android.app.DownloadManager
import android.graphics.Bitmap
import android.os.Environment
import androidx.core.net.toUri
import androidx.compose.runtime.*
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.repo.OrderRepository
import com.afterten.orders.ui.components.OrderStatusIcon
import com.afterten.orders.ui.components.SignatureCaptureDialog
import com.afterten.orders.util.LogAnalytics
import com.afterten.orders.util.rememberScreenLogger
import com.afterten.orders.util.generateOrderPdf
import com.afterten.orders.util.sanitizeForFile
import com.afterten.orders.util.toPdfGroups
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard
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
fun OrdersScreen(
    root: RootViewModel,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val repo = remember { OrderRepository(root.supabaseProvider) }
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val logger = rememberScreenLogger("Orders")

    if (!session.hasRole(RoleGuards.Outlet)) {
        AccessDeniedCard(
            title = "Outlet access required",
            message = "Only outlet operators can review placed orders or submit offloader signatures.",
            primaryLabel = "Back to Home",
            onPrimary = onBack
        )
        return
    }

    LaunchedEffect(Unit) {
        logger.enter(mapOf("hasSession" to (session != null)))
    }
    LaunchedEffect(session?.outletId) {
        logger.state(
            "SessionContext",
            mapOf(
                "outletId" to (session?.outletId ?: ""),
                "hasSession" to (session != null)
            )
        )
    }

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf(listOf<OrderRepository.OrderRow>()) }
    var statusFilter by remember { mutableStateOf(OrderFilter.All) }
    var deliveryTarget by remember { mutableStateOf<OrderRepository.OrderRow?>(null) }
    var deliveryDetail by remember { mutableStateOf<OrderRepository.OrderDetail?>(null) }
    var deliveryPrefillName by remember { mutableStateOf("") }
    var deliverySubmitting by remember { mutableStateOf(false) }

    LaunchedEffect(items.size) {
        logger.state("OrdersListUpdated", mapOf("count" to items.size))
    }
    LaunchedEffect(statusFilter) {
        logger.state("FilterChanged", mapOf("filter" to statusFilter.name))
    }
    LaunchedEffect(deliveryTarget?.id) {
        deliveryTarget?.let { target ->
            logger.state(
                "DeliveryDialogTarget",
                mapOf("orderId" to target.id, "status" to target.status)
            )
        } ?: logger.state("DeliveryDialogCleared")
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
            // Initial load
            items = repo.listOrdersForOutlet(jwt = s.token, outletId = s.outletId, limit = 200)
            LogAnalytics.event("orders_loaded", mapOf("count" to items.size))
            logger.state("InitialLoadSuccess", mapOf("count" to items.size))
            loading = false
        } catch (t: Throwable) {
            error = t.message ?: t.toString()
            LogAnalytics.error("orders_load_failed", error, t)
            logger.error("InitialLoadFailed", t, mapOf("outletId" to s.outletId))
            loading = false
        }
    }

    // Realtime subscription below pushes into ordersEvents so every device refreshes automatically

    // Also refresh when we emit a local event (e.g., right after placing an order)
    LaunchedEffect(session?.token, session?.outletId) {
        val s = session ?: return@LaunchedEffect
        root.supabaseProvider.ordersEvents.collect {
            runCatching {
                logger.event("RealtimeOrdersEvent", mapOf("outletId" to s.outletId))
                val newItems = repo.listOrdersForOutlet(jwt = s.token, outletId = s.outletId, limit = 200)
                items = newItems
                LogAnalytics.event("orders_refreshed_local", mapOf("count" to newItems.size))
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

    suspend fun submitDelivery(
        row: OrderRepository.OrderRow,
        cachedDetail: OrderRepository.OrderDetail?,
        signerName: String,
        signatureBitmap: Bitmap
    ) {
        logger.event(
            "DeliverySubmissionStart",
            mapOf("orderId" to row.id, "cachedDetail" to (cachedDetail != null))
        )
        val s = session ?: error("No active session")
        val detail = cachedDetail
            ?: repo.fetchOrder(jwt = s.token, orderId = row.id)
            ?: error("Order not found")
        val itemsForPdf = repo.listOrderItems(jwt = s.token, orderId = row.id)
        val pdfGroups = itemsForPdf.toPdfGroups()
        if (pdfGroups.isEmpty()) error("Order has no items to deliver")
        val tzId = detail.timezone?.takeIf { it.isNotBlank() } ?: "Africa/Lusaka"
        val zone = runCatching { ZoneId.of(tzId) }.getOrElse { ZoneId.of("Africa/Lusaka") }
        val now = ZonedDateTime.now(zone)
        val outletName = detail.outlet?.name ?: s.outletName.ifBlank { detail.outletId ?: "Outlet" }
        val outletFolder = detail.outletId ?: s.outletId.ifBlank { "orders" }
        val safeOutlet = outletName.sanitizeForFile()
        val safeOrder = detail.orderNumber.sanitizeForFile()
        val dateStr = now.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        val signaturePath = "${outletFolder}/deliveries/${safeOrder}_Delivery_${dateStr}.png"
        val pdfPath = "${outletFolder}/deliveries/${safeOutlet}_${safeOrder}_${dateStr}_delivered.pdf"

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
                signerLabel = "Delivered / Received By",
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

            root.supabaseProvider.markOrderDelivered(
                jwt = s.token,
                orderId = row.id,
                recipientName = signerName,
                signaturePath = signaturePath,
                pdfPath = pdfPath
            )
        }
        logger.state("DeliverySubmissionComplete", mapOf("orderId" to row.id))
    }

    val statusCounts = remember(items) { countStatuses(items) }
    val filteredItems = remember(items, statusFilter) { items.filter { statusFilter.matches(it.status) } }

    LaunchedEffect(session?.token, deliveryTarget?.id) {
        deliveryDetail = null
        deliveryPrefillName = ""
        val s = session ?: return@LaunchedEffect
        val target = deliveryTarget ?: return@LaunchedEffect
        runCatching { repo.fetchOrder(jwt = s.token, orderId = target.id) }
            .onSuccess { detail ->
                deliveryDetail = detail
                deliveryPrefillName = detail?.offloaderName.orEmpty()
            }
            .onFailure { t ->
                logger.warn("DeliveryDetailLoadFailed", mapOf("orderId" to target.id), t)
                snackbarHostState.showSnackbar(
                    message = t.message ?: "Unable to load order detail",
                    withDismissAction = true
                )
            }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Orders") },
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
                                LogAnalytics.event("orders_refreshed", mapOf("count" to list.size))
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
            else -> Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                OrderStatusSummary(statusCounts = statusCounts)
                Spacer(Modifier.height(8.dp))
                OrderFilterRow(
                    selected = statusFilter,
                    onSelected = { statusFilter = it }
                )
                Spacer(Modifier.height(8.dp))
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(filteredItems) { row ->
                        OrderRowCard(
                            row = row,
                            onDownload = {
                                logger.event("DownloadTapped", mapOf("orderId" to row.id))
                                val ses = session ?: return@OrderRowCard
                                scope.launch {
                                    val dateStr = try { java.time.OffsetDateTime.parse(row.createdAt).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")) } catch (_: Throwable) { row.createdAt.take(10) }
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
                            onDeliver = if (row.status.equals("loaded", true) || row.status.equals("delivered", true)) {
                                {
                                    logger.event("DeliverTapped", mapOf("orderId" to row.id, "status" to row.status))
                                    deliveryTarget = row
                                }
                            } else null
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }

    if (deliveryTarget != null) {
        SignatureCaptureDialog(
            title = "Mark Delivery",
            nameLabel = "Received By",
            confirmLabel = if (deliverySubmitting) "Submitting…" else "Sign & Deliver",
            initialName = deliveryPrefillName,
            onDismiss = { if (!deliverySubmitting) deliveryTarget = null },
            onConfirm = { name, bitmap ->
                scope.launch {
                    logger.event(
                        "DeliveryDialogConfirmed",
                        mapOf("orderId" to (deliveryTarget?.id ?: ""), "nameProvided" to name.isNotBlank())
                    )
                    deliverySubmitting = true
                    val currentTarget = deliveryTarget
                    val result = runCatching {
                        currentTarget?.let { submitDelivery(it, deliveryDetail, name, bitmap) }
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
                            logger.state("DeliveryMarkedDelivered", mapOf("orderId" to (currentTarget?.id ?: "")))
                            snackbarHostState.showSnackbar("Order delivered")
                            deliveryTarget = null
                        }
                        .onFailure { t ->
                            error = t.message
                            logger.error(
                                "DeliverySubmissionFailed",
                                t,
                                mapOf(
                                    "orderId" to (currentTarget?.id ?: ""),
                                    "status" to (currentTarget?.status ?: ""),
                                    "hasDetail" to (deliveryDetail != null)
                                )
                            )
                            snackbarHostState.showSnackbar(
                                message = t.message ?: "Delivery failed",
                                withDismissAction = true,
                                duration = SnackbarDuration.Long
                            )
                        }
                    deliverySubmitting = false
                }
            }
        )
    }
}

@Composable
private fun OrderRowCard(
    row: OrderRepository.OrderRow,
    onDownload: () -> Unit,
    onDeliver: (() -> Unit)? = null
) {
    Card(modifier = Modifier
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
            Spacer(Modifier.height(2.dp))
            Text(
                text = "ID: ${row.id}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (row.modifiedBySupervisor == true || !row.modifiedBySupervisorName.isNullOrEmpty()) {
                Spacer(Modifier.height(6.dp))
                Surface(color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f), shape = MaterialTheme.shapes.small) {
                    Text(
                        text = "Updated by ${row.modifiedBySupervisorName ?: "Supervisor"}",
                        color = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
            if (onDeliver != null) {
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = onDeliver,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) {
                    Text(if (row.status.equals("delivered", true)) "Re-sign Delivery" else "Mark Delivered")
                }
            }
        }
    }
}

@Composable
private fun OrderStatusSummary(statusCounts: StatusCounts) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        SummaryStat(label = "Total", value = statusCounts.total, color = MaterialTheme.colorScheme.primary)
        SummaryStat(label = "Pending", value = statusCounts.pending, color = MaterialTheme.colorScheme.tertiary)
        SummaryStat(label = "Loaded", value = statusCounts.loaded, color = MaterialTheme.colorScheme.secondary)
        SummaryStat(label = "Delivered", value = statusCounts.delivered, color = MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun RowScope.SummaryStat(label: String, value: Int, color: Color) {
    Surface(
        tonalElevation = 2.dp,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.weight(1f)
    ) {
        Column(Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value.toString(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun OrderFilterRow(selected: OrderFilter, onSelected: (OrderFilter) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        OrderFilter.values().forEach { filter ->
            FilterChip(
                selected = selected == filter,
                onClick = { onSelected(filter) },
                label = { Text(filter.label) }
            )
        }
    }
}

private data class StatusCounts(
    val total: Int,
    val pending: Int,
    val loaded: Int,
    val delivered: Int
)

private val PendingStatuses = setOf("placed", "order placed", "approved", "processing")

private fun countStatuses(rows: List<OrderRepository.OrderRow>): StatusCounts {
    val total = rows.size
    var pending = 0
    var loaded = 0
    var delivered = 0
    rows.forEach { row ->
        val status = row.status.lowercase(Locale.US)
        when {
            status == "loaded" -> loaded += 1
            status == "delivered" || status == "offloaded" -> delivered += 1
            status in PendingStatuses -> pending += 1
        }
    }
    return StatusCounts(total = total, pending = pending, loaded = loaded, delivered = delivered)
}

private enum class OrderFilter(val label: String) {
    All("All"),
    Pending("Pending"),
    Loaded("Loaded"),
    Delivered("Delivered");

    fun matches(status: String): Boolean {
        val key = status.lowercase(Locale.US)
        return when (this) {
            All -> true
            Pending -> key in PendingStatuses
            Loaded -> key == "loaded"
            Delivered -> key == "delivered" || key == "offloaded"
        }
    }
}

@Composable
private fun StatusBadge(status: String) {
    val targetBg = when (status.lowercase()) {
        "order placed", "placed", "approved" -> MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
        "processing" -> MaterialTheme.colorScheme.tertiary.copy(alpha = 0.15f)
        "loaded" -> MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f)
        "offloaded", "delivered", "completed" -> MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f)
        "cancelled", "canceled" -> MaterialTheme.colorScheme.error.copy(alpha = 0.15f)
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val targetFg = when (status.lowercase()) {
        "order placed", "placed", "approved" -> MaterialTheme.colorScheme.primary
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

@Composable
private fun LiveIndicator() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(end = 12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(MaterialTheme.shapes.small)
                .background(MaterialTheme.colorScheme.tertiary)
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = "LIVE",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.tertiary,
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

