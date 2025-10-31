package com.afterten.orders.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersScreen(
    root: RootViewModel,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val repo = remember { OrderRepository(root.supabaseProvider) }

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf(listOf<OrderRepository.OrderRow>()) }

    val scope = rememberCoroutineScope()

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
            loading = false
        } catch (t: Throwable) {
            error = t.message ?: t.toString()
            loading = false
        }
    }

    // Realtime subscription for live updates
    var subHandle by remember { mutableStateOf<com.afterten.orders.data.SupabaseProvider.RealtimeSubscriptionHandle?>(null) }
    DisposableEffect(session?.token, session?.outletId) {
        val s = session
        if (s != null) {
            subHandle = root.supabaseProvider.subscribeOrders(
                jwt = s.token,
                outletId = s.outletId
            ) {
                scope.launch {
                    runCatching {
                        items = repo.listOrdersForOutlet(jwt = s.token, outletId = s.outletId, limit = 200)
                    }
                }
            }
        }
        onDispose {
            subHandle?.close()
            subHandle = null
        }
    }

    val isLive = subHandle != null

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
                    if (isLive) LiveIndicator()
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
                    OrderRowCard(row)
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun OrderRowCard(row: OrderRepository.OrderRow) {
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
