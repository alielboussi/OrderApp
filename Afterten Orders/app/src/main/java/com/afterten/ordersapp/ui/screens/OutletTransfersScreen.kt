package com.afterten.ordersapp.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.afterten.ordersapp.RootViewModel
import com.afterten.shared.data.RoleGuards
import com.afterten.shared.data.SupabaseProvider
import com.afterten.shared.data.hasRole
import com.afterten.shared.ui.components.AccessDeniedCard
import com.afterten.shared.util.rememberScreenLogger
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OutletTransfersScreen(
    root: RootViewModel,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val scope = rememberCoroutineScope()
    val logger = rememberScreenLogger("OutletTransfers")
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var rows by remember { mutableStateOf(listOf<SupabaseProvider.OutletWarehouseTransferDto>()) }
    var warehouseNames by remember { mutableStateOf(mapOf<String, String>()) }

    val hasAccess = session.hasRole(RoleGuards.Branch)
    if (!hasAccess) {
        AccessDeniedCard(
            title = "Outlet access required",
            message = "Transfers are shown for your outlet warehouses only.",
            primaryLabel = "Back to Home",
            onPrimary = onBack
        )
        return
    }

    fun reload() {
        val s = session ?: return
        scope.launch {
            loading = true
            error = null
            try {
                val warehouseIds = root.supabaseProvider.listWarehouseIdsForOutlets(
                    jwt = s.token,
                    outletIds = listOf(s.outletId),
                    showInStocktakeOnly = false
                )
                val warehouses = root.supabaseProvider.fetchWarehousesByIds(s.token, warehouseIds.toSet())
                warehouseNames = warehouses.associate { it.id to it.name }
                rows = root.supabaseProvider.fetchOutletWarehouseTransfers(s.token, warehouseIds, limit = 100)
                logger.state("Loaded", mapOf("count" to rows.size))
            } catch (t: Throwable) {
                error = t.message ?: t.toString()
                logger.error("LoadFailed", t)
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(session?.token, session?.outletId) {
        reload()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Outlet transfers") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { reload() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        }
    ) { padding ->
        Column(Modifier.padding(padding).padding(16.dp)) {
            Text(
                "Stock moves between warehouses at your outlet — aligned with backoffice Outlets → Transfers.",
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(Modifier.height(12.dp))
            when {
                loading && rows.isEmpty() -> CircularProgressIndicator()
                error != null -> Text(error ?: "", color = MaterialTheme.colorScheme.error)
                rows.isEmpty() -> Text("No outlet transfers yet.")
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(rows, key = { it.id }) { row ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp)) {
                                Text(
                                    "${warehouseNames[row.sourceWarehouseId] ?: "Source"} → ${warehouseNames[row.destinationWarehouseId] ?: "Dest"}",
                                    fontWeight = FontWeight.SemiBold
                                )
                                row.createdAt?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                                row.note?.takeIf { it.isNotBlank() }?.let { Text(it) }
                                row.items.forEach { item ->
                                    Text(
                                        "• ${item.item?.name ?: item.itemId ?: "Item"} × ${item.qtyUnits}",
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
