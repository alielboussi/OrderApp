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

    var selectedOutletId by remember { mutableStateOf<String?>(null) }
    var selectedParentId by remember { mutableStateOf<String?>(null) }
    var newWarehouseName by remember { mutableStateOf("") }
    var adminPassword by remember { mutableStateOf("") }

    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(session?.token) {
        val isAdmin = session?.isAdmin == true
        if (session?.token != null && isAdmin) {
            runCatching {
                outlets = root.supabaseProvider.listOutlets(session.token)
                warehouses = root.supabaseProvider.listWarehouses(session.token)
            }.onFailure { error = it.message }
        }
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
