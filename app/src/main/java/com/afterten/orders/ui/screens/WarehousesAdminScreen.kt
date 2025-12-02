package com.afterten.orders.ui.screens

import androidx.compose.runtime.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.foundation.ExperimentalFoundationApi
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.SupabaseProvider
import com.afterten.orders.util.rememberScreenLogger
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard

@Composable
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
fun WarehousesAdminScreen(
    root: RootViewModel,
    allowedAdminUuid: String = "d86e2ce6-13a3-4bd9-a174-9f18f6f8a035",
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    val session = root.session.collectAsState().value
    val scope = rememberCoroutineScope()
    val logger = rememberScreenLogger("WarehousesAdmin")

    LaunchedEffect(Unit) {
        logger.enter(mapOf("hasWarehouseAdminRole" to session.hasRole(RoleGuards.WarehouseAdmin)))
    }

    if (!session.hasRole(RoleGuards.WarehouseAdmin)) {
        AccessDeniedCard(
            title = "Warehouse admin role required",
            message = "Only authorized warehouse admins can manage stock, outlets, and warehouse settings.",
            primaryLabel = "Back",
            onPrimary = onBack,
            secondaryLabel = "Log out",
            onSecondary = onLogout
        )
        return
    }

    var outlets by remember { mutableStateOf<List<SupabaseProvider.Outlet>>(emptyList()) }
    var warehouses by remember { mutableStateOf<List<SupabaseProvider.Warehouse>>(emptyList()) }
    var products by remember { mutableStateOf<List<SupabaseProvider.SimpleProduct>>(emptyList()) }
    var warehouseVariations by remember { mutableStateOf<List<SupabaseProvider.SimpleVariation>>(emptyList()) }
    var posVariations by remember { mutableStateOf<List<SupabaseProvider.SimpleVariation>>(emptyList()) }
    var outletStocktakeVariations by remember { mutableStateOf<List<SupabaseProvider.SimpleVariation>>(emptyList()) }

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

    var posOutletId by remember { mutableStateOf<String?>(null) }
    var posProductId by remember { mutableStateOf<String?>(null) }
    var posVariationId by remember { mutableStateOf<String?>(null) }
    var posQty by remember { mutableStateOf("") }
    var posQtyMode by remember { mutableStateOf("auto") }
    var posReference by remember { mutableStateOf("") }
    var posSource by remember { mutableStateOf("POS") }
    var isPosSubmitting by remember { mutableStateOf(false) }

    var stockPeriodOutletId by remember { mutableStateOf<String?>(null) }
    var outletPeriods by remember { mutableStateOf<List<SupabaseProvider.OutletStockPeriod>>(emptyList()) }
    var isPeriodLoading by remember { mutableStateOf(false) }
    var isStartPeriodLoading by remember { mutableStateOf(false) }
    var isClosePeriodLoading by remember { mutableStateOf(false) }
    var outletStocktakePeriodId by remember { mutableStateOf<String?>(null) }
    var outletStocktakeProductId by remember { mutableStateOf<String?>(null) }
    var outletStocktakeVariationId by remember { mutableStateOf<String?>(null) }
    var outletStocktakeQty by remember { mutableStateOf("") }
    var outletStocktakeMode by remember { mutableStateOf("auto") }
    var outletStocktakeKind by remember { mutableStateOf("spot") }
    var outletStocktakeNote by remember { mutableStateOf("") }
    var isOutletStocktakeLoading by remember { mutableStateOf(false) }

    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val logBringIntoViewRequester = remember { BringIntoViewRequester() }

    LaunchedEffect(session?.token) {
        val isAdmin = session.hasRole(RoleGuards.WarehouseAdmin)
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
        val isAdmin = session.hasRole(RoleGuards.WarehouseAdmin)
        if (stocktakeProductId.isNullOrBlank() || jwt == null || !isAdmin) {
            warehouseVariations = emptyList()
            stocktakeVariationId = null
            return@LaunchedEffect
        }
        runCatching {
            root.supabaseProvider.listVariationsForProduct(jwt, stocktakeProductId!!)
        }.onSuccess {
            warehouseVariations = it
            stocktakeVariationId = null
        }.onFailure { error = it.message }
    }

    LaunchedEffect(posProductId, session?.token) {
        val jwt = session?.token
        val isAdmin = session.hasRole(RoleGuards.WarehouseAdmin)
        if (posProductId.isNullOrBlank() || jwt == null || !isAdmin) {
            posVariations = emptyList()
            posVariationId = null
            return@LaunchedEffect
        }
        runCatching {
            root.supabaseProvider.listVariationsForProduct(jwt, posProductId!!)
        }.onSuccess { list ->
            posVariations = list
            if (list.none { it.id == posVariationId }) posVariationId = null
        }.onFailure { error = it.message }
    }

    LaunchedEffect(outletStocktakeProductId, session?.token) {
        val jwt = session?.token
        val isAdmin = session.hasRole(RoleGuards.WarehouseAdmin)
        if (outletStocktakeProductId.isNullOrBlank() || jwt == null || !isAdmin) {
            outletStocktakeVariations = emptyList()
            outletStocktakeVariationId = null
            return@LaunchedEffect
        }
        runCatching {
            root.supabaseProvider.listVariationsForProduct(jwt, outletStocktakeProductId!!)
        }.onSuccess { list ->
            outletStocktakeVariations = list
            if (list.none { it.id == outletStocktakeVariationId }) outletStocktakeVariationId = null
        }.onFailure { error = it.message }
    }

    LaunchedEffect(stockPeriodOutletId, session?.token) {
        val jwt = session?.token
        val outletId = stockPeriodOutletId
        val isAdmin = session.hasRole(RoleGuards.WarehouseAdmin)
        if (outletId.isNullOrBlank() || jwt == null || !isAdmin) {
            outletPeriods = emptyList()
            outletStocktakePeriodId = null
            return@LaunchedEffect
        }
        isPeriodLoading = true
        runCatching {
            root.supabaseProvider.listOutletStockPeriods(jwt, outletId)
        }.onSuccess { periods ->
            outletPeriods = periods
            val current = outletStocktakePeriodId
            if (current == null || periods.none { it.id == current }) {
                outletStocktakePeriodId = periods.firstOrNull { it.status.equals("open", ignoreCase = true) }
                    ?.id ?: periods.firstOrNull()?.id
            }
        }.onFailure { error = it.message }
        isPeriodLoading = false
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Warehouses Admin") },
            navigationIcon = { BackButton(onBack) }
        )
    }) { padding ->
        if (session == null) {
            logger.warn("MissingSession")
            MissingAuth()
            return@Scaffold
        }
        val isAdmin = session.hasRole(RoleGuards.WarehouseAdmin)
        if (!isAdmin) {
            logger.warn("UnauthorizedAccess")
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
                        logger.event("ResetOrderSequenceTapped", mapOf("outletId" to (selectedOutletId ?: "")))
                        val jwt = session.token
                        val outletId = selectedOutletId
                        if (outletId.isNullOrEmpty()) {
                            error = "Select an outlet"
                            logger.warn("ResetSequenceValidation", mapOf("reason" to "missing_outlet"))
                            return@Button
                        }
                        if (adminPassword != "Lebanon1111$") {
                            error = "Incorrect password"
                            logger.warn("ResetSequenceValidation", mapOf("reason" to "bad_password"))
                            return@Button
                        }
                        scope.launch {
                            runCatching {
                                root.supabaseProvider.resetOrderSequence(jwt, outletId)
                            }.onSuccess {
                                message = "Order sequence reset for selected outlet"
                                logger.state("ResetOrderSequenceSuccess", mapOf("outletId" to outletId))
                            }.onFailure { t ->
                                error = t.message
                                logger.error("ResetOrderSequenceFailed", t, mapOf("outletId" to outletId))
                            }
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
                        logger.event("CreateWarehouseTapped", mapOf("outletId" to (selectedOutletId ?: "")))
                        val jwt = session.token
                        val outletId = selectedOutletId
                        val name = newWarehouseName.trim()
                        if (jwt.isEmpty() || outletId.isNullOrEmpty() || name.isEmpty()) {
                            error = "Provide name and outlet"
                            logger.warn("CreateWarehouseValidation", mapOf("hasOutlet" to !outletId.isNullOrEmpty(), "hasName" to name.isNotEmpty()))
                            return@Button
                        }
                        scope.launch {
                            runCatching {
                                root.supabaseProvider.createWarehouse(jwt, outletId, name, parentWarehouseId = selectedParentId)
                            }.onSuccess {
                                message = "Warehouse created"
                                newWarehouseName = ""
                                warehouses = root.supabaseProvider.listWarehouses(jwt)
                                logger.state("CreateWarehouseSuccess", mapOf("outletId" to outletId))
                            }.onFailure {
                                error = it.message
                                logger.error("CreateWarehouseFailed", it)
                            }
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
                        logger.event("SetPrimaryWarehouseTapped", mapOf("outletId" to (selectedOutletId ?: "")))
                        val jwt = session.token
                        val outletId = selectedOutletId
                        val wid = primaryWarehouseId
                        if (outletId.isNullOrEmpty() || wid.isNullOrEmpty()) {
                            error = "Select outlet and warehouse"
                            logger.warn("SetPrimaryValidation", mapOf("hasOutlet" to !outletId.isNullOrEmpty(), "hasWarehouse" to !wid.isNullOrEmpty()))
                            return@Button
                        }
                        scope.launch {
                            runCatching {
                                root.supabaseProvider.setPrimaryWarehouseForOutlet(jwt, outletId, wid)
                            }.onSuccess {
                                message = "Primary warehouse set"
                                logger.state("SetPrimaryWarehouseSuccess", mapOf("outletId" to outletId, "warehouseId" to wid))
                            }
                             .onFailure {
                                 error = it.message
                                 logger.error("SetPrimaryWarehouseFailed", it)
                             }
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
                        logger.event("CreateMainWarehouseTapped", mapOf("outletId" to (mainOutletId ?: selectedOutletId ?: "")))
                        val jwt = session.token
                        val outletId = mainOutletId ?: selectedOutletId
                        val name = mainName.trim()
                        if (outletId.isNullOrEmpty() || name.isEmpty()) {
                            error = "Provide name and outlet"
                            logger.warn("CreateMainValidation", mapOf("hasOutlet" to !outletId.isNullOrEmpty(), "hasName" to name.isNotEmpty()))
                            return@Button
                        }
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
                                logger.state("CreateMainWarehouseSuccess", mapOf("childCount" to selectedChildren.count { it.value }))
                            }.onFailure {
                                error = it.message
                                logger.error("CreateMainWarehouseFailed", it)
                            }
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
                                logger.event("WarehouseToggleActive", mapOf("warehouseId" to w.id, "active" to active))
                                scope.launch {
                                    runCatching { root.supabaseProvider.setWarehouseActive(session.token, w.id, active) }
                                        .onSuccess {
                                            message = if (active) "Activated ${w.name}" else "Deactivated ${w.name}"
                                            warehouses = root.supabaseProvider.listWarehouses(session.token)
                                            logger.state("WarehouseToggleSuccess", mapOf("warehouseId" to w.id, "active" to active))
                                        }
                                        .onFailure {
                                            error = it.message
                                            logger.error("WarehouseToggleFailed", it, mapOf("warehouseId" to w.id))
                                        }
                                }
                            }
                        ) { newParent ->
                            error = null; message = null
                            logger.event("WarehouseParentChange", mapOf("warehouseId" to w.id, "parentId" to (newParent ?: "")))
                            scope.launch {
                                runCatching {
                                    root.supabaseProvider.updateWarehouseParent(session.token, w.id, newParent)
                                }.onSuccess {
                                    message = "Updated ${w.name}"
                                    warehouses = root.supabaseProvider.listWarehouses(session.token)
                                    logger.state("WarehouseParentChangeSuccess")
                                }.onFailure {
                                    error = it.message
                                    logger.error("WarehouseParentChangeFailed", it)
                                }
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
                        HorizontalDivider()
                        preview.forEach { row ->
                            Text("${row.createdAt.take(16)} • ${row.orderNumber} • ${row.packLabel} ${row.packsOrdered.displayQty()} packs (${row.unitsTotal.displayQty()} units) @ ${row.warehouseName}")
                        }
                    }
                }
            }

            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Record POS Sale", style = MaterialTheme.typography.titleMedium)
                    Text("Log front-of-house sales so ingredient deductions stay in sync with Supabase recipes.")
                    DropdownField(
                        label = "Outlet",
                        options = outlets.map { it.id to it.name },
                        selectedId = posOutletId,
                        onSelected = { posOutletId = it }
                    )
                    if (products.isEmpty()) {
                        Text("Loading products…")
                    } else {
                        DropdownField(
                            label = "Product",
                            options = products.map { it.id to "${it.name} (${it.uom})" },
                            selectedId = posProductId,
                            onSelected = { posProductId = it }
                        )
                    }
                    if (posVariations.isNotEmpty()) {
                        DropdownField(
                            label = "Variation (optional)",
                            options = listOf(null to "<base product>") + posVariations.map { it.id to "${it.name} (${it.uom})" },
                            selectedId = posVariationId,
                            onSelected = { posVariationId = it }
                        )
                    }
                    OutlinedTextField(
                        value = posQty,
                        onValueChange = { txt -> posQty = txt.filter { ch -> ch.isDigit() || ch == '.' } },
                        label = { Text("Quantity") },
                        singleLine = true
                    )
                    DropdownField(
                        label = "Quantity Input",
                        options = listOf(
                            "auto" to "Auto (by pack size)",
                            "units" to "Units",
                            "cases" to "Cases"
                        ),
                        selectedId = posQtyMode,
                        onSelected = { posQtyMode = it ?: "auto" }
                    )
                    OutlinedTextField(
                        value = posReference,
                        onValueChange = { posReference = it },
                        label = { Text("Sale Reference (optional)") }
                    )
                    OutlinedTextField(
                        value = posSource,
                        onValueChange = { posSource = it },
                        label = { Text("Source / Register") }
                    )
                    Button(
                        enabled = !isPosSubmitting,
                        onClick = {
                            error = null; message = null
                            val outletId = posOutletId
                            val productId = posProductId
                            val qty = posQty.toDoubleOrNull()
                            if (outletId.isNullOrEmpty()) { error = "Select an outlet"; return@Button }
                            if (productId.isNullOrEmpty()) { error = "Select a product"; return@Button }
                            if (qty == null || qty <= 0) { error = "Enter quantity"; return@Button }
                            scope.launch {
                                isPosSubmitting = true
                                runCatching {
                                    root.supabaseProvider.recordPosSale(
                                        jwt = session.token,
                                        outletId = outletId,
                                        productId = productId,
                                        qty = qty,
                                        variationId = posVariationId,
                                        saleReference = posReference.takeIf { it.isNotBlank() },
                                        saleSource = posSource.takeIf { it.isNotBlank() },
                                        qtyInputMode = posQtyMode
                                    )
                                }.onSuccess { sale ->
                                    message = "POS sale recorded (${sale.qtyUnits.displayQty()} units)"
                                    posQty = ""
                                    posReference = ""
                                }.onFailure { error = it.message }
                                isPosSubmitting = false
                            }
                        }
                    ) { Text(if (isPosSubmitting) "Recording…" else "Record POS Sale") }
                    if (isPosSubmitting) {
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    }
                }
            }

            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Outlet Stock Periods", style = MaterialTheme.typography.titleMedium)
                    Text("Start and close outlet stock periods before running opening/closing counts.")
                    DropdownField(
                        label = "Outlet",
                        options = outlets.map { it.id to it.name },
                        selectedId = stockPeriodOutletId,
                        onSelected = { stockPeriodOutletId = it }
                    )
                    if (stockPeriodOutletId.isNullOrBlank()) {
                        Text("Select an outlet to view periods.")
                    } else if (isPeriodLoading) {
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    } else {
                        val openPeriod = outletPeriods.firstOrNull { it.status.equals("open", ignoreCase = true) }
                        when {
                            openPeriod != null -> Text("Open since ${openPeriod.periodStart.take(16)}", style = MaterialTheme.typography.bodyMedium)
                            outletPeriods.isNotEmpty() -> {
                                val last = outletPeriods.first()
                                val ended = last.periodEnd ?: last.periodStart
                                Text("Last closed ${ended.take(16)}", style = MaterialTheme.typography.bodyMedium)
                            }
                            else -> Text("No stock periods recorded yet.")
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(
                            enabled = !isStartPeriodLoading && stockPeriodOutletId != null && outletPeriods.none { it.status.equals("open", ignoreCase = true) },
                            onClick = {
                                val outletId = stockPeriodOutletId ?: run { error = "Select an outlet"; return@Button }
                                error = null; message = null
                                scope.launch {
                                    isStartPeriodLoading = true
                                    runCatching {
                                        root.supabaseProvider.startOutletStockPeriod(session.token, outletId)
                                    }.onSuccess {
                                        message = "Started stock period (${it.periodStart.take(16)})"
                                        outletPeriods = root.supabaseProvider.listOutletStockPeriods(session.token, outletId)
                                    }.onFailure { error = it.message }
                                    isStartPeriodLoading = false
                                }
                            }
                        ) { Text(if (isStartPeriodLoading) "Starting…" else "Start Period") }
                        Button(
                            enabled = !isClosePeriodLoading && outletPeriods.any { it.status.equals("open", ignoreCase = true) },
                            onClick = {
                                val period = outletPeriods.firstOrNull { it.status.equals("open", ignoreCase = true) }
                                    ?: run { error = "No open period"; return@Button }
                                error = null; message = null
                                scope.launch {
                                    isClosePeriodLoading = true
                                    runCatching {
                                        root.supabaseProvider.closeOutletStockPeriod(session.token, period.id)
                                    }.onSuccess {
                                        message = "Closed stock period"
                                        outletPeriods = stockPeriodOutletId?.let { outlet ->
                                            root.supabaseProvider.listOutletStockPeriods(session.token, outlet)
                                        } ?: emptyList()
                                    }.onFailure { error = it.message }
                                    isClosePeriodLoading = false
                                }
                            }
                        ) { Text(if (isClosePeriodLoading) "Closing…" else "Close Period") }
                    }
                }
            }

            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Outlet Stocktake", style = MaterialTheme.typography.titleMedium)
                    Text("Capture opening/closing counts directly from the outlet before comparing to balances.")
                    DropdownField(
                        label = "Outlet",
                        options = outlets.map { it.id to it.name },
                        selectedId = stockPeriodOutletId,
                        onSelected = { stockPeriodOutletId = it }
                    )
                    if (outletPeriods.isNotEmpty()) {
                        DropdownField(
                            label = "Stock Period",
                            options = outletPeriods.map {
                                it.id to "${it.status.uppercase(Locale.US)} • ${it.periodStart.take(10)}"
                            },
                            selectedId = outletStocktakePeriodId,
                            onSelected = { outletStocktakePeriodId = it }
                        )
                    }
                    if (products.isEmpty()) {
                        Text("Loading products…")
                    } else {
                        DropdownField(
                            label = "Product",
                            options = products.map { it.id to "${it.name} (${it.uom})" },
                            selectedId = outletStocktakeProductId,
                            onSelected = { outletStocktakeProductId = it }
                        )
                    }
                    if (outletStocktakeVariations.isNotEmpty()) {
                        DropdownField(
                            label = "Variation (optional)",
                            options = listOf(null to "<base product>") + outletStocktakeVariations.map { it.id to "${it.name} (${it.uom})" },
                            selectedId = outletStocktakeVariationId,
                            onSelected = { outletStocktakeVariationId = it }
                        )
                    }
                    OutlinedTextField(
                        value = outletStocktakeQty,
                        onValueChange = { outletStocktakeQty = it.filter { ch -> ch.isDigit() || ch == '.' } },
                        label = { Text("Counted Quantity") },
                        singleLine = true
                    )
                    DropdownField(
                        label = "Quantity Input",
                        options = listOf(
                            "auto" to "Auto (by pack size)",
                            "units" to "Units",
                            "cases" to "Cases"
                        ),
                        selectedId = outletStocktakeMode,
                        onSelected = { outletStocktakeMode = it ?: "auto" }
                    )
                    DropdownField(
                        label = "Snapshot Kind",
                        options = listOf(
                            "spot" to "Spot",
                            "opening" to "Opening",
                            "closing" to "Closing"
                        ),
                        selectedId = outletStocktakeKind,
                        onSelected = { outletStocktakeKind = it ?: "spot" }
                    )
                    OutlinedTextField(
                        value = outletStocktakeNote,
                        onValueChange = { outletStocktakeNote = it },
                        label = { Text("Note (optional)") }
                    )
                    Button(
                        enabled = !isOutletStocktakeLoading,
                        onClick = {
                            error = null; message = null
                            val outletId = stockPeriodOutletId
                            val productId = outletStocktakeProductId
                            val qty = outletStocktakeQty.toDoubleOrNull()
                            if (outletId.isNullOrEmpty()) { error = "Select an outlet"; return@Button }
                            if (productId.isNullOrEmpty()) { error = "Select a product"; return@Button }
                            if (qty == null) { error = "Enter counted quantity"; return@Button }
                            scope.launch {
                                isOutletStocktakeLoading = true
                                runCatching {
                                    root.supabaseProvider.recordOutletStocktake(
                                        jwt = session.token,
                                        outletId = outletId,
                                        productId = productId,
                                        countedQty = qty,
                                        variationId = outletStocktakeVariationId,
                                        periodId = outletStocktakePeriodId,
                                        snapshotKind = outletStocktakeKind,
                                        note = outletStocktakeNote.takeIf { it.isNotBlank() },
                                        qtyInputMode = outletStocktakeMode
                                    )
                                }.onSuccess {
                                    message = "Outlet stocktake saved (${it.countedQty.displayQty()} units)"
                                    outletStocktakeQty = ""
                                    outletStocktakeNote = ""
                                }.onFailure { error = it.message }
                                isOutletStocktakeLoading = false
                            }
                        }
                    ) { Text(if (isOutletStocktakeLoading) "Recording…" else "Record Stocktake") }
                    if (isOutletStocktakeLoading) {
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    }
                }
            }

            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Embedded Stock Dashboard", style = MaterialTheme.typography.titleMedium)
                    Text("Record initial, purchase, and closing entries without leaving the admin workspace.", style = MaterialTheme.typography.bodyMedium)
                    StockDashboardScreen(
                        root = root,
                        onBack = {},
                        onOpenLog = {
                            scope.launch { logBringIntoViewRequester.bringIntoView() }
                        },
                        embedded = true
                    )
                }
            }

            Card(
                modifier = Modifier.bringIntoViewRequester(logBringIntoViewRequester)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Stock Entry Log", style = MaterialTheme.typography.titleMedium)
                    Text("Review initial, purchase, and closing submissions per warehouse.", style = MaterialTheme.typography.bodyMedium)
                    StockInjectionLogScreen(
                        root = root,
                        onBack = {},
                        embedded = true
                    )
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
                    if (warehouseVariations.isNotEmpty()) {
                        DropdownField(
                            label = "Variation (optional)",
                            options = listOf(null to "<base product>") + warehouseVariations.map { it.id to "${it.name} (${it.uom})" },
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

// jwtSub helper removed; admin gating relies on RoleGuards.WarehouseAdmin

private fun Instant.toIsoSeconds(): String = this.truncatedTo(ChronoUnit.SECONDS).toString()

private fun Double.displayQty(): String =
    if (abs(this % 1.0) < 1e-6) this.toLong().toString() else String.format(Locale.US, "%.2f", this)
