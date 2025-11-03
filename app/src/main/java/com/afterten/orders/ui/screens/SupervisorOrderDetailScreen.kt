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
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.repo.OrderRepository
import kotlinx.coroutines.launch
import kotlin.math.max

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupervisorOrderDetailScreen(
    root: RootViewModel,
    orderId: String,
    onBack: () -> Unit,
    onSaved: () -> Unit
) {
    val session by root.session.collectAsState()
    val repo = remember { OrderRepository(root.supabaseProvider) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var rows by remember { mutableStateOf(listOf<OrderRepository.OrderItemRow>()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(session?.token, orderId) {
        val s = session ?: return@LaunchedEffect
        loading = true
        error = null
        runCatching { repo.listOrderItems(jwt = s.token, orderId = orderId) }
            .onSuccess { rows = it; loading = false }
            .onFailure { t -> error = t.message; loading = false }
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Order Details") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } }
        )
    }) { padding ->
        when {
            loading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            error != null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text("Error: ${'$'}error") }
            else -> Column(Modifier.fillMaxSize().padding(padding)) {
                LazyColumn(Modifier.weight(1f)) {
                    items(rows, key = { it.id }) { r ->
                        SupervisorItemRow(
                            row = r,
                            onChangeQty = { newQty ->
                                val s = session ?: return@SupervisorItemRow
                                scope.launch {
                                    val q = max(0.0, newQty)
                                    runCatching { repo.updateOrderItemQty(jwt = s.token, orderItemId = r.id, qty = q) }
                                        .onSuccess {
                                            rows = rows.map { if (it.id == r.id) it.copy(qty = q) else it }
                                            // Mark order modified and notify outlets to refresh
                                            val who = s.email ?: "Supervisor"
                                            runCatching { root.supabaseProvider.markOrderModified(jwt = s.token, orderId = orderId, supervisorName = who) }
                                            root.supabaseProvider.emitOrdersChanged()
                                        }
                                        .onFailure { t -> error = t.message }
                                }
                            }
                        )
                        HorizontalDivider()
                    }
                }
                Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.End) {
                    Button(onClick = onSaved) { Text("Done") }
                }
            }
        }
    }
}

@Composable
private fun SupervisorItemRow(row: OrderRepository.OrderItemRow, onChangeQty: (Double) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(row.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text("UOM: ${row.uom} • Cost: ${row.cost}", style = MaterialTheme.typography.bodySmall)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onChangeQty((row.qty - 1.0)) }) { Text("-") }
            Text(String.format("%.0f", row.qty), style = MaterialTheme.typography.titleMedium)
            OutlinedButton(onClick = { onChangeQty((row.qty + 1.0)) }) { Text("+") }
        }
    }
}
