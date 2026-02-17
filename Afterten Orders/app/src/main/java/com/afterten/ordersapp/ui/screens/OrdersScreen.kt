package com.afterten.ordersapp.ui.screens

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
import android.os.Environment
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.core.net.toUri
import androidx.compose.runtime.*
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.afterten.ordersapp.RootViewModel
import com.afterten.ordersapp.data.repo.OrderRepository
import com.afterten.ordersapp.ui.components.OrderStatusIcon
import com.afterten.ordersapp.util.LogAnalytics
import com.afterten.ordersapp.util.PdfSignatureBlock
import com.afterten.ordersapp.util.generateOrderPdfDetailed
import com.afterten.ordersapp.util.rememberScreenLogger
import com.afterten.ordersapp.util.sanitizeForFile
import com.afterten.ordersapp.util.toBlackInk
import com.afterten.ordersapp.util.toPdfGroups
import com.afterten.ordersapp.data.RoleGuards
import com.afterten.ordersapp.data.hasRole
import com.afterten.ordersapp.ui.components.AccessDeniedCard
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.OffsetDateTime
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

    val hasAccess = session.hasRole(RoleGuards.Branch)
    if (!hasAccess) {
        AccessDeniedCard(
            title = "Branch access required",
            message = "Only branch (outlet) operators can view offloaded orders.",
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

    val filteredItems = remember(items) {
        items.filter { row -> row.status.equals("offloaded", true) }
    }
    val statusCounts = remember(filteredItems) { countStatuses(filteredItems) }

    suspend fun loadSignatureBitmap(jwt: String, path: String?): Bitmap? {
        val safePath = path?.trim().orEmpty()
        if (safePath.isBlank()) return null
        val signedUrl = root.supabaseProvider.createSignedUrl(
            jwt = jwt,
            bucket = "signatures",
            path = safePath,
            expiresInSeconds = 3600
        )
        val bytes = root.supabaseProvider.downloadBytes(signedUrl)
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
        return bmp.toBlackInk()
    }

    suspend fun downloadDetailedPdf(row: OrderRepository.OrderRow) {
        val s = session ?: error("No active session")
        val detail = repo.fetchOrder(jwt = s.token, orderId = row.id) ?: error("Order not found")
        val itemsForPdf = repo.listOrderItems(jwt = s.token, orderId = row.id)
        val createdAt = runCatching { OffsetDateTime.parse(detail.createdAt) }.getOrElse { OffsetDateTime.now() }
        val outletName = detail.outlet?.name ?: s.outletName.ifBlank { detail.outletId ?: "Outlet" }
        val outletFolder = detail.outletId ?: s.outletId.ifBlank { "orders" }
        val safeOutlet = outletName.sanitizeForFile()
        val safeOrder = detail.orderNumber.sanitizeForFile()
        val dateStr = createdAt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))

        val employeeSig = loadSignatureBitmap(s.token, detail.employeeSignaturePath)
        val supervisorSig = loadSignatureBitmap(s.token, detail.supervisorSignaturePath)
        val driverSig = loadSignatureBitmap(s.token, detail.driverSignaturePath)
        val offloaderSig = loadSignatureBitmap(s.token, detail.offloaderSignaturePath)

        val signatures = listOf(
            PdfSignatureBlock("Outlet Employee", detail.employeeName.orEmpty(), detail.employeeSignedAt, employeeSig),
            PdfSignatureBlock("Supervisor", detail.supervisorName.orEmpty(), detail.supervisorSignedAt, supervisorSig),
            PdfSignatureBlock("Driver", detail.driverName.orEmpty(), detail.driverSignedAt, driverSig),
            PdfSignatureBlock("Offloader", detail.offloaderName.orEmpty(), detail.offloaderSignedAt, offloaderSig)
        ).filter { it.name.isNotBlank() || it.bitmap != null }

        val pdfFile = generateOrderPdfDetailed(
            cacheDir = ctx.cacheDir,
            context = ctx,
            outletName = outletName,
            orderNo = detail.orderNumber,
            orderId = detail.id,
            status = detail.status,
            createdAt = createdAt,
            groups = itemsForPdf.toPdfGroups(),
            signatures = signatures
        )
        val pdfBytes = pdfFile.readBytes()
        pdfFile.delete()

        val storagePath = "${outletFolder}/offloaded/${safeOutlet}_${safeOrder}_${dateStr}_offloaded.pdf"
        root.supabaseProvider.uploadToStorage(
            jwt = s.token,
            bucket = "orders",
            path = storagePath,
            bytes = pdfBytes,
            contentType = "application/pdf",
            upsert = true
        )

        val url = root.supabaseProvider.createSignedUrl(
            jwt = s.token,
            bucket = "orders",
            path = storagePath,
            expiresInSeconds = 3600,
            downloadName = "${safeOutlet}_${safeOrder}_${dateStr}.pdf"
        )
        val dm = ctx.getSystemService(android.content.Context.DOWNLOAD_SERVICE) as DownloadManager
        val req = DownloadManager.Request(url.toUri())
            .setTitle("${safeOutlet}_${safeOrder}_${dateStr}.pdf")
            .setMimeType("application/pdf")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "${safeOutlet}_${safeOrder}_${dateStr}.pdf")
        runCatching { dm.enqueue(req) }
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
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(filteredItems) { row ->
                        OrderRowCard(
                            row = row,
                            onDownload = {
                                logger.event("DownloadTapped", mapOf("orderId" to row.id))
                                scope.launch {
                                    val result = runCatching {
                                        withContext(Dispatchers.IO) { downloadDetailedPdf(row) }
                                    }
                                    result.onFailure { err ->
                                        snackbarHostState.showSnackbar(
                                            message = err.message ?: "PDF download failed",
                                            withDismissAction = true
                                        )
                                    }
                                }
                            }
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun OrderRowCard(
    row: OrderRepository.OrderRow,
    onDownload: () -> Unit
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
        SummaryStat(label = "Offloaded", value = statusCounts.offloaded, color = MaterialTheme.colorScheme.onSurface)
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

private data class StatusCounts(
    val total: Int,
    val offloaded: Int
)

private fun countStatuses(rows: List<OrderRepository.OrderRow>): StatusCounts {
    val total = rows.size
    var offloaded = 0
    rows.forEach { row ->
        val status = row.status.lowercase(Locale.US)
        if (status == "offloaded") offloaded += 1
    }
    return StatusCounts(total = total, offloaded = offloaded)
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

