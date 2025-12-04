package com.afterten.orders.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.OutletSession
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.SupabaseProvider
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard
import com.afterten.orders.util.rememberScreenLogger
import kotlinx.coroutines.delay
import com.afterten.orders.data.SupabaseProvider.Warehouse
import com.afterten.orders.data.SupabaseProvider.WarehouseTransferDto
import androidx.compose.material3.DropdownMenu
import androidx.compose.ui.text.style.TextOverflow
import java.text.DecimalFormat
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun WarehousesAdminScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    val session = root.session.collectAsState().value
    val logger = rememberScreenLogger("WarehousesAdmin")

    LaunchedEffect(Unit) {
        logger.enter(mapOf("hasWarehouseAdminRole" to session.hasRequiredWarehouseAdminRole()))
    }

    if (!session.hasRequiredWarehouseAdminRole()) {
        AccessDeniedCard(
            title = "Warehouse admin role required",
            message = "Only authorized warehouse admins can access this workspace.",
            primaryLabel = "Back",
            onPrimary = onBack,
            secondaryLabel = "Log out",
            onSecondary = onLogout
        )
        return
    }

    val activeSession = session
    if (activeSession == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    WarehousesAdminContent(
        root = root,
        session = activeSession,
        onBack = onBack,
        onLogout = onLogout
    )
}

@Composable
private fun WarehousesAdminContent(
    root: RootViewModel,
    session: OutletSession,
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    WarehouseTransfersPane(
        supabase = root.supabaseProvider,
        token = session.token,
        onBack = onBack,
        onLogout = onLogout
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WarehouseTransfersPane(
    supabase: SupabaseProvider,
    token: String,
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    var warehouses by remember { mutableStateOf<List<Warehouse>>(emptyList()) }
    var warehousesLoading by remember { mutableStateOf(true) }
    var transfers by remember { mutableStateOf<List<WarehouseTransferDto>>(emptyList()) }
    var isInitialLoading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var selectedSourceId by remember { mutableStateOf<String?>(null) }
    var selectedDestId by remember { mutableStateOf<String?>(null) }
    var refreshSignal by remember { mutableIntStateOf(0) }
    var expandedTransferId by remember { mutableStateOf<String?>(null) }

    val warehouseMap = remember(warehouses) { warehouses.associateBy { it.id } }
    val qtyFormatter = remember { DecimalFormat("#,##0.##") }

    LaunchedEffect(transfers) {
        if (expandedTransferId != null && transfers.none { it.id == expandedTransferId }) {
            expandedTransferId = null
        }
    }

    LaunchedEffect(token) {
        warehousesLoading = true
        errorMessage = null
        runCatching { supabase.listWarehouses(token) }
            .onSuccess { warehouses = it }
            .onFailure { errorMessage = it.message ?: "Failed to load warehouses" }
        warehousesLoading = false
    }

    LaunchedEffect(Unit) {
        refreshSignal += 1
        while (true) {
            delay(6_000)
            refreshSignal += 1
        }
    }

    LaunchedEffect(refreshSignal, selectedSourceId, selectedDestId, token) {
        if (refreshSignal == 0) return@LaunchedEffect
        val firstLoad = transfers.isEmpty()
        if (firstLoad) {
            isInitialLoading = true
        } else {
            isRefreshing = true
        }
        runCatching {
            supabase.fetchWarehouseTransfers(
                jwt = token,
                sourceWarehouseId = selectedSourceId,
                destWarehouseId = selectedDestId,
                limit = 100
            )
        }.onSuccess {
            transfers = it
            errorMessage = null
        }.onFailure {
            errorMessage = it.message ?: "Unable to load transfers"
        }
        isInitialLoading = false
        isRefreshing = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Button(onClick = onBack, shape = RoundedCornerShape(50)) {
                Text("Back")
            }
            Spacer(modifier = Modifier.weight(1f))
            IconButton(onClick = { refreshSignal += 1 }) {
                Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
            }
            TextButton(onClick = onLogout) { Text("Log out") }
        }

        Text(
            text = "Warehouse Transfers",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            text = "Live feed from the scanner portals.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        if (warehousesLoading || isRefreshing) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }

        TransferFilters(
            warehouses = warehouses,
            selectedSourceId = selectedSourceId,
            selectedDestId = selectedDestId,
            onSourceChanged = { selectedSourceId = it },
            onDestChanged = { selectedDestId = it },
            onClear = {
                selectedSourceId = null
                selectedDestId = null
            }
        )

        errorMessage?.let {
            Text(
                text = it,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) {
            when {
                isInitialLoading -> {
                    Box(Modifier.align(Alignment.Center)) {
                        CircularProgressIndicator()
                    }
                }
                transfers.isEmpty() -> {
                    Box(Modifier.align(Alignment.Center)) {
                        Text(
                            text = "No transfers have been logged yet.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                else -> {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(transfers, key = { it.id }) { transfer ->
                            val sourceName = warehouseMap[transfer.sourceWarehouseId]?.name ?: "Unknown source"
                            val destName = warehouseMap[transfer.destWarehouseId]?.name ?: "Unknown destination"
                            TransferCard(
                                transfer = transfer,
                                sourceName = sourceName,
                                destName = destName,
                                expanded = expandedTransferId == transfer.id,
                                onToggleExpand = {
                                    expandedTransferId = if (expandedTransferId == transfer.id) null else transfer.id
                                },
                                qtyFormatter = qtyFormatter
                            )
                        }
                    }
                }
            }
        }

        Text(
            text = "Updating every 6 seconds",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TransferFilters(
    warehouses: List<Warehouse>,
    selectedSourceId: String?,
    selectedDestId: String?,
    onSourceChanged: (String?) -> Unit,
    onDestChanged: (String?) -> Unit,
    onClear: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            WarehouseDropdown(
                modifier = Modifier.weight(1f),
                label = "From warehouse",
                warehouses = warehouses,
                selectedId = selectedSourceId,
                onSelected = onSourceChanged
            )
            WarehouseDropdown(
                modifier = Modifier.weight(1f),
                label = "To warehouse",
                warehouses = warehouses,
                selectedId = selectedDestId,
                onSelected = onDestChanged
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Filled.FilterList, contentDescription = null)
            Text(
                text = "Filter transfers by source and destination",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f)
            )
            if (selectedSourceId != null || selectedDestId != null) {
                TextButton(onClick = onClear) { Text("Clear filters") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WarehouseDropdown(
    modifier: Modifier = Modifier,
    label: String,
    warehouses: List<Warehouse>,
    selectedId: String?,
    onSelected: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = warehouses.firstOrNull { it.id == selectedId }?.name.orEmpty()

    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            modifier = modifier
                .menuAnchor(type = MenuAnchorType.PrimaryNotEditable, enabled = true)
                .fillMaxWidth(),
            value = selectedName,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            placeholder = { Text("Any warehouse") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) }
        )
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            DropdownMenuItem(
                text = { Text("Any warehouse") },
                onClick = {
                    onSelected(null)
                    expanded = false
                }
            )
            warehouses.forEach { warehouse ->
                DropdownMenuItem(
                    text = { Text(warehouse.name) },
                    onClick = {
                        onSelected(warehouse.id)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
private fun TransferCard(
    transfer: WarehouseTransferDto,
    sourceName: String,
    destName: String,
    expanded: Boolean,
    onToggleExpand: () -> Unit,
    qtyFormatter: DecimalFormat
) {
    ElevatedCard {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "$sourceName → $destName",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = formatMovementTimestamp(transfer.createdAt),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                AssistChip(onClick = {}, label = { Text(formatStatusLabel(transfer.status)) })
                IconButton(onClick = onToggleExpand) {
                    Icon(
                        imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                        contentDescription = if (expanded) "Collapse" else "Expand"
                    )
                }
            }
            transfer.note?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Note: $it",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            transfer.completedAt?.let {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Completed ${formatMovementTimestamp(it)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            AnimatedVisibility(visible = expanded) {
                Column(modifier = Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    transfer.items.forEach { item ->
                        Column {
                            Text(
                                text = buildString {
                                    append(item.product?.name ?: "Unknown product")
                                    item.variation?.name?.let { variationName ->
                                        append(" · ")
                                        append(variationName)
                                    }
                                },
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium
                            )
                            Text(
                                text = "${qtyFormatter.format(item.qty)} ${item.variation?.uom ?: item.product?.uom ?: "units"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun formatMovementTimestamp(iso: String?): String {
    if (iso.isNullOrBlank()) return "-"
    return runCatching {
        OffsetDateTime.parse(iso)
            .format(DateTimeFormatter.ofPattern("MMM d, yyyy h:mm a", Locale.getDefault()))
    }.getOrElse { iso }
}

private fun formatStatusLabel(value: String): String {
    if (value.isBlank()) return "Unknown"
    val lower = value.lowercase(Locale.getDefault())
    return lower.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }
}

private fun OutletSession?.hasRequiredWarehouseAdminRole(): Boolean =
    this.hasRole(RoleGuards.WarehouseAdmin)
