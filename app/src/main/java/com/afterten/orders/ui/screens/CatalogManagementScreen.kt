package com.afterten.orders.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.data.repo.CatalogRepository
import com.afterten.orders.ui.components.AccessDeniedCard
import com.afterten.orders.util.rememberScreenLogger
import kotlinx.coroutines.launch

private val GlowRed = Color(0xFFE53935)
private val JetBlack = Color(0xFF000000)
private val CardBlack = Color(0xFF111111)

private enum class CatalogMode { Product, Variance }

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
    var mode by remember { mutableStateOf(CatalogMode.Product) }

    LaunchedEffect(Unit) { logger.enter(mapOf("hasSession" to (session != null))) }

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
        containerColor = JetBlack,
        topBar = {
            TopAppBar(
                title = { Text("Products & Variances", color = GlowRed) },
                navigationIcon = {
                    IconButton(onClick = {
                        logger.event("BackTapped")
                        onBack()
                    }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = GlowRed) }
                },
                colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(containerColor = JetBlack)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(JetBlack)
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            ModeToggle(mode = mode, onSelect = { mode = it })
            when (mode) {
                CatalogMode.Product -> ProductPane(jwt = session!!.token, repo = repo, loggerTag = "Product", logger = logger)
                CatalogMode.Variance -> VariancePane(jwt = session!!.token, repo = repo, loggerTag = "Variance", logger = logger)
            }
        }
    }
}

@Composable
private fun ModeToggle(mode: CatalogMode, onSelect: (CatalogMode) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        ToggleButton(label = "Products", selected = mode == CatalogMode.Product) { onSelect(CatalogMode.Product) }
        ToggleButton(label = "Variances", selected = mode == CatalogMode.Variance) { onSelect(CatalogMode.Variance) }
    }
}

@Composable
private fun RowScope.ToggleButton(label: String, selected: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.weight(1f),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (selected) GlowRed else CardBlack,
            contentColor = Color.White
        ),
        shape = RoundedCornerShape(50)
    ) { Text(label) }
}

@Composable
private fun ProductPane(jwt: String, repo: CatalogRepository, loggerTag: String, logger: com.afterten.orders.util.ScreenLogger) {
    val scope = rememberCoroutineScope()
    var search by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<CatalogRepository.CatalogItemListRow>>(emptyList()) }
    var listError by remember { mutableStateOf<String?>(null) }
    var loadingList by remember { mutableStateOf(false) }

    var editingId by remember { mutableStateOf<String?>(null) }
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

    fun loadFrom(row: CatalogRepository.CatalogItemListRow) {
        editingId = row.id
        name = row.name
        sku = row.sku ?: ""
        itemKind = row.itemKind
        baseUnit = row.baseUnit
        unitsPerPack = row.unitsPerPurchasePack.toString()
        cost = row.cost.toString()
        purchasePackUnit = row.purchasePackUnit
        transferUnit = row.transferUnit
        transferQty = row.transferQuantity.toString()
        consumptionUom = row.consumptionUom
        outletVisible = row.outletOrderVisible
        defaultWarehouseId = row.defaultWarehouseId ?: ""
        lockedFromWarehouseId = row.lockedFromWarehouseId ?: ""
        success = null
        error = null
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = CardBlack),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(if (editingId == null) "Add Product" else "Update Product", color = GlowRed, style = MaterialTheme.typography.titleMedium)

            SearchBar(
                value = search,
                onValueChange = { search = it },
                onSearch = {
                    loadingList = true; listError = null
                    scope.launch {
                        runCatching { repo.searchCatalogItems(jwt, search) }
                            .onSuccess { results = it }
                            .onFailure { listError = it.message }
                        loadingList = false
                    }
                },
                placeholder = "Search products by name or SKU"
            )
            if (listError != null) Text(listError!!, color = GlowRed)
            if (loadingList) CircularProgressIndicator(color = GlowRed)
            results.take(5).forEach { row ->
                Text(
                    text = "${'$'}{row.name} (${row.sku ?: "no sku"})",
                    color = Color.White,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { loadFrom(row) }
                        .padding(vertical = 4.dp)
                )
            }

            GlowingField(name, { name = it }, "Name", "Product display name (e.g., Cola 500ml)")
            GlowingField(sku, { sku = it }, "SKU", "Optional unique code (e.g., COLA-500)")
            GlowingField(itemKind, { itemKind = it }, "Item Kind", "Enum item_kind (e.g., inventory, service)")
            GlowingField(baseUnit, { baseUnit = it }, "Base Unit", "Unit for consumption (e.g., each)")
            GlowingField(unitsPerPack, { unitsPerPack = it }, "Units per Purchase Pack", "Must be > 0 (e.g., 12)", KeyboardType.Number)
            GlowingField(cost, { cost = it }, "Cost", "Numeric cost; 0 allowed (e.g., 5.50)", KeyboardType.Number)
            GlowingField(purchasePackUnit, { purchasePackUnit = it }, "Purchase Pack Unit", "e.g., each, case")
            GlowingField(transferUnit, { transferUnit = it }, "Transfer Unit", "Unit used for transfers (e.g., each)")
            GlowingField(transferQty, { transferQty = it }, "Transfer Quantity", "Must be > 0 (e.g., 1)", KeyboardType.Number)
            GlowingField(consumptionUom, { consumptionUom = it }, "Consumption UOM", "Display UOM for orders (e.g., each)")
            GlowingField(defaultWarehouseId, { defaultWarehouseId = it }, "Default Warehouse ID", "Optional UUID; leave blank to skip")
            GlowingField(lockedFromWarehouseId, { lockedFromWarehouseId = it }, "Locked From Warehouse ID", "Optional UUID to lock item")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Outlet Order Visible", color = Color.White)
                androidx.compose.material3.Switch(
                    checked = outletVisible,
                    onCheckedChange = { outletVisible = it },
                    colors = androidx.compose.material3.SwitchDefaults.colors(checkedThumbColor = GlowRed)
                )
            }

            if (error != null) Text(error!!, color = GlowRed)
            if (success != null) Text(success!!, color = Color.Green)

            Button(
                onClick = {
                    error = null; success = null
                    val units = unitsPerPack.toDoubleOrNull() ?: run { error = "Units per pack must be numeric"; return@Button }
                    val costVal = cost.toDoubleOrNull() ?: run { error = "Cost must be numeric"; return@Button }
                    val transferVal = transferQty.toDoubleOrNull() ?: run { error = "Transfer quantity must be numeric"; return@Button }
                    loading = true
                    scope.launch {
                        runCatching {
                            val input = CatalogRepository.CatalogItemInput(
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
                            if (editingId == null) {
                                val created = repo.createCatalogItem(jwt, input)
                                success = "Created product ${'$'}{created.name}"
                                logger.state("${'$'}loggerTag.Created", mapOf("id" to created.id))
                            } else {
                                val updated = repo.updateCatalogItem(jwt, editingId!!, input)
                                success = "Updated product ${'$'}{updated.name}"
                                logger.state("${'$'}loggerTag.Updated", mapOf("id" to updated.id))
                            }
                        }.onFailure { t -> error = t.message ?: "Save failed" }
                        loading = false
                    }
                },
                enabled = !loading,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = GlowRed, contentColor = Color.White)
            ) {
                if (loading) CircularProgressIndicator(modifier = Modifier.height(18.dp), color = Color.White) else Text(if (editingId == null) "Add" else "Update")
            }
        }
    }
}

@Composable
private fun VariancePane(jwt: String, repo: CatalogRepository, loggerTag: String, logger: com.afterten.orders.util.ScreenLogger) {
    val scope = rememberCoroutineScope()
    var search by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<CatalogRepository.CatalogVariationListRow>>(emptyList()) }
    var listError by remember { mutableStateOf<String?>(null) }
    var loadingList by remember { mutableStateOf(false) }

    var productSearch by remember { mutableStateOf("") }
    var productMatches by remember { mutableStateOf<List<CatalogRepository.CatalogItemListRow>>(emptyList()) }

    var editingId by remember { mutableStateOf<String?>(null) }
    var productId by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var sku by remember { mutableStateOf("") }
    var unitsPerPack by remember { mutableStateOf("1") }
    var transferQty by remember { mutableStateOf("1") }
    var consumptionUom by remember { mutableStateOf("each") }
    var active by remember { mutableStateOf(true) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }

    fun loadFrom(row: CatalogRepository.CatalogVariationListRow) {
        editingId = row.id
        productId = row.catalogItemId
        name = row.name
        sku = row.sku ?: ""
        unitsPerPack = row.unitsPerPurchasePack.toString()
        transferQty = row.transferQuantity.toString()
        consumptionUom = row.consumptionUom
        active = row.active
        success = null; error = null
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = CardBlack),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(if (editingId == null) "Add Variance" else "Update Variance", color = GlowRed, style = MaterialTheme.typography.titleMedium)

            SearchBar(
                value = search,
                onValueChange = { search = it },
                onSearch = {
                    loadingList = true; listError = null
                    scope.launch {
                        runCatching { repo.searchCatalogVariations(jwt, search) }
                            .onSuccess { results = it }
                            .onFailure { listError = it.message }
                        loadingList = false
                    }
                },
                placeholder = "Search variances by name or SKU"
            )
            if (listError != null) Text(listError!!, color = GlowRed)
            if (loadingList) CircularProgressIndicator(color = GlowRed)
            results.take(5).forEach { row ->
                Text(
                    text = "${'$'}{row.name} (${row.sku ?: "no sku"})",
                    color = Color.White,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { loadFrom(row) }
                        .padding(vertical = 4.dp)
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                GlowingField(
                    value = productSearch,
                    onValueChange = { productSearch = it },
                    label = "Find Product",
                    helper = "Search products to link variance",
                    modifier = Modifier.weight(1f)
                )
                Button(onClick = {
                    scope.launch {
                        runCatching { repo.searchCatalogItems(jwt, productSearch) }
                            .onSuccess { productMatches = it }
                    }
                }, colors = ButtonDefaults.buttonColors(containerColor = GlowRed, contentColor = Color.White)) {
                    Text("Search")
                }
            }
            productMatches.take(5).forEach { p ->
                Text(
                    text = "Link to ${'$'}{p.name}",
                    color = Color.White,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            productId = p.id
                            productSearch = p.name
                        }
                        .padding(vertical = 4.dp)
                )
            }

            GlowingField(productId, { productId = it }, "Product ID", "Required: select or paste catalog item id")
            GlowingField(name, { name = it }, "Variance Name", "Describe variant (e.g., 500ml bottle)")
            GlowingField(sku, { sku = it }, "Variance SKU", "Optional SKU for this variance")
            GlowingField(unitsPerPack, { unitsPerPack = it }, "Units per Purchase Pack", "Must be > 0 (e.g., 6)", KeyboardType.Number)
            GlowingField(transferQty, { transferQty = it }, "Transfer Quantity", "Must be > 0 (e.g., 1)", KeyboardType.Number)
            GlowingField(consumptionUom, { consumptionUom = it }, "Consumption UOM", "Display UOM (e.g., each)")

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Active", color = Color.White)
                androidx.compose.material3.Switch(
                    checked = active,
                    onCheckedChange = { active = it },
                    colors = androidx.compose.material3.SwitchDefaults.colors(checkedThumbColor = GlowRed)
                )
            }

            if (error != null) Text(error!!, color = GlowRed)
            if (success != null) Text(success!!, color = Color.Green)

            Button(
                onClick = {
                    error = null; success = null
                    if (productId.isBlank() || name.isBlank()) {
                        error = "Product ID and name are required"; return@Button
                    }
                    val units = unitsPerPack.toDoubleOrNull() ?: run { error = "Units per pack must be numeric"; return@Button }
                    val transferVal = transferQty.toDoubleOrNull() ?: run { error = "Transfer qty must be numeric"; return@Button }
                    loading = true
                    scope.launch {
                        runCatching {
                            val input = CatalogRepository.CatalogVariationInput(
                                catalogItemId = productId.trim(),
                                name = name.trim(),
                                sku = sku.trim().ifBlank { null },
                                consumptionUom = consumptionUom.trim().ifBlank { "each" },
                                unitsPerPurchasePack = units,
                                transferQuantity = transferVal,
                                active = active
                            )
                            if (editingId == null) {
                                val created = repo.createCatalogVariation(jwt, input)
                                success = "Added variance ${'$'}{created.name}"
                                logger.state("${'$'}loggerTag.Created", mapOf("id" to created.id))
                            } else {
                                val updated = repo.updateCatalogVariation(jwt, editingId!!, input)
                                success = "Updated variance ${'$'}{updated.name}"
                                logger.state("${'$'}loggerTag.Updated", mapOf("id" to updated.id))
                            }
                        }.onFailure { t -> error = t.message ?: "Save failed" }
                        loading = false
                    }
                },
                enabled = !loading,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = GlowRed, contentColor = Color.White)
            ) {
                if (loading) CircularProgressIndicator(modifier = Modifier.height(18.dp), color = Color.White) else Text(if (editingId == null) "Add" else "Update")
            }
        }
    }
}

@Composable
private fun SearchBar(value: String, onValueChange: (String) -> Unit, onSearch: () -> Unit, placeholder: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        GlowingField(
            value = value,
            onValueChange = onValueChange,
            label = placeholder,
            helper = "Type to search",
            modifier = Modifier.weight(1f)
        )
        Button(onClick = onSearch, colors = ButtonDefaults.buttonColors(containerColor = GlowRed, contentColor = Color.White)) { Text("Search") }
    }
}

@Composable
private fun GlowingField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    helper: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    modifier: Modifier = Modifier
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label, color = GlowRed) },
            modifier = Modifier
                .fillMaxWidth()
                .background(JetBlack)
                .border(width = 2.dp, color = GlowRed, shape = RoundedCornerShape(10.dp)),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = JetBlack,
                unfocusedContainerColor = JetBlack,
                disabledContainerColor = JetBlack,
                focusedBorderColor = GlowRed,
                unfocusedBorderColor = GlowRed,
                cursorColor = GlowRed,
                focusedLabelColor = GlowRed,
                unfocusedLabelColor = GlowRed
            )
        )
        Text(helper, style = MaterialTheme.typography.bodySmall, color = GlowRed)
    }
}
