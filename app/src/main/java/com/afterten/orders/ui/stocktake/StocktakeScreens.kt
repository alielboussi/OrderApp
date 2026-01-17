package com.afterten.orders.ui.stocktake

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun StocktakeDashboardScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onOpenCounts: (String) -> Unit,
    onOpenVariance: (String) -> Unit
) {
    val session by root.session.collectAsState()
    val vm: StocktakeViewModel = viewModel(factory = StocktakeViewModel.Factory(root.supabaseProvider))
    LaunchedEffect(session?.token) { vm.bindSession(session) }
    val ui by vm.ui.collectAsState()

    if (session != null && !session.hasRole(RoleGuards.Stocktake)) {
        AccessDeniedCard(
            title = "Stocktake role required",
            message = "Ask an admin to assign the Stocktake role to your account.",
            primaryLabel = "Back",
            onPrimary = onBack
        )
        return
    }

    var note by rememberSaveable { mutableStateOf("") }
    var warehouseMenu by remember { mutableStateOf(false) }
    var warehouseLabel by remember(ui.selectedWarehouseId, ui.warehouses) {
        val name = ui.warehouses.firstOrNull { it.id == ui.selectedWarehouseId }?.name ?: "Select warehouse"
        mutableStateOf(name)
    }

    val scroll = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
            Text("Stocktake", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            if (ui.loading) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            } else {
                Spacer(Modifier.size(24.dp))
            }
        }

        ui.error?.let {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(it, color = MaterialTheme.colorScheme.onErrorContainer)
                }
            }
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Warehouse", style = MaterialTheme.typography.titleMedium)
                ExposedDropdownMenuBox(
                    expanded = warehouseMenu,
                    onExpandedChange = { warehouseMenu = !warehouseMenu }
                ) {
                    OutlinedTextField(
                        value = warehouseLabel,
                        onValueChange = {},
                        readOnly = true,
                        modifier = Modifier
                            .fillMaxWidth(),
                        label = { Text("Choose warehouse") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = warehouseMenu) }
                    )
                    DropdownMenu(
                        expanded = warehouseMenu,
                        onDismissRequest = { warehouseMenu = false }
                    ) {
                        ui.warehouses.forEach { warehouse ->
                            DropdownMenuItem(
                                text = { Text(warehouse.name) },
                                onClick = {
                                    warehouseMenu = false
                                    warehouseLabel = warehouse.name
                                    vm.selectWarehouse(warehouse.id)
                                }
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Note (optional)") }
                )
                Button(
                    enabled = ui.openPeriod == null && ui.selectedWarehouseId != null && !ui.loading,
                    onClick = { vm.startStocktake(note.takeIf { it.isNotBlank() }) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Start stocktake")
                }
            }
        }

        ui.openPeriod?.let { period ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(period.stocktakeNumber ?: "In-progress", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("Status: ${period.status}")
                    period.note?.takeIf { it.isNotBlank() }?.let { Text("Note: $it") }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { onOpenCounts(period.id) },
                            modifier = Modifier.weight(1f)
                        ) { Text("Enter counts") }
                        OutlinedButton(
                            onClick = { onOpenVariance(period.id) },
                            modifier = Modifier.weight(1f)
                        ) { Text("View variance") }
                    }
                    OutlinedButton(
                        onClick = { vm.closePeriod() },
                        enabled = period.status == "open" && !ui.loading,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Close period")
                    }
                }
            }
        }

        TextButton(
            onClick = onBack,
            modifier = Modifier.align(Alignment.CenterHorizontally)
        ) { Text("Back") }
    }
}

@Composable
fun StocktakeCountScreen(
    root: RootViewModel,
    periodId: String,
    stocktakeNumber: String? = null,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val vm: StocktakeViewModel = viewModel(factory = StocktakeViewModel.Factory(root.supabaseProvider))
    LaunchedEffect(session?.token) { vm.bindSession(session) }
    LaunchedEffect(periodId, session?.token) { vm.loadPeriod(periodId) }
    val ui by vm.ui.collectAsState()

    if (session != null && !session.hasRole(RoleGuards.Stocktake)) {
        AccessDeniedCard(
            title = "Stocktake role required",
            message = "Ask an admin to assign the Stocktake role to your account.",
            primaryLabel = "Back",
            onPrimary = onBack
        )
        return
    }

    var itemId by rememberSaveable { mutableStateOf("") }
    var variantKey by rememberSaveable { mutableStateOf("base") }
    var qtyText by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf("closing") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(stocktakeNumber ?: ui.openPeriod?.stocktakeNumber ?: "Stocktake", fontWeight = FontWeight.Bold)
                Text(periodId.take(8) + "…", style = MaterialTheme.typography.labelSmall)
            }
            if (ui.loading) CircularProgressIndicator(modifier = Modifier.size(24.dp)) else Spacer(Modifier.size(24.dp))
        }

        ui.error?.let {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(it, color = MaterialTheme.colorScheme.onErrorContainer)
                }
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = itemId,
                    onValueChange = { itemId = it },
                    label = { Text("Product ID") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = variantKey,
                    onValueChange = { variantKey = it.ifBlank { "base" } },
                    label = { Text("Variant key") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = qtyText,
                    onValueChange = { qtyText = it },
                    label = { Text("Quantity") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Kind:")
                    FilterChip(label = "Closing", selected = kind == "closing") { kind = "closing" }
                    FilterChip(label = "Opening", selected = kind == "opening") { kind = "opening" }
                }
                Button(
                    onClick = {
                        val qty = qtyText.toDoubleOrNull() ?: 0.0
                        vm.recordCount(itemId.trim(), qty, variantKey.trim().ifBlank { "base" }, kind)
                    },
                    enabled = itemId.isNotBlank() && qtyText.toDoubleOrNull() != null && !ui.loading,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Check, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Save count")
                }
                ui.lastCount?.let { last ->
                    Text(
                        "Saved ${last.countedQty} on ${last.variantKey ?: "base"}",
                        style = MaterialTheme.typography.labelMedium
                    )
                }
            }
        }
    }
}

@Composable
fun StocktakeVarianceScreen(
    root: RootViewModel,
    periodId: String,
    stocktakeNumber: String? = null,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val vm: StocktakeViewModel = viewModel(factory = StocktakeViewModel.Factory(root.supabaseProvider))
    LaunchedEffect(session?.token) { vm.bindSession(session) }
    LaunchedEffect(periodId, session?.token) {
        vm.loadPeriod(periodId)
        vm.loadVarianceFor(periodId)
    }
    val ui by vm.ui.collectAsState()

    if (session != null && !session.hasRole(RoleGuards.Stocktake)) {
        AccessDeniedCard(
            title = "Stocktake role required",
            message = "Ask an admin to assign the Stocktake role to your account.",
            primaryLabel = "Back",
            onPrimary = onBack
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(stocktakeNumber ?: ui.openPeriod?.stocktakeNumber ?: "Variance", fontWeight = FontWeight.Bold)
                Text(periodId.take(8) + "…", style = MaterialTheme.typography.labelSmall)
            }
            if (ui.loading) CircularProgressIndicator(modifier = Modifier.size(24.dp)) else Spacer(Modifier.size(24.dp))
        }

        ui.error?.let {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(it, color = MaterialTheme.colorScheme.onErrorContainer)
                }
            }
        }

        if (ui.variance.isEmpty()) {
            Text("No variance rows yet", style = MaterialTheme.typography.bodyMedium)
        } else {
            ui.variance.forEach { row ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Item: ${row.itemId}", fontWeight = FontWeight.Bold)
                        Text("Variant: ${row.variantKey ?: "base"}")
                        Text("Opening: ${row.openingQty}")
                        Text("Movement: ${row.movementQty}")
                        Text("Expected: ${row.expectedQty}")
                        Text("Closing: ${row.closingQty}")
                        Text("Variance: ${row.varianceQty}")
                    }
                }
            }
        }
    }
}

@Composable
private fun FilterChip(label: String, selected: Boolean, onSelect: () -> Unit) {
    val bg = rememberUpdatedState(if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surface)
    OutlinedButton(
        onClick = onSelect,
        colors = ButtonDefaults.outlinedButtonColors(containerColor = bg.value),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Text(label)
    }
}
