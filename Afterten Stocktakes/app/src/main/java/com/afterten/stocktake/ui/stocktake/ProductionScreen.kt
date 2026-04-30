package com.afterten.stocktake.ui.stocktake

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.afterten.stocktake.data.RoleGuards
import com.afterten.stocktake.RootViewModel
import com.afterten.stocktake.data.hasRole
import com.afterten.stocktake.ui.common.ErrorBanner
import com.afterten.stocktake.ui.common.LoadingOverlay
import com.afterten.stocktake.ui.common.ToastUtils

@Composable
fun ProductionScreen(root: RootViewModel, onBack: () -> Unit) {
    val session = root.session.collectAsState().value
    val viewModel: ProductionViewModel = viewModel(factory = ProductionViewModel.Factory(root.supabaseProvider))
    val ui = viewModel.ui.collectAsState().value
    val context = LocalContext.current

    LaunchedEffect(session?.token) {
        viewModel.bindSession(session)
    }

    if (session == null) {
        Text("Not signed in.", modifier = Modifier.padding(16.dp))
        return
    }

    if (!session.hasRole(RoleGuards.Stocktake) && !session.hasRole(RoleGuards.Backoffice)) {
        Text("You do not have access to Production.", modifier = Modifier.padding(16.dp))
        return
    }

    val qtyInputs = remember { mutableStateMapOf<String, String>() }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Production") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                }
            },
            scrollBehavior = androidx.compose.material3.TopAppBarDefaults.pinnedScrollBehavior(rememberTopAppBarState())
        )

        if (ui.error != null) {
            ErrorBanner(message = ui.error)
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                WarehousePicker(
                    warehouses = ui.warehouses,
                    selectedId = ui.selectedWarehouseId,
                    onSelect = { viewModel.selectWarehouse(it) }
                )
            }

            if (ui.openPeriod != null) {
                item {
                    Text(
                        text = "Open period: ${ui.openPeriod.name ?: "Current"}",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(bottom = 4.dp)
                    )
                }
            }

            if (ui.ingredientStock.isNotEmpty()) {
                item {
                    Text(
                        text = "Ingredient stock", 
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                items(ui.ingredientStock, key = { it.itemId }) { item ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(item.itemName ?: "Unnamed")
                            Text(String.format("%.2f", item.netUnits ?: 0.0))
                        }
                    }
                }
            }

            if (ui.productionRows.isNotEmpty()) {
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Production targets",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                items(ui.productionRows, key = { it.itemId }) { row ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                            Text(row.itemName, style = MaterialTheme.typography.titleMedium)
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Max: ${String.format("%.0f", row.maxProducible)}")
                                Text("Produced: ${String.format("%.0f", row.producedQty)}")
                                Text("Diff: ${String.format("%.0f", row.diffQty)}")
                            }

                            Spacer(modifier = Modifier.height(8.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                val existing = qtyInputs[row.itemId] ?: ""
                                OutlinedTextField(
                                    value = existing,
                                    onValueChange = { qtyInputs[row.itemId] = it },
                                    label = { Text("Produced qty") },
                                    modifier = Modifier.weight(1f)
                                )
                                Button(
                                    onClick = {
                                        val qty = existing.trim().toDoubleOrNull()
                                        if (qty == null || qty <= 0.0) {
                                            ToastUtils.show(context, "Enter a valid qty.")
                                            return@Button
                                        }
                                        viewModel.recordProduction(row.itemId, qty) { err ->
                                            if (err != null) {
                                                ToastUtils.show(context, err.message ?: "Failed to record.")
                                            } else {
                                                qtyInputs[row.itemId] = ""
                                                ToastUtils.show(context, "Recorded.")
                                            }
                                        }
                                    },
                                    enabled = !ui.savingItemIds.contains(row.itemId)
                                ) {
                                    Text("Add")
                                }
                            }

                            if (row.details.isNotEmpty()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                row.details.forEach { detail ->
                                    Text(
                                        text = "${detail.ingredientName}: ${String.format("%.2f", detail.onHand)} on hand, ${String.format("%.2f", detail.neededPerUnit)} per unit",
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

    if (ui.loading) {
        LoadingOverlay()
    }
}

@Composable
private fun WarehousePicker(
    warehouses: List<com.afterten.stocktake.data.SupabaseProvider.Warehouse>,
    selectedId: String?,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = warehouses.firstOrNull { it.id == selectedId }

    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
        OutlinedTextField(
            modifier = Modifier.menuAnchor().fillMaxWidth(),
            value = selected?.name ?: "Select warehouse",
            onValueChange = {},
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) }
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            warehouses.forEach { warehouse ->
                DropdownMenuItem(
                    text = { Text(warehouse.name) },
                    onClick = {
                        onSelect(warehouse.id)
                        expanded = false
                    }
                )
            }
        }
    }
}
