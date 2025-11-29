package com.afterten.orders.ui.screens

import android.graphics.Bitmap
import android.util.Log
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.repo.OrderRepository
import com.afterten.orders.data.SupabaseProvider
import com.afterten.orders.ui.components.SignatureCaptureDialog
import com.afterten.orders.util.LogAnalytics
import com.afterten.orders.util.formatMoney
import com.afterten.orders.util.formatPackageUnits
import com.afterten.orders.util.generateOrderPdf
import com.afterten.orders.util.sanitizeForFile
import com.afterten.orders.util.toPdfGroups
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupervisorOrderDetailScreen(
    root: RootViewModel,
    orderId: String,
    onBack: () -> Unit,
    onSaved: () -> Unit
) {
    val session by root.session.collectAsState()
    val repo = remember { OrderRepository(root.supabaseProvider) }
    val ctx = LocalContext.current
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var rows by remember { mutableStateOf(listOf<OrderRepository.OrderItemRow>()) }
    var order by remember { mutableStateOf<OrderRepository.OrderDetail?>(null) }
    var showApprovalDialog by remember { mutableStateOf(false) }
    var showDriverDialog by remember { mutableStateOf(false) }
    var approving by remember { mutableStateOf(false) }
    var driverSubmitting by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val variationsByProduct = remember { mutableStateMapOf<String, List<SupabaseProvider.SimpleVariation>>() }

    val supervisorNameSuggestion = remember(session) {
        session?.email
            ?.substringBefore('@')
            ?.replace('.', ' ')
            ?.replace('_', ' ')
            ?.split(' ')
            ?.filter { it.isNotBlank() }
            ?.joinToString(" ") { part -> part.replaceFirstChar { ch -> ch.titlecase(Locale.getDefault()) } }
            ?: ""
    }

    suspend fun loadOrder(jwt: String) {
        loading = true
        error = null
        runCatching {
            val detail = repo.fetchOrder(jwt = jwt, orderId = orderId)
            val items = repo.listOrderItems(jwt = jwt, orderId = orderId)
            detail to items
        }.onSuccess { (detail, items) ->
            order = detail
            rows = items
            loading = false
            if (detail == null) error = "Order not found"
            LogAnalytics.event(
                "supervisor_order_items_loaded",
                mapOf("orderId" to orderId, "count" to items.size, "status" to (detail?.status ?: "unknown"))
            )
        }.onFailure { t ->
            error = t.message
            loading = false
            LogAnalytics.error("supervisor_order_items_failed", t.message, t)
            Log.e(SUPERVISOR_DETAIL_TAG, "Failed to load order $orderId", t)
        }
    }

    LaunchedEffect(session?.token, orderId) {
        val s = session ?: return@LaunchedEffect
        loadOrder(s.token)
    }

    LaunchedEffect(rows, session?.token) {
        val jwt = session?.token ?: return@LaunchedEffect
        rows.mapNotNull { it.productId }
            .distinct()
            .forEach { productId ->
                if (!variationsByProduct.containsKey(productId)) {
                    runCatching { root.supabaseProvider.listVariationsForProduct(jwt, productId) }
                        .onSuccess { list -> variationsByProduct[productId] = list }
                        .onFailure {
                            variationsByProduct[productId] = emptyList()
                            Log.w(SUPERVISOR_DETAIL_TAG, "Failed to load variations for $productId", it)
                        }
                }
            }
    }

    suspend fun submitApproval(name: String, signatureBitmap: Bitmap) {
        val detail = order ?: error("Order not loaded")
        val s = session ?: error("Session expired")
        val pdfGroups = rows.toPdfGroups()
        if (pdfGroups.isEmpty()) error("Order has no products to approve")
        val tzId = detail.timezone?.takeIf { it.isNotBlank() } ?: "Africa/Lusaka"
        val zone = runCatching { ZoneId.of(tzId) }.getOrElse { ZoneId.of("Africa/Lusaka") }
        val now = ZonedDateTime.now(zone)
        val outletName = detail.outlet?.name ?: detail.outletId ?: s.outletName.ifBlank { "Outlet" }
        val outletFolder = detail.outletId ?: s.outletId.ifBlank { "orders" }
        val safeOutlet = outletName.sanitizeForFile()
        val safeOrder = detail.orderNumber.sanitizeForFile()
        val dateStr = now.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        val signaturePath = "${outletFolder}/approvals/${safeOrder}_Supervisor_${dateStr}.png"
        val pdfPath = "${outletFolder}/approvals/${safeOutlet}_${safeOrder}_${dateStr}_approved.pdf"

        withContext(Dispatchers.IO) {
            ByteArrayOutputStream().use { baos ->
                signatureBitmap.compress(Bitmap.CompressFormat.PNG, 100, baos)
                root.supabaseProvider.uploadToStorage(
                    jwt = s.token,
                    bucket = "signatures",
                    path = signaturePath,
                    bytes = baos.toByteArray(),
                    contentType = "image/png",
                    upsert = true
                )
            }

            val pdfFile = generateOrderPdf(
                cacheDir = ctx.cacheDir,
                outletName = outletName,
                orderNo = detail.orderNumber,
                createdAt = now,
                groups = pdfGroups,
                signerLabel = "Supervisor Approval",
                signerName = name,
                signatureBitmap = signatureBitmap
            )
            val pdfBytes = pdfFile.readBytes()
            pdfFile.delete()
            root.supabaseProvider.uploadToStorage(
                jwt = s.token,
                bucket = "orders",
                path = pdfPath,
                bytes = pdfBytes,
                contentType = "application/pdf",
                upsert = true
            )

            root.supabaseProvider.supervisorApproveOrder(
                jwt = s.token,
                orderId = orderId,
                supervisorName = name,
                signaturePath = signaturePath,
                pdfPath = pdfPath
            )
        }
    }

    suspend fun submitDriverLoaded(name: String, signatureBitmap: Bitmap) {
        val detail = order ?: error("Order not loaded")
        val s = session ?: error("Session expired")
        val pdfGroups = rows.toPdfGroups()
        if (pdfGroups.isEmpty()) error("Order has no products to load")
        val tzId = detail.timezone?.takeIf { it.isNotBlank() } ?: "Africa/Lusaka"
        val zone = runCatching { ZoneId.of(tzId) }.getOrElse { ZoneId.of("Africa/Lusaka") }
        val now = ZonedDateTime.now(zone)
        val outletName = detail.outlet?.name ?: detail.outletId ?: s.outletName.ifBlank { "Outlet" }
        val outletFolder = detail.outletId ?: s.outletId.ifBlank { "orders" }
        val safeOutlet = outletName.sanitizeForFile()
        val safeOrder = detail.orderNumber.sanitizeForFile()
        val dateStr = now.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))
        val signaturePath = "${outletFolder}/drivers/${safeOrder}_Driver_${dateStr}.png"
        val pdfPath = "${outletFolder}/drivers/${safeOutlet}_${safeOrder}_${dateStr}_loaded.pdf"

        withContext(Dispatchers.IO) {
            ByteArrayOutputStream().use { baos ->
                signatureBitmap.compress(Bitmap.CompressFormat.PNG, 100, baos)
                root.supabaseProvider.uploadToStorage(
                    jwt = s.token,
                    bucket = "signatures",
                    path = signaturePath,
                    bytes = baos.toByteArray(),
                    contentType = "image/png",
                    upsert = true
                )
            }

            val pdfFile = generateOrderPdf(
                cacheDir = ctx.cacheDir,
                outletName = outletName,
                orderNo = detail.orderNumber,
                createdAt = now,
                groups = pdfGroups,
                signerLabel = "Loaded / Driver",
                signerName = name,
                signatureBitmap = signatureBitmap
            )
            val pdfBytes = pdfFile.readBytes()
            pdfFile.delete()
            root.supabaseProvider.uploadToStorage(
                jwt = s.token,
                bucket = "orders",
                path = pdfPath,
                bytes = pdfBytes,
                contentType = "application/pdf",
                upsert = true
            )

            root.supabaseProvider.markOrderLoaded(
                jwt = s.token,
                orderId = orderId,
                driverName = name,
                signaturePath = signaturePath,
                pdfPath = pdfPath
            )
        }
    }

    val statusLower = order?.status?.lowercase(Locale.US)
    val isLocked = order?.locked == true
    val canApprove = order != null && rows.isNotEmpty() && statusLower !in setOf("loaded", "offloaded", "delivered")
    val canMarkLoaded = order != null && rows.isNotEmpty() && statusLower in setOf("approved", "loaded")
    val allowItemEdits = !isLocked && statusLower !in setOf("approved", "loaded", "offloaded", "delivered")

    fun handleVariationChange(rowItem: OrderRepository.OrderItemRow, variation: SupabaseProvider.SimpleVariation) {
        if (!allowItemEdits) return
        val s = session ?: return
        if (variation.id == rowItem.variationId) return
        scope.launch {
            val qtyUnits = rowItem.qty
            val cost = variation.cost ?: rowItem.cost
            val packageContains = variation.packageContains?.takeIf { it > 0 }
            runCatching {
                repo.updateOrderItemVariation(
                    jwt = s.token,
                    orderItemId = rowItem.id,
                    variationId = variation.id,
                    name = variation.name.ifBlank { rowItem.name },
                    uom = variation.uom,
                    cost = cost,
                    packageContains = packageContains,
                    qtyUnits = qtyUnits
                )
            }.onSuccess {
                rows = rows.map {
                    if (it.id == rowItem.id) {
                        it.copy(
                            variationId = variation.id,
                            name = variation.name.ifBlank { rowItem.name },
                            uom = variation.uom,
                            cost = cost,
                            packageContains = packageContains ?: it.packageContains,
                            variation = OrderRepository.VariationRef(
                                name = variation.name,
                                uom = variation.uom
                            )
                        )
                    } else it
                }
                val who = s.email ?: "Supervisor"
                runCatching {
                    root.supabaseProvider.markOrderModified(
                        jwt = s.token,
                        orderId = orderId,
                        supervisorName = who
                    )
                }
                root.supabaseProvider.emitOrdersChanged()
            }.onFailure { t ->
                error = t.message
                Log.e(SUPERVISOR_DETAIL_TAG, "Variation update failed", t)
            }
        }
    }
    val isBusy = approving || driverSubmitting

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Order Details") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        when {
            loading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            error != null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text("Error: ${error ?: "Unknown"}") }
            else -> Column(Modifier.fillMaxSize().padding(padding)) {
                order?.let {
                    SupervisorOrderHeader(it)
                    SignatureTimeline(it)
                }
                if (isBusy) {
                    LinearProgressIndicator(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp))
                }
                if (isLocked) {
                    Text(
                        "Order has been locked after approval. Quantity edits are disabled.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                } else {
                    Text(
                        "Only adjust quantities before approval. Products and variations remain fixed.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 12.dp)
                ) {
                    val grouped = rows.groupBy { it.product?.name?.takeIf { name -> name.isNotBlank() } ?: it.name }
                    grouped.entries.forEach { entry ->
                        item(key = "header_${entry.key}") {
                            Text(
                                text = entry.key,
                                style = MaterialTheme.typography.titleLarge.copy(fontSize = 32.sp),
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 8.dp),
                                textAlign = TextAlign.Center
                            )
                        }
                        items(entry.value, key = { it.id }) { rowItem ->
                            val availableVariations = rowItem.productId?.let { pid -> variationsByProduct[pid] }.orEmpty()
                            SupervisorItemCard(
                                row = rowItem,
                                enabled = allowItemEdits,
                                variations = availableVariations,
                                onChangeVariation = { variation -> handleVariationChange(rowItem, variation) }
                            ) { newQty ->
                                val s = session ?: return@SupervisorItemCard
                                scope.launch {
                                    val clamped = max(0.0, newQty)
                                    runCatching { repo.updateOrderItemQty(jwt = s.token, orderItemId = rowItem.id, qty = clamped) }
                                        .onSuccess {
                                            rows = rows.map { if (it.id == rowItem.id) it.copy(qty = clamped) else it }
                                            val who = s.email ?: "Supervisor"
                                            runCatching {
                                                root.supabaseProvider.markOrderModified(
                                                    jwt = s.token,
                                                    orderId = orderId,
                                                    supervisorName = who
                                                )
                                            }
                                            root.supabaseProvider.emitOrdersChanged()
                                        }
                                        .onFailure { t ->
                                            error = t.message
                                            Log.e(SUPERVISOR_DETAIL_TAG, "Failed to update qty for ${rowItem.id}", t)
                                        }
                                }
                            }
                            HorizontalDivider(color = MaterialTheme.colorScheme.error.copy(alpha = 0.5f))
                        }
                        item(key = "group_divider_${entry.key}") {
                            HorizontalDivider(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 8.dp),
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Text(
                        text = "Status: ${order?.status ?: "Unknown"}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Button(
                            onClick = { showApprovalDialog = true },
                            enabled = canApprove && !isBusy,
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(
                                when {
                                    approving -> "Submitting…"
                                    statusLower == "approved" -> "Re-Sign Approval"
                                    else -> "Approve & Sign"
                                }
                            )
                        }
                        Button(
                            onClick = { showDriverDialog = true },
                            enabled = canMarkLoaded && !isBusy,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(
                                when {
                                    driverSubmitting -> "Marking…"
                                    statusLower == "loaded" -> "Re-Capture Driver"
                                    else -> "Mark Loaded"
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    if (showApprovalDialog) {
        SignatureCaptureDialog(
            title = "Supervisor Approval",
            nameLabel = "Supervisor Name",
            confirmLabel = "Sign & Approve",
            initialName = supervisorNameSuggestion,
            onDismiss = { if (!approving) showApprovalDialog = false },
            onConfirm = { name, bitmap ->
                showApprovalDialog = false
                scope.launch {
                    approving = true
                    val result = runCatching { submitApproval(name, bitmap) }
                    bitmap.recycle()
                    result
                        .onSuccess {
                            scope.launch { snackbarHostState.showSnackbar("Order approved") }
                            root.supabaseProvider.emitOrdersChanged()
                            onSaved()
                        }
                        .onFailure { t ->
                            error = t.message
                            Log.e(SUPERVISOR_DETAIL_TAG, "Supervisor approval failed", t)
                            snackbarHostState.showSnackbar(
                                message = t.message ?: "Approval failed",
                                withDismissAction = true,
                                duration = SnackbarDuration.Long
                            )
                        }
                    approving = false
                }
            }
        )
    }

    if (showDriverDialog) {
        SignatureCaptureDialog(
            title = "Driver Loading",
            nameLabel = "Driver Name",
            confirmLabel = "Sign & Mark Loaded",
            initialName = order?.driverName.orEmpty(),
            onDismiss = { if (!driverSubmitting) showDriverDialog = false },
            onConfirm = { name, bitmap ->
                showDriverDialog = false
                scope.launch {
                    driverSubmitting = true
                    val result = runCatching { submitDriverLoaded(name, bitmap) }
                    bitmap.recycle()
                    result
                        .onSuccess {
                            session?.token?.let { token ->
                                runCatching { loadOrder(token) }
                                    .onFailure { Log.w(SUPERVISOR_DETAIL_TAG, "Refresh after driver mark failed", it) }
                            }
                            root.supabaseProvider.emitOrdersChanged()
                            scope.launch { snackbarHostState.showSnackbar("Driver signature captured") }
                        }
                        .onFailure { t ->
                            error = t.message
                            Log.e(SUPERVISOR_DETAIL_TAG, "Driver load failed", t)
                            snackbarHostState.showSnackbar(
                                message = t.message ?: "Driver step failed",
                                withDismissAction = true,
                                duration = SnackbarDuration.Long
                            )
                        }
                    driverSubmitting = false
                }
            }
        )
    }
}

@Composable
private fun SupervisorOrderHeader(detail: OrderRepository.OrderDetail) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                text = "Order #${detail.orderNumber}",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Outlet: ${detail.outlet?.name ?: detail.outletId ?: "-"}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            Surface(
                color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f),
                shape = RoundedCornerShape(50)
            ) {
                Text(
                    text = detail.status,
                    color = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold
                )
            }
            if (detail.locked) {
                Spacer(Modifier.height(8.dp))
                AssistChip(
                    onClick = {},
                    enabled = false,
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Filled.Lock,
                            contentDescription = "Locked",
                            tint = MaterialTheme.colorScheme.error
                        )
                    },
                    label = { Text("Locked", color = MaterialTheme.colorScheme.error) }
                )
            }
        }
    }
}

@Composable
private fun SignatureTimeline(detail: OrderRepository.OrderDetail) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SignatureTimelineRow("Outlet Employee", detail.employeeName, detail.employeeSignedAt)
            HorizontalDivider()
            SignatureTimelineRow("Supervisor", detail.supervisorName, detail.supervisorSignedAt)
            HorizontalDivider()
            SignatureTimelineRow("Driver", detail.driverName, detail.driverSignedAt)
            HorizontalDivider()
            SignatureTimelineRow("Offloader", detail.offloaderName, detail.offloaderSignedAt)
        }
    }
}

@Composable
private fun SignatureTimelineRow(label: String, name: String?, signedAt: String?) {
    Column(Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        if (!name.isNullOrBlank()) {
            Text(name, style = MaterialTheme.typography.bodyMedium)
            formatSignatureTimestamp(signedAt)?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            Text("Pending", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun formatSignatureTimestamp(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    return runCatching {
        OffsetDateTime.parse(raw).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
    }.getOrNull() ?: raw
}

@Composable
private fun SupervisorItemCard(
    row: OrderRepository.OrderItemRow,
    enabled: Boolean,
    variations: List<SupabaseProvider.SimpleVariation>,
    onChangeVariation: (SupabaseProvider.SimpleVariation) -> Unit,
    onChangeQty: (Double) -> Unit
) {
    var localQty by remember(row.id) { mutableStateOf(row.qty) }
    var qtyText by remember(row.id) { mutableStateOf(formatSupervisorQty(row.qty)) }

    LaunchedEffect(row.qty) {
        localQty = row.qty
        qtyText = formatSupervisorQty(row.qty)
    }

    val amount = row.cost * localQty

    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = row.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Cost: ${formatMoney(row.cost)}  •  Amount: ${formatMoney(amount)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.9f)
                )
                formatPackageUnits(row.packageContains)?.let { units ->
                    Text(
                        text = "Package Contains: $units units",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.85f)
                    )
                }
                if (variations.isNotEmpty()) {
                    VariationSelector(
                        variations = variations,
                        selectedId = row.variationId,
                        enabled = enabled,
                        onSelected = onChangeVariation
                    )
                }
            }
            SupervisorQtyControls(
                uom = row.uom,
                value = qtyText,
                canDecrement = localQty > 0.0,
                enabled = enabled,
                onValueChange = { text, parsed ->
                    qtyText = text
                    parsed?.let {
                        localQty = it
                        onChangeQty(it)
                    }
                },
                onDec = {
                    val newQty = max(0.0, localQty - 1.0)
                    localQty = newQty
                    qtyText = formatSupervisorQty(newQty)
                    onChangeQty(newQty)
                },
                onInc = {
                    val newQty = localQty + 1.0
                    localQty = newQty
                    qtyText = formatSupervisorQty(newQty)
                    onChangeQty(newQty)
                }
            )
        }
    }
}

@Composable
private fun SupervisorQtyControls(
    uom: String,
    value: String,
    canDecrement: Boolean,
    enabled: Boolean,
    onValueChange: (String, Double?) -> Unit,
    onDec: () -> Unit,
    onInc: () -> Unit
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        RedOutlinedPillButton(text = "-", onClick = onDec, enabled = enabled && canDecrement)
        Column(
            modifier = Modifier
                .padding(horizontal = 8.dp)
                .width(56.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = uom,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Medium,
                color = Color.White,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(
                value = value,
                onValueChange = { raw ->
                    val sanitized = raw.filter { it.isDigit() || it == '.' }
                    onValueChange(sanitized, sanitized.toDoubleOrNull())
                },
                singleLine = true,
                modifier = Modifier.width(56.dp),
                textStyle = LocalTextStyle.current.copy(textAlign = TextAlign.Center),
                keyboardOptions = KeyboardOptions.Default.copy(keyboardType = KeyboardType.Number),
                enabled = enabled,
                colors = TextFieldDefaults.colors(
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    focusedIndicatorColor = MaterialTheme.colorScheme.error,
                    unfocusedIndicatorColor = MaterialTheme.colorScheme.error.copy(alpha = 0.6f),
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent
                )
            )
        }
        RedOutlinedPillButton(text = "+", onClick = onInc, enabled = enabled)
    }
}

@Composable
private fun VariationSelector(
    variations: List<SupabaseProvider.SimpleVariation>,
    selectedId: String?,
    enabled: Boolean,
    onSelected: (SupabaseProvider.SimpleVariation) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val current = variations.firstOrNull { it.id == selectedId }
    val label = current?.let { variationLabel(it) } ?: "Select variation"
    Column(Modifier.padding(top = 8.dp)) {
        Text("Variation", style = MaterialTheme.typography.labelMedium)
        OutlinedButton(onClick = { expanded = true }, enabled = enabled) {
            Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            variations.forEach { variation ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(variationLabel(variation))
                            formatPackageUnits(variation.packageContains)?.let { units ->
                                Text(
                                    text = "Package Contains: $units units",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    },
                    enabled = enabled,
                    onClick = {
                        expanded = false
                        onSelected(variation)
                    }
                )
            }
        }
    }
}

private fun variationLabel(variation: SupabaseProvider.SimpleVariation): String {
    val uom = variation.uom.takeIf { it.isNotBlank() }
    return if (uom != null) "${variation.name} (${uom})" else variation.name
}

@Composable
private fun RedOutlinedPillButton(text: String, onClick: () -> Unit, enabled: Boolean = true) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(50),
        border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.error),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = MaterialTheme.colorScheme.error,
            disabledContentColor = MaterialTheme.colorScheme.error.copy(alpha = 0.5f)
        ),
        contentPadding = PaddingValues(0.dp),
        modifier = Modifier
            .width(48.dp)
            .height(34.dp)
    ) { Text(text) }
}

private fun formatSupervisorQty(value: Double): String {
    val rounded = value.toLong()
    return if (abs(value - rounded.toDouble()) < 0.0001) {
        rounded.toString()
    } else {
        String.format(Locale.US, "%.2f", value)
    }
}

private const val SUPERVISOR_DETAIL_TAG = "SupervisorOrderDetailDebug"
