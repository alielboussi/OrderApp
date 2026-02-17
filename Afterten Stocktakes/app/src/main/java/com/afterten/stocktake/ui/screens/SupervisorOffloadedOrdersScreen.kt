package com.afterten.stocktake.ui.screens

import android.app.DownloadManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import com.afterten.stocktake.RootViewModel
import com.afterten.stocktake.data.RoleGuards
import com.afterten.stocktake.data.hasRole
import com.afterten.stocktake.data.repo.OrderRepository
import com.afterten.stocktake.ui.components.AccessDeniedCard
import com.afterten.stocktake.ui.components.OrderStatusIcon
import com.afterten.stocktake.util.LogAnalytics
import com.afterten.stocktake.util.PdfSignatureBlock
import com.afterten.stocktake.util.generateOrderPdfDetailed
import com.afterten.stocktake.util.rememberScreenLogger
import com.afterten.stocktake.util.sanitizeForFile
import com.afterten.stocktake.util.toBlackInk
import com.afterten.stocktake.util.toPdfGroups
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupervisorOffloadedOrdersScreen(
    root: RootViewModel,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val repo = remember { OrderRepository(root.supabaseProvider) }
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val logger = rememberScreenLogger("SupervisorOffloadedOrders")

    val hasAccess = session.hasRole(RoleGuards.Supervisor)
    if (!hasAccess) {
        AccessDeniedCard(
            title = "Supervisor access required",
            message = "Only supervisors can view offloaded outlet orders.",
            primaryLabel = "Back to Home",
            onPrimary = onBack
        )
        return
    }

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf(listOf<OrderRepository.OrderRow>()) }

    LaunchedEffect(session?.token) {
        val s = session ?: return@LaunchedEffect
        loading = true
        error = null
        logger.state("InitialLoadStart")
        try {
            items = repo.listOrdersForSupervisor(jwt = s.token, limit = 200)
            LogAnalytics.event("supervisor_offloaded_loaded", mapOf("count" to items.size))
            loading = false
        } catch (t: Throwable) {
            error = t.message ?: t.toString()
            logger.error("InitialLoadFailed", t)
            loading = false
        }
    }

    LaunchedEffect(session?.token) {
        val s = session ?: return@LaunchedEffect
        root.supabaseProvider.ordersEvents.collect {
            runCatching {
                logger.event("RealtimeOrdersEvent")
                val newItems = repo.listOrdersForSupervisor(jwt = s.token, limit = 200)
                items = newItems
                LogAnalytics.event("supervisor_offloaded_refreshed", mapOf("count" to newItems.size))
            }
        }
    }

    DisposableEffect(session?.token) {
        val s = session
        if (s != null) {
            val handle = root.supabaseProvider.subscribeOrders(
                jwt = s.token,
                outletId = null
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
        val outletName = detail.outlet?.name ?: detail.outletId ?: "Outlet"
        val outletFolder = detail.outletId ?: "orders"
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

        val fileName = "${safeOutlet}_${safeOrder}_${dateStr}.pdf"
        val url = root.supabaseProvider.createSignedUrl(
            jwt = s.token,
            bucket = "orders",
            path = storagePath,
            expiresInSeconds = 3600,
            downloadName = fileName
        )
        val dm = ctx.getSystemService(android.content.Context.DOWNLOAD_SERVICE) as DownloadManager
        val req = DownloadManager.Request(url.toUri())
            .setTitle(fileName)
            .setMimeType("application/pdf")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
        runCatching { dm.enqueue(req) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Offloaded Orders") },
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
                            runCatching {
                                repo.listOrdersForSupervisor(jwt = s.token, limit = 200)
                            }.onSuccess { list ->
                                items = list
                                LogAnalytics.event("supervisor_offloaded_refreshed", mapOf("count" to list.size))
                            }.onFailure { t ->
                                error = t.message ?: t.toString()
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
            loading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            error != null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text("Error: $error") }
            else -> LazyColumn(Modifier.fillMaxSize().padding(padding)) {
                items(filteredItems) { row ->
                    OffloadedOrderRow(
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

@Composable
private fun OffloadedOrderRow(
    row: OrderRepository.OrderRow,
    onDownload: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
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
                text = row.outlet?.name ?: (row.outletId ?: ""),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = formatIso(row.createdAt),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
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
