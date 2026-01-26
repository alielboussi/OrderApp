package com.afterten.orders.ui.balances

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.MenuDefaults
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.afterten.orders.RootViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OutletWarehouseBalancesScreen(
    root: RootViewModel,
    onLogout: () -> Unit
) {
    val session by root.session.collectAsState()
    val vm: BalancesViewModel = viewModel(factory = BalancesViewModel.Factory(root.supabaseProvider))
    LaunchedEffect(session?.token) { vm.bindSession(session) }
    val ui by vm.ui.collectAsState()

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

    var outletExpanded by remember { mutableStateOf(false) }
    var warehouseExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Afterten Live Stock", fontWeight = FontWeight.Bold, color = Color.White)
            Button(
                onClick = onLogout,
                colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
            ) { Text("Log out") }
        }

        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = surfaceBlack),
            border = BorderStroke(1.dp, primaryRed)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Filters", fontWeight = FontWeight.Bold, color = Color.White)

                ExposedDropdownMenuBox(expanded = outletExpanded, onExpandedChange = { outletExpanded = it }) {
                    OutlinedTextField(
                        value = ui.outlets.firstOrNull { it.id == ui.selectedOutletId }?.name ?: "Select outlet",
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = outletExpanded) },
                        modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                        colors = outlinedFieldColors
                    )
                    DropdownMenu(expanded = outletExpanded, onDismissRequest = { outletExpanded = false }) {
                        ui.outlets.forEach { outlet ->
                            DropdownMenuItem(
                                text = { Text(outlet.name, color = Color.White) },
                                onClick = {
                                    outletExpanded = false
                                    vm.selectOutlet(outlet.id)
                                },
                                contentPadding = MenuDefaults.DropdownMenuItemContentPadding
                            )
                        }
                    }
                }

                ExposedDropdownMenuBox(expanded = warehouseExpanded, onExpandedChange = { warehouseExpanded = it }) {
                    OutlinedTextField(
                        value = ui.warehouses.firstOrNull { it.id == ui.selectedWarehouseId }?.name ?: "Select warehouse",
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = warehouseExpanded) },
                        modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                        colors = outlinedFieldColors
                    )
                    DropdownMenu(expanded = warehouseExpanded, onDismissRequest = { warehouseExpanded = false }) {
                        ui.warehouses.forEach { wh ->
                            DropdownMenuItem(
                                text = { Text(wh.name, color = Color.White) },
                                onClick = {
                                    warehouseExpanded = false
                                    vm.selectWarehouse(wh.id)
                                },
                                contentPadding = MenuDefaults.DropdownMenuItemContentPadding
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = ui.search,
                    onValueChange = { vm.setSearch(it) },
                    label = { Text("Search item name") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = outlinedFieldColors
                )

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    FilterToggle("Ingredients", ui.includeIngredients) { vm.setIncludeIngredients(it) }
                    FilterToggle("Raw", ui.includeRaw) { vm.setIncludeRaw(it) }
                    FilterToggle("Finished", ui.includeFinished) { vm.setIncludeFinished(it) }
                    FilterToggle("Base only", ui.baseOnly) { vm.setBaseOnly(it) }
                }
            }
        }

        if (ui.error != null) {
            Card(colors = CardDefaults.cardColors(containerColor = surfaceBlack), border = BorderStroke(1.dp, primaryRed)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = primaryRed)
                    Spacer(Modifier.width(8.dp))
                    Text(ui.error ?: "", color = Color.White)
                }
            }
        }

        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = surfaceBlack),
            border = BorderStroke(1.dp, primaryRed)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column {
                        Text("Live Stock", fontWeight = FontWeight.Bold, color = Color.White)
                        Text("Showing ${ui.items.size} items", color = Color.White.copy(alpha = 0.7f))
                    }
                    if (ui.loading) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), color = primaryRed)
                    }
                }

                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Item", color = Color.White, fontWeight = FontWeight.Bold)
                    Text("Variant", color = Color.White, fontWeight = FontWeight.Bold)
                    Text("Kind", color = Color.White, fontWeight = FontWeight.Bold)
                    Text("Net Units", color = Color.White, fontWeight = FontWeight.Bold)
                }

                ui.items.forEach { item ->
                    val variantLabel = ui.variantNames[item.variantKey ?: ""]
                        ?: (item.variantKey?.ifBlank { "base" } ?: "base")
                    val uom = ui.itemUoms[item.itemId]
                    val formatted = formatQtyWithUom(item.netUnits, uom)
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(item.itemName ?: item.itemId, color = Color.White)
                        Text(variantLabel, color = Color.White)
                        Text(item.itemKind ?: "-", color = Color.White)
                        Text("${formatted.text} ${formatted.uom}".trim(), color = Color.White)
                    }
                }

                if (!ui.loading && ui.items.isEmpty()) {
                    Text("No balances found for the current filters.", color = Color.White.copy(alpha = 0.7f))
                }
            }
        }

        Spacer(Modifier.height(12.dp))
        TextButton(onClick = onLogout, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text("Log out", color = Color.White)
        }
    }
}

@Composable
private fun FilterToggle(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(label, color = Color.White)
    }
}

private fun formatQtyWithUom(value: Double?, uom: String?): FormattedQty {
    if (value == null || value.isNaN()) return FormattedQty("-", uom.orEmpty())
    val unit = (uom ?: "").lowercase()
    val abs = kotlin.math.abs(value)

    return when {
        unit == "g" && abs >= 1000 -> FormattedQty((value / 1000).formatQty(), "kg")
        unit == "mg" && abs >= 1000 -> FormattedQty((value / 1000).formatQty(), "g")
        unit == "ml" && abs >= 1000 -> FormattedQty((value / 1000).formatQty(), "l")
        else -> FormattedQty(value.formatQty(), uom.orEmpty())
    }
}

private data class FormattedQty(val text: String, val uom: String)

private fun Double.formatQty(): String = java.text.DecimalFormat("#,##0.###").format(this)
