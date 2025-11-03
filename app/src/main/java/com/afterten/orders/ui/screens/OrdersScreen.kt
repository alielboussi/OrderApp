package com.afterten.orders.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.background
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.Icons
import androidx.compose.material3.*
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.ui.platform.LocalContext
import android.app.DownloadManager
import android.os.Environment
import androidx.core.net.toUri
import androidx.compose.runtime.*
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.repo.OrderRepository
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import com.afterten.orders.util.LogAnalytics

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

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf(listOf<OrderRepository.OrderRow>()) }

    LaunchedEffect(session?.token, session?.outletId) {
        val s = session
        if (s == null) {
            items = emptyList()
            loading = false
            return@LaunchedEffect
        }
        loading = true
        error = null
        try {
            // Initial load
            items = repo.listOrdersForOutlet(jwt = s.token, outletId = s.outletId, limit = 200)
            LogAnalytics.event("orders_loaded", mapOf("count" to items.size))
            loading = false
        } catch (t: Throwable) {
            error = t.message ?: t.toString()
            LogAnalytics.error("orders_load_failed", error, t)
            loading = false
        }
    }

    // Removed Realtime subscription; manual refresh below

    // Also refresh when we emit a local event (e.g., right after placing an order)
    LaunchedEffect(session?.token, session?.outletId) {
        val s = session ?: return@LaunchedEffect
        root.supabaseProvider.ordersEvents.collect {
            runCatching {
                val newItems = repo.listOrdersForOutlet(jwt = s.token, outletId = s.outletId, limit = 200)
                items = newItems
                LogAnalytics.event("orders_refreshed_local", mapOf("count" to newItems.size))
            }
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
                            runCatching {
                                val newItems = repo.listOrdersForOutlet(jwt = s.token, outletId = s.outletId, limit = 200)
                            }.onSuccess { new ->
                                items = new
                                LogAnalytics.event("orders_refreshed", mapOf("count" to new.size))
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
        }
    ) { padding ->
        when {
            loading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            error != null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("Error: ${'$'}error")
            }
            else -> LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                items(items) { row ->
                    OrderRowCard(
                        row = row,
                        onDownload = {
                            val ses = session ?: return@OrderRowCard
                            scope.launch {
                                val dateStr = try { java.time.OffsetDateTime.parse(row.createdAt).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")) } catch (_: Throwable) { row.createdAt.take(10) }
                                val safeOutlet = ses.outletName.replace(" ", "_").replace(Regex("[^A-Za-z0-9_-]"), "")
                                val fileName = "${safeOutlet}_${row.orderNumber}_${dateStr}.pdf"
                                val storagePath = "${ses.outletId}/$fileName"
                                val url = runCatching {
                                    // Prefer signed URL (works for private buckets)
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
                        }
                    )
                    // Show badge if modified by supervisor for outlet visibility, too
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun OrderRowCard(row: OrderRepository.OrderRow, onDownload: () -> Unit) {
    Card(modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Order #${row.orderNumber}",
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
private fun StatusBadge(status: String) {
    val targetBg = when (status.lowercase()) {
        "order placed" -> MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
        "processing" -> MaterialTheme.colorScheme.tertiary.copy(alpha = 0.15f)
        "completed" -> MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f)
        "cancelled", "canceled" -> MaterialTheme.colorScheme.error.copy(alpha = 0.15f)
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val targetFg = when (status.lowercase()) {
        "order placed" -> MaterialTheme.colorScheme.primary
        "processing" -> MaterialTheme.colorScheme.tertiary
        "completed" -> MaterialTheme.colorScheme.secondary
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
