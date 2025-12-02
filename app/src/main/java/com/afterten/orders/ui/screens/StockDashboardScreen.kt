package com.afterten.orders.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.SupabaseProvider
import com.afterten.orders.util.rememberScreenLogger
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlin.math.abs
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockDashboardScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onOpenLog: () -> Unit,
    embedded: Boolean = false
) {
    val session by root.session.collectAsState()
    val scope = rememberCoroutineScope()
    val logger = rememberScreenLogger("StockDashboard")

    LaunchedEffect(Unit) { logger.enter() }

    if (session == null) {
        logger.warn("MissingSession")
        MissingAuth()
        return
    }
    if (!session.hasRole(RoleGuards.WarehouseAdmin)) {
        logger.warn("UnauthorizedAccess")
        Unauthorized()
        return
    }

    var warehouses by remember { mutableStateOf(emptyList<SupabaseProvider.Warehouse>()) }
    var products by remember { mutableStateOf(emptyList<SupabaseProvider.SimpleProduct>()) }
    var allVariations by remember { mutableStateOf(emptyList<SupabaseProvider.SimpleVariation>()) }

    var selectedWarehouseId by remember { mutableStateOf<String?>(null) }
    var searchText by remember { mutableStateOf("") }
    var appliedSearch by remember { mutableStateOf("") }
    var refreshTick by remember { mutableStateOf(0) }

    var injectProductId by remember { mutableStateOf<String?>(null) }
    var injectVariationId by remember { mutableStateOf<String?>(null) }
    var injectQty by remember { mutableStateOf("") }
    var injectNote by remember { mutableStateOf("") }
    var injectMessage by remember { mutableStateOf<String?>(null) }
    var injectError by remember { mutableStateOf<String?>(null) }
    var isInjecting by remember { mutableStateOf(false) }
    var barcodeInput by remember { mutableStateOf("") }

    var stockData by remember { mutableStateOf<SupabaseProvider.WarehouseStockResponse?>(null) }
    var stockError by remember { mutableStateOf<String?>(null) }
    var isStockLoading by remember { mutableStateOf(false) }

    val productCards = remember(stockData) { buildProductCards(stockData) }
    val selectedProduct = remember(products, injectProductId) { products.firstOrNull { it.id == injectProductId } }
    val selectedVariation = remember(allVariations, injectVariationId) {
        allVariations.firstOrNull { it.id == injectVariationId }
    }
    val qtyFocusRequester = remember { FocusRequester() }

    LaunchedEffect(session?.token) {
        val jwt = session?.token ?: return@LaunchedEffect
        logger.state("BootstrapStart")
        runCatching {
            val warehouseList = root.supabaseProvider.listWarehouses(jwt)
            val productList = root.supabaseProvider.listActiveProducts(jwt)
            val variationList = root.supabaseProvider.listAllVariations(jwt)
            warehouses = warehouseList
            products = productList
            allVariations = variationList
            if (selectedWarehouseId == null) {
                selectedWarehouseId = warehouseList.firstOrNull()?.id
            }
            logger.state(
                "BootstrapSuccess",
                mapOf(
                    "warehouses" to warehouseList.size,
                    "products" to productList.size,
                    "variations" to variationList.size
                )
            )
        }.onFailure {
            stockError = it.message
            logger.error("BootstrapFailed", it)
        }
    }

    LaunchedEffect(selectedWarehouseId, appliedSearch, refreshTick, session?.token) {
        val jwt = session?.token ?: return@LaunchedEffect
        val warehouseId = selectedWarehouseId ?: return@LaunchedEffect
        isStockLoading = true
        stockError = null
        logger.state(
            "StockQueryStart",
            mapOf("warehouseId" to warehouseId, "search" to appliedSearch.takeIf { it.isNotBlank() })
        )
        runCatching {
            root.supabaseProvider.fetchWarehouseStock(jwt, warehouseId, appliedSearch.takeIf { it.isNotBlank() })
        }.onSuccess {
            stockData = it
            logger.state("StockQuerySuccess", mapOf("rows" to it.rows.size))
        }
            .onFailure {
                stockError = it.message
                logger.error("StockQueryFailed", it, mapOf("warehouseId" to warehouseId))
            }
        isStockLoading = false
    }

    fun submitStockEntry(kind: SupabaseProvider.StockEntryKind) {
        logger.event("StockEntrySubmitTapped", mapOf("kind" to kind.name))
        val jwt = session?.token ?: return
        val wid = selectedWarehouseId ?: run {
            injectError = "Select a warehouse"
            logger.warn("StockEntryValidation", mapOf("reason" to "missing_warehouse"))
            return
        }
        val pid = injectProductId ?: run {
            injectError = "Scan a product or variation barcode"
            logger.warn("StockEntryValidation", mapOf("reason" to "missing_selection"))
            return
        }
        val qtyDouble = injectQty.toDoubleOrNull()
        if (qtyDouble == null || qtyDouble <= 0) {
            injectError = "Enter a positive quantity"
            logger.warn("StockEntryValidation", mapOf("reason" to "invalid_qty", "input" to injectQty))
            return
        }
        val needsVariation = products.firstOrNull { it.id == pid }?.hasVariations == true
        if (needsVariation && injectVariationId.isNullOrBlank()) {
            injectError = "Scan the correct variation barcode"
            logger.warn("StockEntryValidation", mapOf("reason" to "missing_variation"))
            return
        }
        scope.launch {
            isInjecting = true
            injectError = null
            logger.state(
                "StockEntrySubmitStart",
                mapOf(
                    "kind" to kind.name,
                    "warehouseId" to wid,
                    "productId" to pid,
                    "variationId" to injectVariationId
                )
            )
            runCatching {
                root.supabaseProvider.recordStockEntry(
                    jwt = jwt,
                    warehouseId = wid,
                    productId = pid,
                    variationId = injectVariationId,
                    entryKind = kind,
                    units = qtyDouble,
                    note = injectNote.takeIf { it.isNotBlank() }
                )
            }.onSuccess {
                injectMessage = "${kind.label} recorded for ${qtyDouble.displayQty()} units"
                injectQty = ""
                injectNote = ""
                barcodeInput = ""
                refreshTick++
                logger.state("StockEntrySubmitSuccess")
            }.onFailure {
                injectError = it.message
                logger.error("StockEntrySubmitFailed", it)
            }
            isInjecting = false
        }
    }

    val currentQty = remember(stockData, selectedWarehouseId, injectProductId, injectVariationId) {
        val wid = selectedWarehouseId
        val pid = injectProductId
        if (wid == null || pid == null) 0.0 else {
            stockData?.rows
                ?.filter { row ->
                    row.warehouseId == wid &&
                        row.productId == pid &&
                        ((injectVariationId == null && row.variationId == null) || row.variationId == injectVariationId)
                }
                ?.sumOf { it.qty } ?: 0.0
        }
    }

    fun matchSku(value: String?, code: String): Boolean {
        if (value.isNullOrBlank()) return false
        return value.trim().equals(code, ignoreCase = true)
    }

    fun handleBarcodeMatch(raw: String) {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return
        val normalized = trimmed.lowercase()
        val variationHit = allVariations.firstOrNull { variation ->
            matchSku(variation.sku, normalized) || variation.id.equals(trimmed, ignoreCase = true)
        }
        if (variationHit != null) {
            injectProductId = variationHit.productId
            injectVariationId = variationHit.id
            injectMessage = "Selected ${variationHit.name} via scan"
            injectError = null
            injectQty = ""
            scope.launch {
                delay(50)
                qtyFocusRequester.requestFocus()
            }
            return
        }

        val productHit = products.firstOrNull { product ->
            matchSku(product.sku, normalized) || product.id.equals(trimmed, ignoreCase = true)
        }
        if (productHit != null) {
            injectProductId = productHit.id
            injectVariationId = null
            injectMessage = "Selected ${productHit.name} via scan"
            injectQty = ""
            injectError = if (productHit.hasVariations) {
                "Scan a variation barcode for ${productHit.name}"
            } else null
            scope.launch {
                delay(50)
                qtyFocusRequester.requestFocus()
            }
            return
        }

        injectMessage = null
        injectError = "No product or variation matched '$trimmed'"
    }

    fun onBarcodeValueChange(input: String) {
        var remaining = input.replace("\r", "")
        while (true) {
            val newlineIndex = remaining.indexOf('\n')
            if (newlineIndex < 0) break
            val token = remaining.substring(0, newlineIndex)
            handleBarcodeMatch(token)
            remaining = if (newlineIndex + 1 < remaining.length) {
                remaining.substring(newlineIndex + 1)
            } else {
                ""
            }
        }
        barcodeInput = remaining
    }

    fun commitBarcodeInput() {
        if (barcodeInput.isBlank()) return
        val payload = barcodeInput
        barcodeInput = ""
        handleBarcodeMatch(payload)
    }

    val content: @Composable ColumnScope.() -> Unit = {
        FilterCard(
            warehouses = warehouses,
            selectedWarehouseId = selectedWarehouseId,
            onWarehouseSelected = { id ->
                selectedWarehouseId = id
                injectMessage = null
                logger.state("WarehouseSelected", mapOf("warehouseId" to id))
            },
            searchText = searchText,
            onSearchChanged = { searchText = it },
            onApplySearch = {
                logger.event("StockSearchApplied", mapOf("query" to searchText))
                appliedSearch = searchText.trim()
            },
            onRefresh = {
                logger.event("StockRefreshTriggered")
                refreshTick++
            },
            warehouseCount = stockData?.warehouseCount ?: 0
        )
        val selectedWarehouseName = warehouses.firstOrNull { it.id == selectedWarehouseId }?.name
        InjectionCard(
            barcodeValue = barcodeInput,
            onBarcodeChange = ::onBarcodeValueChange,
            onBarcodeSubmit = ::commitBarcodeInput,
            selectedProduct = selectedProduct,
            selectedVariation = selectedVariation,
            onClearSelection = {
                injectProductId = null
                injectVariationId = null
                injectMessage = null
                injectError = null
                logger.event("InjectionSelectionCleared")
            },
            qtyText = injectQty,
            onQtyChanged = { injectQty = it.filter { ch -> ch.isDigit() || ch == '.' } },
            noteText = injectNote,
            onNoteChanged = { injectNote = it },
            requiresVariation = selectedProduct?.hasVariations == true,
            onSubmit = ::submitStockEntry,
            isSubmitting = isInjecting,
            helperMessage = injectMessage,
            errorMessage = injectError,
            currentQty = currentQty,
            warehouseLabel = selectedWarehouseName,
            qtyFocusRequester = qtyFocusRequester
        )
        StockSummary(isLoading = isStockLoading, error = stockError, hasRows = productCards.isNotEmpty())
        productCards.forEach { ProductCard(it) }
    }

    if (embedded) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            content()
        }
    } else {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Stock Dashboard") },
                    navigationIcon = {
                        TextButton(onClick = {
                            logger.event("BackTapped")
                            onBack()
                        }) { Text("Back") }
                    },
                    actions = {
                        TextButton(onClick = {
                            logger.event("OpenLogTapped")
                            onOpenLog()
                        }) { Text("Injection Log") }
                    }
                )
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                content()
            }
        }
    }
}

@Composable
private fun StockSummary(isLoading: Boolean, error: String?, hasRows: Boolean) {
    when {
        isLoading -> {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center
            ) {
                CircularProgressIndicator(modifier = Modifier.size(32.dp))
            }
        }
        error != null -> Text(text = error, color = MaterialTheme.colorScheme.error)
        !hasRows -> Text("No stock rows for the selected warehouse", style = MaterialTheme.typography.bodyMedium)
    }
}

private fun buildProductCards(stockData: SupabaseProvider.WarehouseStockResponse?): List<ProductStockUi> {
    val aggregates = stockData?.aggregates.orEmpty()
    if (aggregates.isEmpty()) return emptyList()
    return aggregates
        .groupBy { it.productId }
        .map { (_, rows) ->
            val first = rows.first()
            ProductStockUi(
                productId = first.productId,
                productName = first.productName,
                totalQty = rows.sumOf { it.totalQty },
                hasVariations = rows.any { it.variationId != null },
                variations = rows.map {
                    VariationStockUi(
                        variationId = it.variationId,
                        variationName = it.variationName,
                        totalQty = it.totalQty,
                        warehouses = it.warehouses
                    )
                }
            )
        }
        .sortedBy { it.productName }
}

private data class ProductStockUi(
    val productId: String,
    val productName: String,
    val totalQty: Double,
    val hasVariations: Boolean,
    val variations: List<VariationStockUi>
)

private data class VariationStockUi(
    val variationId: String?,
    val variationName: String?,
    val totalQty: Double,
    val warehouses: List<SupabaseProvider.WarehouseStockAggregateWarehouse>
)

@Composable
private fun FilterCard(
    warehouses: List<SupabaseProvider.Warehouse>,
    selectedWarehouseId: String?,
    onWarehouseSelected: (String) -> Unit,
    searchText: String,
    onSearchChanged: (String) -> Unit,
    onApplySearch: () -> Unit,
    onRefresh: () -> Unit,
    warehouseCount: Int
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Filters", style = MaterialTheme.typography.titleMedium)
            SelectorField(
                label = "Warehouse",
                options = warehouses.map { it.id to it.name },
                selectedId = selectedWarehouseId,
                onSelected = { id -> id?.let(onWarehouseSelected) }
            )
            Text("Descendants included: $warehouseCount")
            OutlinedTextField(
                value = searchText,
                onValueChange = onSearchChanged,
                label = { Text("Search products or variations") },
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onApplySearch) { Text("Apply Search") }
                OutlinedButton(onClick = onRefresh) { Text("Refresh") }
            }
        }
    }
}

@Composable
private fun InjectionCard(
    barcodeValue: String,
    onBarcodeChange: (String) -> Unit,
    onBarcodeSubmit: () -> Unit,
    selectedProduct: SupabaseProvider.SimpleProduct?,
    selectedVariation: SupabaseProvider.SimpleVariation?,
    onClearSelection: () -> Unit,
    qtyText: String,
    onQtyChanged: (String) -> Unit,
    noteText: String,
    onNoteChanged: (String) -> Unit,
    requiresVariation: Boolean,
    onSubmit: (SupabaseProvider.StockEntryKind) -> Unit,
    isSubmitting: Boolean,
    helperMessage: String?,
    errorMessage: String?,
    currentQty: Double,
    warehouseLabel: String?,
    qtyFocusRequester: FocusRequester
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Stock Injection", style = MaterialTheme.typography.titleMedium)
            warehouseLabel?.let {
                Text("Target Warehouse: $it", style = MaterialTheme.typography.bodySmall)
            }
            OutlinedTextField(
                value = barcodeValue,
                onValueChange = onBarcodeChange,
                label = { Text("Scan or type barcode") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions.Default.copy(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onBarcodeSubmit() })
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(onClick = onBarcodeSubmit, enabled = barcodeValue.isNotBlank()) {
                    Text("Lookup")
                }
                OutlinedButton(onClick = onClearSelection, enabled = selectedProduct != null) {
                    Text("Clear selection")
                }
            }
            if (selectedProduct != null) {
                Text(
                    text = buildString {
                        append(selectedProduct.name)
                        selectedVariation?.let { variation ->
                            append(" – ")
                            append(variation.name)
                        }
                        val skuLabel = selectedVariation?.sku?.takeIf { it.isNotBlank() }
                            ?: selectedProduct.sku?.takeIf { it.isNotBlank() }
                        skuLabel?.let { sku ->
                            append(" (SKU: $sku)")
                        }
                    },
                    style = MaterialTheme.typography.bodyMedium
                )
            } else {
                Text(
                    "Scan a product or variation barcode to begin",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            if (requiresVariation && selectedVariation == null) {
                Text(
                    "This product requires a variation scan before recording stock.",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }
            OutlinedTextField(
                value = qtyText,
                onValueChange = onQtyChanged,
                label = { Text("Quantity to add") },
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(qtyFocusRequester),
                singleLine = true
            )
            Text(
                text = "Choose the type of stock entry. Initial and closing set an absolute count; purchase adds units.",
                style = MaterialTheme.typography.bodySmall
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = { onSubmit(SupabaseProvider.StockEntryKind.INITIAL) },
                    enabled = !isSubmitting && selectedProduct != null
                ) { Text("Save Initial") }
                Button(
                    onClick = { onSubmit(SupabaseProvider.StockEntryKind.PURCHASE) },
                    enabled = !isSubmitting && selectedProduct != null
                ) { Text("Save Purchase") }
                Button(
                    onClick = { onSubmit(SupabaseProvider.StockEntryKind.CLOSING) },
                    enabled = !isSubmitting && selectedProduct != null
                ) { Text("Save Closing") }
            }
            OutlinedTextField(
                value = noteText,
                onValueChange = onNoteChanged,
                label = { Text("Note (optional)") },
                modifier = Modifier.fillMaxWidth()
            )
            Text(
                text = "Current Qty: ${currentQty.displayQty()} ${selectedProduct?.uom.orEmpty()}",
                style = MaterialTheme.typography.bodySmall
            )
            if (!errorMessage.isNullOrEmpty()) {
                Text(errorMessage ?: "", color = MaterialTheme.colorScheme.error)
            } else if (!helperMessage.isNullOrEmpty()) {
                Text(helperMessage ?: "", color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun SelectorField(
    label: String,
    options: List<Pair<String?, String>>,
    selectedId: String?,
    onSelected: (String?) -> Unit,
    enabled: Boolean = true
) {
    var expanded by remember { mutableStateOf(false) }
    val currentLabel = options.firstOrNull { it.first == selectedId }?.second ?: "Select"
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        OutlinedButton(onClick = { expanded = true }, enabled = enabled) {
            Text(currentLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (id, name) ->
                DropdownMenuItem(
                    text = { Text(name) },
                    onClick = {
                        expanded = false
                        onSelected(id)
                    }
                )
            }
        }
    }
}

@Composable
private fun ProductCard(product: ProductStockUi) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(product.productName, style = MaterialTheme.typography.titleMedium)
            Text("Total Qty: ${product.totalQty.displayQty()}")
            product.variations.forEach { variation ->
                val label = variation.variationName ?: "Base product"
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("• $label: ${variation.totalQty.displayQty()}")
                    if (variation.warehouses.isNotEmpty()) {
                        Text(
                            variation.warehouses.joinToString { "${it.warehouseName}: ${it.qty.displayQty()}" },
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
        }
    }
}

private fun Double.displayQty(): String =
    if (abs(this % 1.0) < 1e-6) this.toLong().toString() else String.format(java.util.Locale.US, "%.2f", this)

@Composable
private fun MissingAuth() {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Text("Please sign in to continue.")
    }
}

@Composable
private fun Unauthorized() {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Text("Warehouse admin role required", color = MaterialTheme.colorScheme.error)
    }
}
