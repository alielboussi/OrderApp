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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Remove
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
import androidx.compose.runtime.mutableStateMapOf
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
import androidx.compose.ui.window.Dialog
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
                        "Warehouses come from Outlet setup → Deduct warehouses. Pick the outlet’s warehouse you count in.",
                        color = Color.White.copy(alpha = 0.8f),
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        "Flow: enter opening counts, process transfers/damages, then enter closing counts and close the period.",
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

    var search by rememberSaveable { mutableStateOf("") }
    var inputError by rememberSaveable { mutableStateOf<String?>(null) }
    var variantDialogOpen by rememberSaveable { mutableStateOf(false) }
    var dialogItemId by rememberSaveable { mutableStateOf("") }
    var dialogItemName by rememberSaveable { mutableStateOf("") }
    var dialogItemKind by rememberSaveable { mutableStateOf<String?>(null) }
    val dialogQty = remember { mutableStateMapOf<String, String>() }

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

    val variantLabelMap = remember(ui.variations) {
        val map = mutableMapOf("base" to "Base")
        ui.variations.forEach { variation ->
            map[variation.id] = variation.name.ifBlank { variation.id }
            map[variation.id.lowercase()] = variation.name.ifBlank { variation.id }
            variation.key?.let { key ->
                map[key] = variation.name.ifBlank { key }
                map[key.lowercase()] = variation.name.ifBlank { key }
            }
        }
        map
    }
    val variantUomMap = remember(ui.variations) {
        val map = mutableMapOf<String, String>()
        ui.variations.forEach { variation ->
            val uom = variation.consumptionUom.ifBlank { variation.uom.ifBlank { "each" } }
            map[variation.id] = uom
            map[variation.id.lowercase()] = uom
            variation.key?.let { key -> map[key] = uom }
            variation.key?.let { key -> map[key.lowercase()] = uom }
        }
        map
    }

    val itemsByItemId = remember(ui.allItems, ui.items) {
        val source = if (ui.allItems.isNotEmpty()) ui.allItems else ui.items
        source.groupBy { it.itemId }
    }

    val filteredBaseItems = remember(ui.items, ui.variations, search) {
        val term = search.trim().lowercase()
        val matchesTerm: (String, List<com.afterten.orders.data.SupabaseProvider.WarehouseStockItem>) -> Boolean = { itemId, rows ->
            if (term.isBlank()) {
                true
            } else {
                val nameMatch = rows.firstOrNull()?.itemName?.lowercase()?.contains(term) == true
                if (nameMatch || itemId.lowercase().contains(term)) {
                    true
                } else {
                    rows.any { row ->
                        val key = row.variantKey?.ifBlank { "base" } ?: "base"
                        val label = variantLabelMap[key]?.lowercase() ?: ""
                        label.contains(term)
                    }
                }
            }
        }

        itemsByItemId.mapNotNull { (itemId, rows) ->
            val baseRow = rows.firstOrNull { (it.variantKey ?: "base") == "base" } ?: rows.firstOrNull()
            when {
                baseRow == null -> null
                !matchesTerm(itemId, rows) -> null
                else -> baseRow
            }
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
                    "Tap an ingredient, variant group, or recipe item to enter counts.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.8f)
                )
                Text(
                    "Opening counts must be entered before closing counts for the same item.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.8f)
                )
                if (filteredBaseItems.isEmpty()) {
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
                            filteredBaseItems.take(80).forEach { row ->
                                Button(
                                    onClick = {
                                        inputError = null
                                        dialogQty.clear()
                                        dialogItemId = row.itemId
                                        dialogItemName = row.itemName ?: row.itemId
                                        dialogItemKind = row.itemKind
                                        variantDialogOpen = true
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
                                        val rows = itemsByItemId[row.itemId].orEmpty()
                                        val variantCount = rows.count { (it.variantKey ?: "base") != "base" }
                                        val hasRecipe = rows.any { it.hasRecipe == true } && (row.itemKind ?: "").lowercase() != "ingredient"
                                        val badge = if ((row.itemKind ?: "").lowercase() == "ingredient") {
                                            "Ingredient"
                                        } else if (hasRecipe) {
                                            "Ingredients"
                                        } else if (variantCount > 0) {
                                            "${variantCount} variant${if (variantCount == 1) "" else "s"}"
                                        } else {
                                            "Base item"
                                        }
                                        Text(badge, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.9f))
                                        Text("Qty: ${formatQty(row.netUnits)}", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.9f))
                                    }
                                }

                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    ui.lastCount?.let { last ->
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

    if (variantDialogOpen) {
        val dialogRows = itemsByItemId[dialogItemId].orEmpty()
        val baseRow = dialogRows.firstOrNull { (it.variantKey ?: "base") == "base" } ?: dialogRows.firstOrNull()
        val kindLabel = (dialogItemKind ?: baseRow?.itemKind ?: "").lowercase()
        val isIngredient = kindLabel == "ingredient"
        val hasRecipe = !isIngredient && (baseRow?.hasRecipe == true)
        val dialogVariantKey = baseRow?.variantKey?.ifBlank { "base" } ?: "base"
        val recipeKey = "$dialogItemId|$dialogVariantKey"
        val ingredientIds = ui.recipeIngredients[recipeKey].orEmpty()
        val ingredientRows = if (hasRecipe) {
            ingredientIds.mapNotNull { id ->
                val rows = itemsByItemId[id].orEmpty()
                rows.firstOrNull { (it.variantKey ?: "base") == "base" } ?: rows.firstOrNull()
            }
        } else {
            emptyList()
        }
        val recipeLoading = hasRecipe && ui.recipeIngredientsLoading.contains(recipeKey)
        val variantRows = dialogRows.filter { (it.variantKey ?: "base") != "base" }
        val displayRows = when {
            hasRecipe -> ingredientRows
            isIngredient -> listOfNotNull(baseRow)
            variantRows.isNotEmpty() -> variantRows
            else -> listOfNotNull(baseRow)
        }

        LaunchedEffect(dialogItemId, dialogVariantKey, hasRecipe) {
            if (hasRecipe) {
                vm.loadRecipeIngredients(dialogItemId, dialogVariantKey)
            }
        }

        LaunchedEffect(dialogItemId, displayRows.size) {
            displayRows.forEach { row ->
                val key = "${row.itemId}|${row.variantKey?.ifBlank { "base" } ?: "base"}"
                if (!dialogQty.containsKey(key)) {
                    dialogQty[key] = formatQty(row.netUnits)
                }
            }
        }

        Dialog(onDismissRequest = { variantDialogOpen = false }) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color.Black),
                border = BorderStroke(1.dp, primaryRed),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(dialogItemName.ifBlank { dialogItemId }, fontWeight = FontWeight.Bold, color = Color.White)
                    Text(
                        if (hasRecipe) "Enter ingredient counts" else if (isIngredient) "Enter ingredient count" else "Enter variant counts",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.8f)
                    )

                    if (hasRecipe && recipeLoading) {
                        Text("Loading ingredients...", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
                    }

                    if (hasRecipe && !recipeLoading && ingredientRows.isEmpty()) {
                        Text("No ingredients found for this recipe.", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
                    }

                    displayRows.forEach { row ->
                        val key = row.variantKey?.ifBlank { "base" } ?: "base"
                        val label = if (hasRecipe) {
                            row.itemName ?: row.itemId
                        } else if (key == "base") {
                            "Base"
                        } else {
                            variantLabelMap[key] ?: variantLabelMap[key.lowercase()] ?: key.take(8)
                        }
                        val uom = variantUomMap[key] ?: variantUomMap[key.lowercase()]
                            ?: ui.productUoms[row.itemId]
                            ?: "each"
                        val qtyKey = "${row.itemId}|$key"
                        val currentQty = dialogQty[qtyKey] ?: formatQty(row.netUnits)
                        val hasStock = (row.netUnits ?: 0.0) > 0.0

                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color.Black),
                            border = BorderStroke(1.dp, primaryRed)
                        ) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(label, fontWeight = FontWeight.SemiBold, color = Color.White)
                                Text(uom.uppercase(), style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.75f))
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    IconButton(
                                        onClick = {
                                            val parsed = currentQty.toDoubleOrNull() ?: 0.0
                                            dialogQty[qtyKey] = formatQty(parsed - 1)
                                        }
                                    ) {
                                        Icon(Icons.Default.Remove, contentDescription = "Decrease", tint = primaryRed)
                                    }
                                    OutlinedTextField(
                                        value = currentQty,
                                        onValueChange = { dialogQty[qtyKey] = it },
                                        label = { Text("Qty") },
                                        modifier = Modifier.weight(1f),
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        colors = outlinedFieldColors
                                    )
                                    IconButton(
                                        onClick = {
                                            val parsed = currentQty.toDoubleOrNull() ?: 0.0
                                            dialogQty[qtyKey] = formatQty(parsed + 1)
                                        }
                                    ) {
                                        Icon(Icons.Default.Add, contentDescription = "Increase", tint = primaryRed)
                                    }
                                }
                                Button(
                                    onClick = {
                                        val parsed = (dialogQty[qtyKey] ?: "").trim().toDoubleOrNull()
                                        if (parsed == null || parsed < 0) {
                                            inputError = "Enter a non-negative number"
                                            return@Button
                                        }
                                        inputError = null
                                        val mode = if (hasStock) "closing" else "opening"
                                        vm.recordCount(row.itemId, parsed, key, mode)
                                        variantDialogOpen = false
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
                                ) {
                                    Icon(Icons.Default.Check, contentDescription = null)
                                    Spacer(Modifier.width(6.dp))
                                    Text(if (hasStock) "Save closing" else "Save opening")
                                }
                            }
                        }
                    }

                    inputError?.let { Text(it, color = primaryRed, style = MaterialTheme.typography.labelSmall) }
                    Button(
                        onClick = { variantDialogOpen = false },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color.DarkGray, contentColor = Color.White)
                    ) {
                        Text("Close")
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

