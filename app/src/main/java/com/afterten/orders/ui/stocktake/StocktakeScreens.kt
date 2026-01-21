package com.afterten.orders.ui.stocktake

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
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
    val hasOpenPeriod = ui.openPeriod?.status == "open"

    if (session != null && !session.hasRole(RoleGuards.Stocktake)) {
        AccessDeniedCard(
            title = "Stocktake role required",
            message = "Ask an admin to assign the Stocktake role to your account.",
            primaryLabel = "Back",
            onPrimary = onBack
        )
        return
    }

    val primaryRed = Color(0xFFD50000)
    val surfaceBlack = Color.Black
    val outlinedFieldColors = TextFieldDefaults.colors(
        focusedIndicatorColor = primaryRed,
        unfocusedIndicatorColor = primaryRed,
        disabledIndicatorColor = primaryRed,
        cursorColor = Color.White,
        focusedLabelColor = Color.White,
        unfocusedLabelColor = Color.White,
        disabledLabelColor = Color.White,
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White,
        disabledTextColor = Color.White,
        focusedContainerColor = Color.Black,
        unfocusedContainerColor = Color.Black,
        disabledContainerColor = Color.Black
    )

    var note by rememberSaveable { mutableStateOf("") }
    var outletMenu by remember { mutableStateOf(false) }
    var warehouseMenu by remember { mutableStateOf(false) }

    val outletLabel = ui.outlets.firstOrNull { it.id == ui.selectedOutletId }?.name
        ?: "Select outlet"
    val warehouseLabel = ui.filteredWarehouses.firstOrNull { it.id == ui.selectedWarehouseId }?.name
        ?: "Select warehouse"
    val canSelectOutlet = ui.outlets.isNotEmpty()
    val warehouseEnabled = ui.filteredWarehouses.isNotEmpty()

    val scroll = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .verticalScroll(scroll)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White) }
            Text("Stocktake", fontWeight = FontWeight.Bold, color = Color.White)
            if (ui.loading) CircularProgressIndicator(modifier = Modifier.size(24.dp), color = primaryRed) else Spacer(Modifier.size(24.dp))
        }

        ui.error?.let {
            Card(colors = CardDefaults.cardColors(containerColor = surfaceBlack), border = BorderStroke(1.dp, primaryRed)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = primaryRed)
                    Spacer(Modifier.width(8.dp))
                    Text(it, color = Color.White)
                }
            }
        }

        if (!hasOpenPeriod) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = surfaceBlack),
                border = BorderStroke(1.dp, primaryRed)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Outlet", color = Color.White, fontWeight = FontWeight.Bold)
                    ExposedDropdownMenuBox(expanded = outletMenu, onExpandedChange = { outletMenu = it }) {
                        OutlinedTextField(
                            value = outletLabel,
                            onValueChange = {},
                            readOnly = true,
                            enabled = canSelectOutlet && !ui.loading,
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = outletMenu) },
                            modifier = Modifier
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                .fillMaxWidth(),
                            colors = outlinedFieldColors
                        )
                        DropdownMenu(expanded = outletMenu, onDismissRequest = { outletMenu = false }) {
                            ui.outlets.forEach { outlet ->
                                DropdownMenuItem(
                                    text = { Text(outlet.name, color = Color.White) },
                                    onClick = {
                                        outletMenu = false
                                        vm.selectOutlet(outlet.id)
                                    },
                                    contentPadding = MenuDefaults.DropdownMenuItemContentPadding
                                )
                            }
                        }
                    }

                    Text("Warehouse", color = Color.White, fontWeight = FontWeight.Bold)
                    ExposedDropdownMenuBox(expanded = warehouseMenu, onExpandedChange = { warehouseMenu = it }) {
                        OutlinedTextField(
                            value = warehouseLabel,
                            onValueChange = {},
                            readOnly = true,
                            enabled = warehouseEnabled && !ui.loading,
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = warehouseMenu) },
                            modifier = Modifier
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                .fillMaxWidth(),
                            colors = outlinedFieldColors
                        )
                        DropdownMenu(expanded = warehouseMenu, onDismissRequest = { warehouseMenu = false }) {
                            ui.filteredWarehouses.forEach { wh ->
                                DropdownMenuItem(
                                    text = { Text(wh.name, color = Color.White) },
                                    onClick = {
                                        warehouseMenu = false
                                        vm.selectWarehouse(wh.id)
                                    },
                                    contentPadding = MenuDefaults.DropdownMenuItemContentPadding
                                )
                            }
                        }
                    }

                    Text(
                        "Warehouses come from Outlet setup → Stocktake mapping. Pick the outlet’s warehouse you count in.",
                        color = Color.White.copy(alpha = 0.8f),
                        style = MaterialTheme.typography.bodySmall
                    )

                    if (ui.selectedOutletId != null && ui.filteredWarehouses.isEmpty()) {
                        Text("No warehouses available for this outlet", color = Color.White)
                    }

                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Note (optional)") },
                        colors = outlinedFieldColors
                    )
                    Button(
                        enabled = !hasOpenPeriod && ui.selectedOutletId != null && ui.selectedWarehouseId != null && !ui.loading,
                        onClick = { vm.startStocktake(note.takeIf { it.isNotBlank() }) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
                    ) {
                        Icon(Icons.Default.PlayArrow, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Start stocktake")
                    }
                }
            }
        }

        // Debug log intentionally hidden from UI; logs remain in Logcat.

        ui.openPeriod?.let { period ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = surfaceBlack),
                border = BorderStroke(1.dp, primaryRed)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(period.stocktakeNumber ?: "In-progress", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Color.White)
                    Text("Status: ${period.status}", color = Color.White)
                    period.note?.takeIf { it.isNotBlank() }?.let { Text("Note: $it", color = Color.White) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { onOpenCounts(period.id) },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
                        ) { Text("Enter counts") }
                        OutlinedButton(
                            onClick = { onOpenVariance(period.id) },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                            border = BorderStroke(1.dp, primaryRed)
                        ) { Text("View variance") }
                    }
                    OutlinedButton(
                        onClick = { vm.closePeriod() },
                        enabled = period.status == "open" && !ui.loading,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                        border = BorderStroke(1.dp, primaryRed)
                    ) { Text("Close period") }
                }
            }
        }

        TextButton(onClick = onBack, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text("Back", color = Color.White)
        }
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
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
    var search by rememberSaveable { mutableStateOf("") }
    var selectedName by rememberSaveable { mutableStateOf("") }
    var inputError by rememberSaveable { mutableStateOf<String?>(null) }

    fun formatQty(value: Double?): String = String.format("%.2f", value ?: 0.0)
    val imageSize = 96.dp

    val primaryRed = Color(0xFFD50000)
    val outlinedFieldColors = TextFieldDefaults.colors(
        focusedIndicatorColor = primaryRed,
        unfocusedIndicatorColor = primaryRed,
        disabledIndicatorColor = primaryRed,
        cursorColor = Color.White,
        focusedLabelColor = Color.White,
        unfocusedLabelColor = Color.White,
        disabledLabelColor = Color.White,
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White,
        disabledTextColor = Color.White,
        focusedContainerColor = Color.Black,
        unfocusedContainerColor = Color.Black,
        disabledContainerColor = Color.Black
    )

    val filteredItems = remember(ui.items, search) {
        val term = search.trim().lowercase()
        if (term.isBlank()) ui.items else ui.items.filter {
            it.itemName?.lowercase()?.contains(term) == true || it.itemId.lowercase().contains(term)
        }
    }


    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White) }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(stocktakeNumber ?: ui.openPeriod?.stocktakeNumber ?: "Stocktake", fontWeight = FontWeight.Bold, color = Color.White)
                Text(periodId.take(8) + "…", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.7f))
            }
            if (ui.loading) CircularProgressIndicator(modifier = Modifier.size(24.dp), color = primaryRed) else Spacer(Modifier.size(24.dp))
        }

        ui.error?.let {
            Card(colors = CardDefaults.cardColors(containerColor = Color.Black), border = BorderStroke(1.dp, primaryRed)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = primaryRed)
                    Spacer(Modifier.width(8.dp))
                    Text(it, color = Color.White)
                }
            }
        }

        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color.Black),
            border = BorderStroke(1.dp, primaryRed)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = search,
                    onValueChange = { search = it },
                    label = { Text("Search items in warehouse") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = outlinedFieldColors
                )
                Text(
                    "If ingredients exist, we list them. Otherwise we show product variants (or base if no variants).",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.8f)
                )
                if (filteredItems.isEmpty()) {
                    Text("No items found for this warehouse", style = MaterialTheme.typography.bodyMedium, color = Color.White)
                } else {
                    BoxWithConstraints {
                        val columns = 2
                        val targetSize = 440.dp // ~7cm square at 160dpi
                        val horizontalSpacing = 12.dp
                        val cardSize = minOf(targetSize, (maxWidth - horizontalSpacing) / columns)

                        FlowRow(
                            maxItemsInEachRow = columns,
                            horizontalArrangement = Arrangement.spacedBy(horizontalSpacing),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            filteredItems.take(80).forEach { row ->
                                Button(
                                    onClick = {
                                        itemId = row.itemId
                                        variantKey = row.variantKey?.ifBlank { "base" } ?: "base"
                                        selectedName = row.itemName ?: row.itemId
                                        qtyText = formatQty(row.netUnits)
                                        inputError = null
                                    },
                                    modifier = Modifier
                                        .size(cardSize),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color.Black, contentColor = Color.White),
                                    border = BorderStroke(1.dp, primaryRed),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Column(
                                        modifier = Modifier.fillMaxSize(),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        verticalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        AsyncImage(
                                            model = row.imageUrl,
                                            contentDescription = "Product photo",
                                            modifier = Modifier
                                                .size(imageSize)
                                                .clip(RoundedCornerShape(8.dp)),
                                            alignment = Alignment.Center
                                        )
                                        Text(row.itemName ?: "Item", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color.White)
                                        Text("Variant: ${row.variantKey ?: "base"}", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.9f))
                                        Text("Qty: ${formatQty(row.netUnits)}", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.9f))
                                    }
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    if (itemId.isNotBlank()) {
                        Text("Selected item", fontWeight = FontWeight.Bold, color = Color.White)
                        Text(selectedName.ifBlank { itemId }, color = Color.White)
                        OutlinedTextField(
                            value = qtyText,
                            onValueChange = { qtyText = it },
                            label = { Text("Quantity (units)") },
                            modifier = Modifier.fillMaxWidth(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            colors = outlinedFieldColors
                        )
                        inputError?.let { Text(it, color = primaryRed, style = MaterialTheme.typography.labelSmall) }
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Button(
                                onClick = {
                                    val parsed = qtyText.trim().toDoubleOrNull()
                                    if (parsed == null || parsed < 0) {
                                        inputError = "Enter a non-negative number"
                                        return@Button
                                    }
                                    inputError = null
                                    vm.recordCount(itemId, parsed, variantKey, "opening")
                                },
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
                            ) {
                                Icon(Icons.Default.Check, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text("Save opening")
                            }
                            OutlinedButton(
                                onClick = {
                                    val parsed = qtyText.trim().toDoubleOrNull()
                                    if (parsed == null || parsed < 0) {
                                        inputError = "Enter a non-negative number"
                                        return@OutlinedButton
                                    }
                                    inputError = null
                                    vm.recordCount(itemId, parsed, variantKey, "closing")
                                },
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                                border = BorderStroke(1.dp, primaryRed)
                            ) {
                                Text("Save closing")
                            }
                        }
                        ui.lastCount?.takeIf { it.itemId == itemId }?.let { last ->
                            val kindLabel = last.kind.replaceFirstChar { ch -> ch.titlecase() }
                            Text(
                                "$kindLabel saved: ${formatQty(last.countedQty)}",
                                color = Color.White,
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                    }
                }
            }
        }

    }
}

@Composable
fun StocktakeVarianceScreen(
    root: RootViewModel,
    periodId: String,
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

    fun fmt(value: Double): String = String.format("%.2f", value)

    val allowedVariance = remember(ui.items, ui.variance) {
        if (ui.items.isEmpty()) return@remember ui.variance
        val allowed = ui.items
            .groupBy { it.itemId }
            .mapValues { entry ->
                entry.value.map { it.variantKey?.ifBlank { "base" } ?: "base" }.toSet()
            }
        ui.variance.filter { row ->
            val keys = allowed[row.itemId] ?: return@filter false
            val vKey = row.variantKey?.ifBlank { "base" } ?: "base"
            keys.contains(vKey)
        }
    }

    if (session != null && !session.hasRole(RoleGuards.Stocktake)) {
        AccessDeniedCard(
            title = "Stocktake role required",
            message = "Ask an admin to assign the Stocktake role to your account.",
            primaryLabel = "Back",
            onPrimary = onBack
        )
        return
    }

    val primaryRed = Color(0xFFD50000)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
            Text(ui.openPeriod?.stocktakeNumber ?: "Variance", fontWeight = FontWeight.Bold)
            if (ui.loading) CircularProgressIndicator(modifier = Modifier.size(24.dp), color = primaryRed) else Spacer(Modifier.size(24.dp))
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

        if (allowedVariance.isEmpty()) {
            Text("No variance rows for this period yet", style = MaterialTheme.typography.bodyMedium)
        } else {
            allowedVariance.forEach { row ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        val varianceColor = if (row.varianceQty < 0) primaryRed else Color(0xFF2E7D32)
                        Text(row.itemName ?: row.itemId, fontWeight = FontWeight.Bold)
                        Text(row.itemId, style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                        Text("Variant: ${row.variantKey ?: "base"}", style = MaterialTheme.typography.labelSmall)
                        Text("Opening: ${fmt(row.openingQty)}  Movement: ${fmt(row.movementQty)}", style = MaterialTheme.typography.bodySmall)
                        Text("Expected: ${fmt(row.expectedQty)}", style = MaterialTheme.typography.bodySmall)
                        Text("Counted: ${fmt(row.closingQty)}", style = MaterialTheme.typography.bodySmall)
                        Text("Variance: ${fmt(row.varianceQty)}", style = MaterialTheme.typography.bodySmall, color = varianceColor)
                        if (row.unitCost > 0.0) {
                            Text("Variance value: ${fmt(row.varianceCost)}", style = MaterialTheme.typography.bodySmall, color = varianceColor)
                        }
                    }
                }
            }
        }

        // Debug log intentionally hidden from UI; logs remain in Logcat.
    }
}

