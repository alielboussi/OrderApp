package com.afterten.orders.ui.screens

import androidx.compose.runtime.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.input.PasswordVisualTransformation
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.SupabaseProvider
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun WarehousesAdminScreen(
    root: RootViewModel,
    allowedAdminUuid: String = "d86e2ce6-13a3-4bd9-a174-9f18f6f8a035",
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    val session = root.session.collectAsState().value
    val scope = rememberCoroutineScope()

    var outlets by remember { mutableStateOf<List<SupabaseProvider.Outlet>>(emptyList()) }
    var warehouses by remember { mutableStateOf<List<SupabaseProvider.Warehouse>>(emptyList()) }
    var products by remember { mutableStateOf<List<SupabaseProvider.SimpleProduct>>(emptyList()) }
    var variations by remember { mutableStateOf<List<SupabaseProvider.SimpleVariation>>(emptyList()) }

    var selectedOutletId by remember { mutableStateOf<String?>(null) }
    var selectedParentId by remember { mutableStateOf<String?>(null) }
    var newWarehouseName by remember { mutableStateOf("") }
    var adminPassword by remember { mutableStateOf("") }
    var reportOutletId by remember { mutableStateOf<String?>(null) }
    var reportWarehouseId by remember { mutableStateOf<String?>(null) }
    var packReportResults by remember { mutableStateOf<List<SupabaseProvider.PackConsumptionRow>>(emptyList()) }
    var reportLookbackDays by remember { mutableStateOf("3") }
    var isReportLoading by remember { mutableStateOf(false) }
    var stocktakeWarehouseId by remember { mutableStateOf<String?>(null) }
    var stocktakeProductId by remember { mutableStateOf<String?>(null) }
    var stocktakeVariationId by remember { mutableStateOf<String?>(null) }
    var stocktakeQty by remember { mutableStateOf("") }
    var stocktakeNote by remember { mutableStateOf("") }
    var isStocktakeLoading by remember { mutableStateOf(false) }
    var lastStocktake by remember { mutableStateOf<SupabaseProvider.StocktakeResult?>(null) }

    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(session?.token) {
        val isAdmin = session?.isAdmin == true
        val jwt = session?.token
        if (jwt != null && isAdmin) {
            runCatching {
                outlets = root.supabaseProvider.listOutlets(jwt)
                warehouses = root.supabaseProvider.listWarehouses(jwt)
                products = root.supabaseProvider.listActiveProducts(jwt)
            }.onFailure { error = it.message }
        }
    }

    LaunchedEffect(stocktakeProductId, session?.token) {
        val jwt = session?.token
        val isAdmin = session?.isAdmin == true
        if (stocktakeProductId.isNullOrBlank() || jwt == null || !isAdmin) {
            variations = emptyList()
            stocktakeVariationId = null
            return@LaunchedEffect
        }
        runCatching {
            root.supabaseProvider.listVariationsForProduct(jwt, stocktakeProductId!!)
        }.onSuccess {
            variations = it
            stocktakeVariationId = null
        }.onFailure { error = it.message }
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Warehouses Admin") },
            navigationIcon = { BackButton(onBack) }
        )
    }) { padding ->
        if (session == null) {
            MissingAuth()
            return@Scaffold
        }
        val isAdmin = session.isAdmin
        if (!isAdmin) {
            Unauthorized()
            return@Scaffold
        }

        Column(Modifier.padding(padding).padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(onClick = onLogout, shape = androidx.compose.foundation.shape.RoundedCornerShape(50)) { Text("Log out") }
            }
            
            if (message != null) Text(text = message!!, color = MaterialTheme.colorScheme.primary)
            if (error != null) Text(text = error!!, color = MaterialTheme.colorScheme.error)

            // Admin Tools: Reset Order Sequence (password protected)
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Admin Tools", style = MaterialTheme.typography.titleMedium)
                    Text("Reset Order Number Sequence to OutletName_0000001", style = MaterialTheme.typography.bodyMedium)
                    DropdownField(
                        label = "Outlet",
                        options = outlets.map { it.id to it.name },
                        selectedId = selectedOutletId,
                        onSelected = { selectedOutletId = it }
                    )
                    OutlinedTextField(
                        value = adminPassword,
                        onValueChange = { adminPassword = it },
                        label = { Text("Password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation()
                    )
                    Button(onClick = {
                        error = null; message = null
                        val jwt = session.token
                        val outletId = selectedOutletId
                        if (outletId.isNullOrEmpty()) { error = "Select an outlet"; return@Button }
                        if (adminPassword != "Lebanon1111$") { error = "Incorrect password"; return@Button }
                        scope.launch {
                            runCatching {
                                root.supabaseProvider.resetOrderSequence(jwt, outletId)
                            }.onSuccess {
                                message = "Order sequence reset for selected outlet"
                            }.onFailure { t -> error = t.message }
                        }
                    }) { Text("Reset Order Sequence") }
                }
            }

            // Create new warehouse form
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Add Warehouse", style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(value = newWarehouseName, onValueChange = { newWarehouseName = it }, label = { Text("Warehouse name") })
                    DropdownField(
                        label = "Outlet",
                        options = outlets.map { it.id to it.name },
                        selectedId = selectedOutletId,
                        onSelected = { selectedOutletId = it }
                    )
                    DropdownField(
                        label = "Parent (optional)",
                        options = (listOf(null to "<none>") + warehouses.map { it.id to it.name }),
                        selectedId = selectedParentId,
                        onSelected = { selectedParentId = it }
                    )
                    Button(onClick = {
                        error = null; message = null
                        val jwt = session.token
                        val outletId = selectedOutletId
                        val name = newWarehouseName.trim()
                        if (jwt.isEmpty() || outletId.isNullOrEmpty() || name.isEmpty()) {
                            error = "Provide name and outlet"
                            return@Button
                        }
                        scope.launch {
                            runCatching {
                                root.supabaseProvider.createWarehouse(jwt, outletId, name, parentWarehouseId = selectedParentId)
                            }.onSuccess {
                                message = "Warehouse created"
                                newWarehouseName = ""
                                warehouses = root.supabaseProvider.listWarehouses(jwt)
                            }.onFailure { error = it.message }
                        }
                    }) { Text("Create") }
                }
            }

            // Set primary warehouse for outlet
            Card {
                var primaryWarehouseId by remember { mutableStateOf<String?>(null) }
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Set Primary Warehouse for Outlet", style = MaterialTheme.typography.titleMedium)
                    DropdownField(
                        label = "Outlet",
                        options = outlets.map { it.id to it.name },
                        selectedId = selectedOutletId,
                        onSelected = { selectedOutletId = it }
                    )
                    DropdownField(
                        label = "Primary Warehouse (Parent recommended)",
                        options = warehouses.map { it.id to it.name },
                        selectedId = primaryWarehouseId,
                        onSelected = { primaryWarehouseId = it }
                    )
                    Button(onClick = {
                        error = null; message = null
                        val jwt = session.token
                        val outletId = selectedOutletId
                        val wid = primaryWarehouseId
                        if (outletId.isNullOrEmpty() || wid.isNullOrEmpty()) { error = "Select outlet and warehouse"; return@Button }
                        scope.launch {
                            runCatching {
                                root.supabaseProvider.setPrimaryWarehouseForOutlet(jwt, outletId, wid)
                            }.onSuccess { message = "Primary warehouse set" }
                             .onFailure { error = it.message }
                        }
                    }) { Text("Set Primary") }
                }
            }

            // Create a new Main Warehouse and link selected children
            Card {
                var mainName by remember { mutableStateOf("") }
                var mainOutletId by remember { mutableStateOf<String?>(null) }
                val selectableChildren = warehouses.filter { it.outletId == (mainOutletId ?: selectedOutletId) }
                val selectedChildren = remember { mutableStateMapOf<String, Boolean>() }
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Create Main Warehouse and Link Children", style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(value = mainName, onValueChange = { mainName = it }, label = { Text("Main warehouse name") })
                    DropdownField(
                        label = "Outlet",
                        options = outlets.map { it.id to it.name },
                        selectedId = mainOutletId,
                        onSelected = { mainOutletId = it }
                    )
                    Text("Select child warehouses to link:")
                    Column(Modifier.fillMaxWidth()) {
                        selectableChildren.forEach { w ->
                            val checked = selectedChildren[w.id] ?: false
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                Checkbox(checked = checked, onCheckedChange = { sel -> selectedChildren[w.id] = sel })
                                Text(w.name)
                            }
                        }
                    }
                    Button(onClick = {
                        error = null; message = null
                        val jwt = session.token
                        val outletId = mainOutletId ?: selectedOutletId
                        val name = mainName.trim()
                        if (outletId.isNullOrEmpty() || name.isEmpty()) { error = "Provide name and outlet"; return@Button }
                        scope.launch {
                            runCatching {
                                val parent = root.supabaseProvider.createWarehouse(jwt, outletId, name, parentWarehouseId = null)
                                val children = selectedChildren.filterValues { it }.keys
                                children.forEach { cid ->
                                    root.supabaseProvider.updateWarehouseParent(jwt, cid, parent.id)
                                }
                            }.onSuccess {
                                message = "Main warehouse created and children linked"
                                warehouses = root.supabaseProvider.listWarehouses(session.token)
                                mainName = ""
                                selectedChildren.clear()
                            }.onFailure { error = it.message }
                        }
                    }) { Text("Create and Link") }
                }
            }

            // Existing warehouses list
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Existing Warehouses", style = MaterialTheme.typography.titleMedium)
                    warehouses.forEach { w ->
                        WarehouseRow(
                            warehouse = w,
                            allWarehouses = warehouses,
                            onToggleActive = { active ->
                                error = null; message = null
                                scope.launch {
                                    runCatching { root.supabaseProvider.setWarehouseActive(session.token, w.id, active) }
                                        .onSuccess {
                                            message = if (active) "Activated ${w.name}" else "Deactivated ${w.name}"
                                            warehouses = root.supabaseProvider.listWarehouses(session.token)
                                        }
                                        .onFailure { error = it.message }
                                }
                            }
                        ) { newParent ->
                            error = null; message = null
                            scope.launch {
                                runCatching {
                                    root.supabaseProvider.updateWarehouseParent(session.token, w.id, newParent)
                                }.onSuccess {
                                    message = "Updated ${w.name}"
                                    warehouses = root.supabaseProvider.listWarehouses(session.token)
                                }.onFailure { error = it.message }
                            }
                        }
                    }
                }
            }

            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Pack Consumption Report", style = MaterialTheme.typography.titleMedium)
                    Text("Preview pack expansions aggregated by order. Filters optional.")
                    DropdownField(
                        label = "Outlet Filter (optional)",
                        options = listOf(null to "<all outlets>") + outlets.map { it.id to it.name },
                        selectedId = reportOutletId,
                        onSelected = { reportOutletId = it }
                    )
                    DropdownField(
                        label = "Warehouse Filter (optional)",
                        options = listOf(null to "<all warehouses>") + warehouses.map { it.id to it.name },
                        selectedId = reportWarehouseId,
                        onSelected = { reportWarehouseId = it }
                    )
                    OutlinedTextField(
                        value = reportLookbackDays,
                        onValueChange = { txt -> reportLookbackDays = txt.filter { it.isDigit() } },
                        label = { Text("Lookback (days)") },
                        singleLine = true
                    )
                    Button(
                        enabled = !isReportLoading,
                        onClick = {
                            error = null; message = null
                            val jwt = session.token
                            scope.launch {
                                isReportLoading = true
                                runCatching {
                                    val days = reportLookbackDays.toLongOrNull()?.coerceAtLeast(1) ?: 3L
                                    val now = Instant.now()
                                    val toIso = now.toIsoSeconds()
                                    val fromIso = now.minus(days, ChronoUnit.DAYS).toIsoSeconds()
                                    root.supabaseProvider.reportPackConsumption(
                                        jwt = jwt,
                                        fromIso = fromIso,
                                        toIso = toIso,
                                        outletId = reportOutletId,
                                        warehouseId = reportWarehouseId
                                    ).sortedByDescending { it.createdAt }
                                }.onSuccess {
                                    packReportResults = it
                                    message = "Fetched ${it.size} pack rows"
                                }.onFailure { error = it.message }
                                isReportLoading = false
                            }
                        }
                    ) { Text(if (isReportLoading) "Loading…" else "Fetch Report") }
                    if (isReportLoading) {
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    }
                    if (packReportResults.isNotEmpty()) {
                        val preview = packReportResults.take(25)
                        Text("Showing ${preview.size} of ${packReportResults.size} rows", style = MaterialTheme.typography.labelMedium)
                        Divider()
                        preview.forEach { row ->
                            Text("${row.createdAt.take(16)} • ${row.orderNumber} • ${row.packLabel} ${row.packsOrdered.displayQty()} packs (${row.unitsTotal.displayQty()} units) @ ${row.warehouseName}")
                        }
                    }
                }
            }

            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Warehouse Stocktake", style = MaterialTheme.typography.titleMedium)
                    Text("Adjust warehouse stock ledger by recording a counted quantity.")
                    DropdownField(
                        label = "Warehouse",
                        options = warehouses.map { it.id to it.name },
                        selectedId = stocktakeWarehouseId,
                        onSelected = { stocktakeWarehouseId = it }
                    )
                    if (products.isEmpty()) {
                        Text("Loading products…")
                    } else {
                        DropdownField(
                            label = "Product",
                            options = products.map { it.id to "${it.name} (${it.uom})" },
                            selectedId = stocktakeProductId,
                            onSelected = {
                                stocktakeProductId = it
                            }
                        )
                    }
                    if (variations.isNotEmpty()) {
                        DropdownField(
                            label = "Variation (optional)",
                            options = listOf(null to "<base product>") + variations.map { it.id to "${it.name} (${it.uom})" },
                            selectedId = stocktakeVariationId,
                            onSelected = { stocktakeVariationId = it }
                        )
                    }
                    OutlinedTextField(
                        value = stocktakeQty,
                        onValueChange = { stocktakeQty = it.filter { ch -> ch.isDigit() || ch == '.' } },
                        label = { Text("Counted Quantity") },
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = stocktakeNote,
                        onValueChange = { stocktakeNote = it },
                        label = { Text("Note (optional)") }
                    )
                    Button(
                        enabled = !isStocktakeLoading,
                        onClick = {
                            error = null; message = null
                            val jwt = session.token
                            val wid = stocktakeWarehouseId
                            val pid = stocktakeProductId
                            val qty = stocktakeQty.toDoubleOrNull()
                            if (wid.isNullOrEmpty()) { error = "Select a warehouse"; return@Button }
                            if (pid.isNullOrEmpty()) { error = "Select a product"; return@Button }
                            if (qty == null) { error = "Enter counted quantity"; return@Button }
                            scope.launch {
                                isStocktakeLoading = true
                                runCatching {
                                    root.supabaseProvider.recordStocktake(
                                        jwt = jwt,
                                        warehouseId = wid,
                                        productId = pid,
                                        variationId = stocktakeVariationId,
                                        countedQty = qty,
                                        note = stocktakeNote.takeIf { it.isNotBlank() }
                                    )
                                }.onSuccess {
                                    lastStocktake = it
                                    stocktakeQty = ""
                                    message = "Stocktake saved (delta ${it.delta.displayQty()})"
                                }.onFailure { error = it.message }
                                isStocktakeLoading = false
                            }
                        }
                    ) { Text(if (isStocktakeLoading) "Recording…" else "Record Stocktake") }
                    if (isStocktakeLoading) {
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    }
                    lastStocktake?.let {
                        Text("Last adjustment: counted ${it.countedQty.displayQty()} (${it.delta.displayQty()} delta) at ${it.recordedAt}")
                    }
                }
            }
        }
    }
}

@Composable
private fun BackButton(onBack: () -> Unit) {
    OutlinedButton(onClick = onBack) { Text("Back") }
}

@Composable
private fun MissingAuth() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("Please sign in to continue.")
    }
}

@Composable
private fun Unauthorized() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("Not authorized to access this page.", color = MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun DropdownField(
    label: String,
    options: List<Pair<String?, String>>,
    selectedId: String?,
    onSelected: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = options.firstOrNull { it.first == selectedId }?.second ?: "Select"
    Column {
        Text(label)
        OutlinedButton(onClick = { expanded = true }) { Text(selectedLabel) }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (id, name) ->
                DropdownMenuItem(text = { Text(name) }, onClick = {
                    onSelected(id)
                    expanded = false
                })
            }
        }
    }
}

@Composable
private fun WarehouseRow(
    warehouse: SupabaseProvider.Warehouse,
    allWarehouses: List<SupabaseProvider.Warehouse>,
    onToggleActive: (Boolean) -> Unit,
    onChangeParent: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    var parentId by remember { mutableStateOf(warehouse.parentWarehouseId) }
    val parentName = allWarehouses.firstOrNull { it.id == parentId }?.name ?: "<none>"

    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text("${warehouse.name} (${warehouse.id.take(8)}…)  •  ${if (warehouse.active) "Active" else "Inactive"}")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { expanded = true }) { Text("Parent: $parentName") }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                DropdownMenuItem(text = { Text("<none>") }, onClick = {
                    parentId = null; expanded = false; onChangeParent(null)
                })
                allWarehouses.filter { it.id != warehouse.id }.forEach { w ->
                    DropdownMenuItem(text = { Text(w.name) }, onClick = {
                        parentId = w.id; expanded = false; onChangeParent(w.id)
                    })
                }
            }
            val nextActive = !warehouse.active
            OutlinedButton(onClick = { onToggleActive(nextActive) }) { Text(if (nextActive) "Activate" else "Deactivate") }
        }
    }
}

// jwtSub helper removed; admin gating uses session.isAdmin from login

private fun Instant.toIsoSeconds(): String = this.truncatedTo(ChronoUnit.SECONDS).toString()

private fun Double.displayQty(): String =
    if (abs(this % 1.0) < 1e-6) this.toLong().toString() else String.format(Locale.US, "%.2f", this)
