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
fun OutletStocktakeScreen(
    root: RootViewModel,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val scope = rememberCoroutineScope()
    val logger = rememberScreenLogger("OutletStocktake")

    var loading by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var warehouseId by remember { mutableStateOf<String?>(null) }
    var warehouseName by remember { mutableStateOf<String?>(null) }
    var openPeriod by remember { mutableStateOf<SupabaseProvider.StockPeriodDto?>(null) }
    var items by remember { mutableStateOf(listOf<SupabaseProvider.WarehouseStockItem>()) }
    var countKind by remember { mutableStateOf("opening") }
    var qtyDialogItem by remember { mutableStateOf<SupabaseProvider.WarehouseStockItem?>(null) }
    var qtyInput by remember { mutableStateOf("") }

    val hasAccess = session.hasRole(RoleGuards.Branch)
    if (!hasAccess) {
        AccessDeniedCard(
            title = "Outlet access required",
            message = "Stocktakes run on your outlet warehouse.",
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
                val ids = root.supabaseProvider.listWarehouseIdsForOutlets(
                    jwt = s.token,
                    outletIds = listOf(s.outletId),
                    showInStocktakeOnly = true
                )
                val whId = ids.firstOrNull()
                warehouseId = whId
                if (whId == null) {
                    items = emptyList()
                    openPeriod = null
                    return@launch
                }
                val warehouses = root.supabaseProvider.fetchWarehousesByIds(s.token, setOf(whId))
                warehouseName = warehouses.firstOrNull()?.name
                openPeriod = root.supabaseProvider.fetchOpenStockPeriod(s.token, whId)
                items = root.supabaseProvider.listWarehouseItems(s.token, whId, s.outletId)
                logger.state("Loaded", mapOf("items" to items.size, "period" to (openPeriod?.id ?: "")))
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
                title = { Text("Outlet stocktake") },
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
                "Record opening and closing counts for ${warehouseName ?: "your outlet warehouse"}. " +
                    "Transfers, damages, and POS sales feed the backoffice variance when you close the period.",
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(Modifier.height(12.dp))

            when {
                loading && items.isEmpty() -> CircularProgressIndicator()
                error != null -> Text(error ?: "", color = MaterialTheme.colorScheme.error)
                warehouseId == null -> Text("No stocktake warehouse linked to this outlet.")
                else -> {
                    openPeriod?.let { period ->
                        Text(
                            "Open period: ${period.stocktakeNumber ?: period.id.take(8)}",
                            fontWeight = FontWeight.Bold
                        )
                    } ?: Text("No open period — start one below.", color = MaterialTheme.colorScheme.primary)

                    message?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, color = MaterialTheme.colorScheme.primary)
                    }

                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (openPeriod == null) {
                            Button(
                                enabled = !saving,
                                onClick = {
                                    val s = session ?: return@Button
                                    val wh = warehouseId ?: return@Button
                                    scope.launch {
                                        saving = true
                                        try {
                                            openPeriod = root.supabaseProvider.startStockPeriod(s.token, wh, "Started from Orders app")
                                            message = "Period started."
                                            reload()
                                        } catch (t: Throwable) {
                                            error = t.message
                                        } finally {
                                            saving = false
                                        }
                                    }
                                }
                            ) { Text("Start period") }
                        } else {
                            FilterChip(
                                selected = countKind == "opening",
                                onClick = { countKind = "opening" },
                                label = { Text("Opening") }
                            )
                            FilterChip(
                                selected = countKind == "closing",
                                onClick = { countKind = "closing" },
                                label = { Text("Closing") }
                            )
                            Button(
                                enabled = !saving,
                                onClick = {
                                    val s = session ?: return@Button
                                    val period = openPeriod ?: return@Button
                                    scope.launch {
                                        saving = true
                                        try {
                                            root.supabaseProvider.closeStockPeriod(s.token, period.id)
                                            message = "Period closed. Variance is in backoffice Stocktakes."
                                            openPeriod = null
                                            reload()
                                        } catch (t: Throwable) {
                                            error = t.message
                                        } finally {
                                            saving = false
                                        }
                                    }
                                }
                            ) { Text("Close period") }
                        }
                    }

                    Spacer(Modifier.height(12.dp))
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(items, key = { "${it.itemId}-${it.variantKey}" }) { item ->
                            OutlinedCard(
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    if (openPeriod == null) return@OutlinedCard
                                    qtyDialogItem = item
                                    qtyInput = item.netUnits?.toString()?.trimEnd('.', '0')?.ifEmpty { "0" } ?: "0"
                                }
                            ) {
                                Column(Modifier.padding(12.dp)) {
                                    Text(item.itemName ?: item.itemId, fontWeight = FontWeight.SemiBold)
                                    Text(
                                        "Live: ${item.netUnits ?: 0} · ${item.variantKey ?: "base"}",
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

    if (qtyDialogItem != null && openPeriod != null) {
        AlertDialog(
            onDismissRequest = { qtyDialogItem = null },
            title = { Text("Record $countKind count") },
            text = {
                Column {
                    Text(qtyDialogItem?.itemName ?: "")
                    OutlinedTextField(
                        value = qtyInput,
                        onValueChange = { qtyInput = it.filter { ch -> ch.isDigit() || ch == '.' } },
                        label = { Text("Quantity") },
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !saving,
                    onClick = {
                        val s = session ?: return@TextButton
                        val period = openPeriod ?: return@TextButton
                        val item = qtyDialogItem ?: return@TextButton
                        val qty = qtyInput.toDoubleOrNull() ?: return@TextButton
                        scope.launch {
                            saving = true
                            try {
                                root.supabaseProvider.recordStockCount(
                                    jwt = s.token,
                                    periodId = period.id,
                                    itemId = item.itemId,
                                    qty = qty,
                                    variantKey = item.variantKey ?: "base",
                                    kind = countKind
                                )
                                message = "${countKind.replaceFirstChar { it.uppercase() }} saved."
                                qtyDialogItem = null
                            } catch (t: Throwable) {
                                error = t.message
                            } finally {
                                saving = false
                            }
                        }
                    }
                ) { Text("Save") }
            },
            dismissButton = {
                TextButton(onClick = { qtyDialogItem = null }) { Text("Cancel") }
            }
        )
    }
}
