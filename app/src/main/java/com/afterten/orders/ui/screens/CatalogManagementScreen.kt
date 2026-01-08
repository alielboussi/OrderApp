package com.afterten.orders.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.data.repo.CatalogRepository
import com.afterten.orders.ui.components.AccessDeniedCard
import com.afterten.orders.util.rememberScreenLogger
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogManagementScreen(
    root: RootViewModel,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val canAccess = session.hasRole(RoleGuards.Backoffice)
    val logger = rememberScreenLogger("CatalogManagement")
    val repo = remember { CatalogRepository(root.supabaseProvider) }
    val scope = rememberCoroutineScope()
    var catalogItems by remember { mutableStateOf<List<CatalogRepository.CatalogItemListRow>>(emptyList()) }
    var listError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { logger.enter(mapOf("hasSession" to (session != null))) }
    LaunchedEffect(session?.token) {
        val s = session ?: return@LaunchedEffect
        listError = null
        runCatching { repo.listCatalogItems(jwt = s.token) }
            .onSuccess { catalogItems = it }
            .onFailure { listError = it.message }
    }

    if (!canAccess || session == null) {
        AccessDeniedCard(
            title = "Backoffice access required",
            message = "Only Backoffice users can manage catalog items.",
            primaryLabel = "Back",
            onPrimary = onBack
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Products & Variances") },
                navigationIcon = {
                    IconButton(onClick = {
                        logger.event("BackTapped")
                        onBack()
                    }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            ProductCard(repo = repo, jwt = session!!.token, loggerTag = "Product", onSuccess = { logger.event("ProductCreated", mapOf("id" to it)) })
            VariationCard(
                repo = repo,
                jwt = session!!.token,
                loggerTag = "Variation",
                products = catalogItems,
                listError = listError,
                onSuccess = { logger.event("VariationCreated", mapOf("id" to it)) }
            )
        }
    }
}

@Composable
private fun ProductCard(repo: CatalogRepository, jwt: String, loggerTag: String, onSuccess: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var sku by remember { mutableStateOf("") }
    var itemKind by remember { mutableStateOf("inventory") }
    var baseUnit by remember { mutableStateOf("each") }
    var unitsPerPack by remember { mutableStateOf("1") }
    var cost by remember { mutableStateOf("0") }
    var purchasePackUnit by remember { mutableStateOf("each") }
    var transferUnit by remember { mutableStateOf("each") }
    var transferQty by remember { mutableStateOf("1") }
    var consumptionUom by remember { mutableStateOf("each") }
    var outletVisible by remember { mutableStateOf(true) }
    var defaultWarehouseId by remember { mutableStateOf("") }
    var lockedFromWarehouseId by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Card(elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Add Product", style = MaterialTheme.typography.titleMedium)
            LabeledField(value = name, onValueChange = { name = it }, label = "Name", helper = "Product display name (required)")
            LabeledField(value = sku, onValueChange = { sku = it }, label = "SKU", helper = "Optional SKU; must be unique if provided")
            LabeledField(value = itemKind, onValueChange = { itemKind = it }, label = "Item Kind", helper = "Matches enum item_kind (e.g., inventory, service)")
            LabeledField(value = baseUnit, onValueChange = { baseUnit = it }, label = "Base Unit", helper = "Unit for consumption (default each)")
            LabeledField(value = unitsPerPack, onValueChange = { unitsPerPack = it }, label = "Units per Purchase Pack", helper = "Must be > 0", keyboardType = KeyboardType.Number)
            LabeledField(value = cost, onValueChange = { cost = it }, label = "Cost", helper = "Numeric cost; 0 allowed", keyboardType = KeyboardType.Number)
            LabeledField(value = purchasePackUnit, onValueChange = { purchasePackUnit = it }, label = "Purchase Pack Unit", helper = "e.g., each, case")
            LabeledField(value = transferUnit, onValueChange = { transferUnit = it }, label = "Transfer Unit", helper = "Unit used when transferring between warehouses")
            LabeledField(value = transferQty, onValueChange = { transferQty = it }, label = "Transfer Quantity", helper = "Must be > 0", keyboardType = KeyboardType.Number)
            LabeledField(value = consumptionUom, onValueChange = { consumptionUom = it }, label = "Consumption UOM", helper = "Display UOM for orders (default each)")
            LabeledField(value = defaultWarehouseId, onValueChange = { defaultWarehouseId = it }, label = "Default Warehouse ID", helper = "Optional UUID; leave blank to skip")
            LabeledField(value = lockedFromWarehouseId, onValueChange = { lockedFromWarehouseId = it }, label = "Locked From Warehouse ID", helper = "Optional UUID to lock item from a warehouse")
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Switch(checked = outletVisible, onCheckedChange = { outletVisible = it })
                Text("Outlet Order Visible")
            }
            if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
            if (success != null) Text(success!!, color = MaterialTheme.colorScheme.primary)
            Button(
                onClick = {
                    error = null; success = null
                    if (name.isBlank() || itemKind.isBlank()) {
                        error = "Name and item kind are required"; return@Button
                    }
                    val units = unitsPerPack.toDoubleOrNull() ?: run { error = "Units per pack must be numeric"; return@Button }
                    val costVal = cost.toDoubleOrNull() ?: run { error = "Cost must be numeric"; return@Button }
                    val transferVal = transferQty.toDoubleOrNull() ?: run { error = "Transfer quantity must be numeric"; return@Button }
                    loading = true
                    scope.launch {
                        runCatching {
                            val created = repo.createCatalogItem(
                                jwt = jwt,
                                input = CatalogRepository.CatalogItemInput(
                                    name = name.trim(),
                                    sku = sku.trim().ifBlank { null },
                                    itemKind = itemKind.trim(),
                                    baseUnit = baseUnit.trim().ifBlank { "each" },
                                    unitsPerPurchasePack = units,
                                    active = true,
                                    consumptionUom = consumptionUom.trim().ifBlank { "each" },
                                    cost = costVal,
                                    hasVariations = false,
                                    imageUrl = null,
                                    defaultWarehouseId = defaultWarehouseId.trim().ifBlank { null },
                                    purchasePackUnit = purchasePackUnit.trim().ifBlank { "each" },
                                    purchaseUnitMass = null,
                                    purchaseUnitMassUom = null,
                                    transferUnit = transferUnit.trim().ifBlank { "each" },
                                    transferQuantity = transferVal,
                                    outletOrderVisible = outletVisible,
                                    lockedFromWarehouseId = lockedFromWarehouseId.trim().ifBlank { null }
                                )
                            )
                            success = "Created product ${'$'}{created.name}"
                            onSuccess(created.id)
                        }.onFailure { t -> error = t.message ?: "Insert failed" }
                        loading = false
                    }
                },
                enabled = !loading,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (loading) CircularProgressIndicator(modifier = Modifier.height(18.dp)) else Text("Add Product")
            }
        }
    }
}

@Composable
private fun VariationCard(
    repo: CatalogRepository,
    jwt: String,
    loggerTag: String,
    products: List<CatalogRepository.CatalogItemListRow>,
    listError: String?,
    onSuccess: (String) -> Unit
) {
    var productId by remember { mutableStateOf("") }
    var productDropdown by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var sku by remember { mutableStateOf("") }
    var unitsPerPack by remember { mutableStateOf("1") }
    var transferQty by remember { mutableStateOf("1") }
    var consumptionUom by remember { mutableStateOf("each") }
    var active by remember { mutableStateOf(true) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Card(elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Add Variance", style = MaterialTheme.typography.titleMedium)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Box {
                    OutlinedTextField(
                        value = productId,
                        onValueChange = { productId = it },
                        label = { Text("Product ID") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        trailingIcon = {
                            IconButton(onClick = { productDropdown = true }) {
                                Icon(Icons.Filled.ArrowDropDown, contentDescription = "Select product")
                            }
                        }
                    )
                    DropdownMenu(expanded = productDropdown, onDismissRequest = { productDropdown = false }) {
                        products.forEach { item ->
                            DropdownMenuItem(
                                text = { Text(item.name) },
                                onClick = {
                                    productId = item.id
                                    productDropdown = false
                                }
                            )
                        }
                    }
                }
                Text("Pick a product then add its variance", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (listError != null) Text(listError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            LabeledField(value = name, onValueChange = { name = it }, label = "Variance Name", helper = "Describes the specific variant (e.g., 500ml bottle)")
            LabeledField(value = sku, onValueChange = { sku = it }, label = "Variance SKU", helper = "Optional SKU for this variance")
            LabeledField(value = unitsPerPack, onValueChange = { unitsPerPack = it }, label = "Units per Purchase Pack", helper = "Must be > 0", keyboardType = KeyboardType.Number)
            LabeledField(value = transferQty, onValueChange = { transferQty = it }, label = "Transfer Quantity", helper = "Must be > 0", keyboardType = KeyboardType.Number)
            LabeledField(value = consumptionUom, onValueChange = { consumptionUom = it }, label = "Consumption UOM", helper = "Display UOM for this variance")
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Switch(checked = active, onCheckedChange = { active = it })
                Text("Active")
            }
            if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
            if (success != null) Text(success!!, color = MaterialTheme.colorScheme.primary)
            Button(
                onClick = {
                    error = null; success = null
                    if (productId.isBlank() || name.isBlank()) {
                        error = "Product ID and variance name are required"; return@Button
                    }
                    val units = unitsPerPack.toDoubleOrNull() ?: run { error = "Units per pack must be numeric"; return@Button }
                    val transferVal = transferQty.toDoubleOrNull() ?: run { error = "Transfer quantity must be numeric"; return@Button }
                    loading = true
                    scope.launch {
                        runCatching {
                            val created = repo.createCatalogVariation(
                                jwt = jwt,
                                input = CatalogRepository.CatalogVariationInput(
                                    catalogItemId = productId.trim(),
                                    name = name.trim(),
                                    sku = sku.trim().ifBlank { null },
                                    consumptionUom = consumptionUom.trim().ifBlank { "each" },
                                    unitsPerPurchasePack = units,
                                    transferQuantity = transferVal,
                                    active = active
                                )
                            )
                            success = "Added variance ${'$'}{created.name}"
                            onSuccess(created.id)
                        }.onFailure { t -> error = t.message ?: "Insert failed" }
                        loading = false
                    }
                },
                enabled = !loading,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (loading) CircularProgressIndicator(modifier = Modifier.height(18.dp)) else Text("Add Variance")
            }
        }
    }
}

@Composable
private fun LabeledField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    helper: String,
    keyboardType: KeyboardType = KeyboardType.Text
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType)
        )
        Text(helper, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
