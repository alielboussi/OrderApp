package com.afterten.orders.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.filled.Refresh
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.repo.OrderRepository
import com.afterten.orders.util.LogAnalytics
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupervisorOrdersScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onOpenOrder: (orderId: String) -> Unit
) {
    val session by root.session.collectAsState()
    val repo = remember { OrderRepository(root.supabaseProvider) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf(listOf<OrderRepository.OrderRow>()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(session?.token) {
        val s = session ?: return@LaunchedEffect
        loading = true
        error = null
        runCatching { repo.listOrdersForSupervisor(jwt = s.token, limit = 200) }
            .onSuccess {
                items = it
                loading = false
                LogAnalytics.event("supervisor_orders_loaded", mapOf("count" to it.size))
            }
            .onFailure { t ->
                error = t.message ?: t.toString()
                LogAnalytics.error("supervisor_orders_load_failed", error, t)
                loading = false
            }
    }

    // Removed Realtime subscription; use manual refresh instead

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Supervisor Orders") },
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
                        runCatching { repo.listOrdersForSupervisor(jwt = s.token, limit = 200) }
                            .onSuccess {
                                items = it
                                LogAnalytics.event("supervisor_orders_refreshed", mapOf("count" to it.size))
                            }
                            .onFailure { t ->
                                error = t.message ?: t.toString()
                                LogAnalytics.error("supervisor_orders_refresh_failed", error, t)
                            }
                        loading = false
                    }
                }) {
                    Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                }
            }
        )
    }) { padding ->
        when {
            loading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            error != null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text("Error: $error") }
            else -> LazyColumn(Modifier.fillMaxSize().padding(padding)) {
                items(items) { row ->
                    SupervisorOrderRow(row = row, onClick = { onOpenOrder(row.id) })
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun SupervisorOrderRow(row: OrderRepository.OrderRow, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Order #${row.orderNumber}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f)
                )
                if (row.modifiedBySupervisor == true || !row.modifiedBySupervisorName.isNullOrEmpty()) {
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
            Spacer(Modifier.height(4.dp))
            Text(text = row.outlet?.name ?: (row.outletId ?: ""), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(2.dp))
            Text(text = row.createdAt, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
