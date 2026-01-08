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
import com.afterten.orders.ui.components.OrderStatusIcon
import com.afterten.orders.util.LogAnalytics
import com.afterten.orders.util.rememberScreenLogger
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard

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
    val logger = rememberScreenLogger("SupervisorOrders")

    val hasAccess = session.hasRole(RoleGuards.Supervisor)
    if (!hasAccess) {
        AccessDeniedCard(
            title = "Supervisor access required",
            message = "Only supervisors can review and approve outlet orders.",
            primaryLabel = "Back to Home",
            onPrimary = onBack
        )
        return
    }

    LaunchedEffect(Unit) { logger.enter() }

    suspend fun refreshOrders(jwt: String, showSpinner: Boolean, analyticsEvent: String = "supervisor_orders_loaded") {
        if (showSpinner) loading = true
        error = null
        logger.state("RefreshStart", mapOf("event" to analyticsEvent))
        try {
            val rows = repo.listOrdersForSupervisor(jwt = jwt, limit = 200)
            items = rows
            LogAnalytics.event(analyticsEvent, mapOf("count" to rows.size))
            logger.state("RefreshSuccess", mapOf("count" to rows.size, "event" to analyticsEvent))
        } catch (c: CancellationException) {
            // Ignore cancellations when the screen leaves composition
            throw c
        } catch (t: Throwable) {
            val msg = t.message ?: t.toString()
            error = msg
            LogAnalytics.error("supervisor_orders_load_failed", msg, t)
            logger.error("RefreshFailed", t, mapOf("event" to analyticsEvent))
        }
        if (showSpinner) loading = false
    }

    LaunchedEffect(session?.token) {
        val s = session ?: return@LaunchedEffect
        refreshOrders(jwt = s.token, showSpinner = true)
    }

    LaunchedEffect(session?.token) {
        val s = session ?: return@LaunchedEffect
        root.supabaseProvider.ordersEvents.collect {
            logger.event("RealtimeOrdersEvent")
            refreshOrders(jwt = s.token, showSpinner = false, analyticsEvent = "supervisor_orders_synced")
        }
    }

    DisposableEffect(session?.token) {
        val s = session
        if (s != null) {
            val handle = root.supabaseProvider.subscribeOrders(
                jwt = s.token,
                outletId = null
            ) {
                logger.event("RealtimeOrdersEmitRequested")
                root.supabaseProvider.emitOrdersChanged()
            }
            onDispose { handle.close() }
        } else {
            onDispose { }
        }
    }

    // Manual refresh button remains for backup, but realtime now keeps this list warm

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Supervisor Orders") },
            navigationIcon = {
                IconButton(onClick = {
                    logger.event("BackTapped")
                    onBack()
                }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            },
            actions = {
                IconButton(enabled = !loading, onClick = {
                    scope.launch {
                        val s = session ?: return@launch
                        logger.event("ManualRefreshTapped")
                        refreshOrders(jwt = s.token, showSpinner = true, analyticsEvent = "supervisor_orders_refreshed")
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
                    SupervisorOrderRow(
                        row = row,
                        onClick = {
                            logger.event("OrderTapped", mapOf("orderId" to row.id, "status" to row.status))
                            onOpenOrder(row.id)
                        }
                    )
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
                OrderStatusIcon(status = row.status, modifier = Modifier.padding(end = 8.dp))
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

