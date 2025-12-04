package com.afterten.orders.ui.screens

import android.app.DatePickerDialog
import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TextSelectionColors
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.OutletSession
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.SupabaseProvider
import com.afterten.orders.data.SupabaseProvider.Warehouse
import com.afterten.orders.data.SupabaseProvider.WarehouseTransferDto
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard
import com.afterten.orders.util.rememberScreenLogger
import java.text.DecimalFormat
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

private val AftertenRed = Color(0xFFFF1B2D)
private val AdminBackground = Color(0xFF050A1B)
private val PanelBackground = Color(0xFF131C35)
private val ZambiaZoneId: ZoneId = ZoneId.of("Africa/Lusaka")
private val TimestampFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("MMM d, yyyy h:mm a", Locale.getDefault()).withZone(ZambiaZoneId)
private val DateOnlyFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.getDefault())

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
    val context = LocalContext.current
    var warehouses by remember { mutableStateOf<List<Warehouse>>(emptyList()) }
    var warehousesLoading by remember { mutableStateOf(true) }
    var transfers by remember { mutableStateOf<List<WarehouseTransferDto>>(emptyList()) }
    var isInitialLoading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var selectedSourceId by remember { mutableStateOf<String?>(null) }
    var selectedDestId by remember { mutableStateOf<String?>(null) }
    var startDate by remember { mutableStateOf<LocalDate?>(null) }
    var endDate by remember { mutableStateOf<LocalDate?>(null) }
    var searchQuery by remember { mutableStateOf("") }
    var showAllTransfers by remember { mutableStateOf(false) }
    var refreshSignal by remember { mutableIntStateOf(0) }
    var expandedTransferId by remember { mutableStateOf<String?>(null) }

    val warehouseNames = remember(warehouses, transfers) {
        buildMap {
            warehouses.forEach { put(it.id, it.name) }
            transfers.forEach { transfer ->
                transfer.sourceWarehouse?.let { ref ->
                    val id = ref.id
                    if (!id.isNullOrBlank()) put(id, ref.name ?: "Warehouse")
                }
                transfer.destWarehouse?.let { ref ->
                    val id = ref.id
                    if (!id.isNullOrBlank()) put(id, ref.name ?: "Warehouse")
                }
            }
        }
    }
    val qtyFormatter = remember { DecimalFormat("#,##0.##") }

    val filteredTransfers by remember(transfers, searchQuery, startDate, endDate, warehouseNames) {
        derivedStateOf {
            val query = searchQuery.trim().lowercase(Locale.getDefault())
            transfers.filter { transfer ->
                val createdDate = transfer.createdAt.toZambiaLocalDate()
                val matchesStart = startDate?.let { filterDate -> createdDate?.isBefore(filterDate)?.not() ?: false } ?: true
                val matchesEnd = endDate?.let { filterDate -> createdDate?.isAfter(filterDate)?.not() ?: false } ?: true
                val matchesSearch = if (query.isEmpty()) {
                    true
                } else {
                    transfer.matchesQuery(query, warehouseNames)
                }
                matchesStart && matchesEnd && matchesSearch
            }
        }
    }

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

    LaunchedEffect(refreshSignal, selectedSourceId, selectedDestId, startDate, endDate, showAllTransfers, token) {
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
                createdAfterIso = startDate?.toStartOfDayIso(),
                createdBeforeIso = endDate?.toEndOfDayIso(),
                limit = if (showAllTransfers) 500 else 120
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

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AdminBackground)
    ) {
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
            Button(
                onClick = onBack,
                shape = RoundedCornerShape(50),
                colors = ButtonDefaults.buttonColors(containerColor = AftertenRed)
            ) {
                Text("Back", color = Color.White)
            }
            Spacer(modifier = Modifier.weight(1f))
            IconButton(onClick = { refreshSignal += 1 }) {
                Icon(Icons.Filled.Refresh, contentDescription = "Refresh", tint = Color.White)
            }
            TextButton(onClick = onLogout, colors = ButtonDefaults.textButtonColors(contentColor = Color.White)) {
                Text("Log out")
            }
        }

        Text(
            text = "Warehouse Transfers",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
            color = Color.White
        )
        Text(
            text = "Live feed from the scanner portals.",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.7f)
        )

        if (warehousesLoading || isRefreshing) {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth(),
                color = AftertenRed,
                trackColor = Color.White.copy(alpha = 0.2f)
            )
        }

        TransferFilters(
            warehouses = warehouses,
            selectedSourceId = selectedSourceId,
            selectedDestId = selectedDestId,
            searchQuery = searchQuery,
            startDate = startDate,
            endDate = endDate,
            showAllTransfers = showAllTransfers,
            onSourceChanged = { selectedSourceId = it },
            onDestChanged = { selectedDestId = it },
            onClearWarehouseFilters = {
                selectedSourceId = null
                selectedDestId = null
            },
            onSearchChanged = { searchQuery = it },
            onPickStartDate = {
                showDatePicker(context, startDate) { picked ->
                    startDate = picked
                    endDate?.let { existingEnd ->
                        if (picked.isAfter(existingEnd)) endDate = picked
                    }
                }
            },
            onPickEndDate = {
                showDatePicker(context, endDate ?: startDate) { picked ->
                    endDate = picked
                    startDate?.let { existingStart ->
                        if (picked.isBefore(existingStart)) startDate = picked
                    }
                }
            },
            onClearDates = {
                startDate = null
                endDate = null
            },
            onToggleShowAll = { showAllTransfers = !showAllTransfers }
        )

        errorMessage?.let {
            Text(
                text = it,
                color = AftertenRed,
                style = MaterialTheme.typography.bodyMedium
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
                        CircularProgressIndicator(color = AftertenRed)
                    }
                }
                filteredTransfers.isEmpty() -> {
                    Box(Modifier.align(Alignment.Center)) {
                        Text(
                            text = "No transfers match the current filters.",
                            color = Color.White.copy(alpha = 0.6f)
                        )
                    }
                }
                else -> {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(filteredTransfers, key = { it.id }) { transfer ->
                            val sourceName = warehouseNames[transfer.sourceWarehouseId]
                                ?: transfer.sourceWarehouse?.name
                                ?: "Unknown source"
                            val destName = warehouseNames[transfer.destWarehouseId]
                                ?: transfer.destWarehouse?.name
                                ?: "Unknown destination"
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
            style = MaterialTheme.typography.labelLarge,
            color = Color.White.copy(alpha = 0.6f)
        )
    }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TransferFilters(
    warehouses: List<Warehouse>,
    selectedSourceId: String?,
    selectedDestId: String?,
    searchQuery: String,
    startDate: LocalDate?,
    endDate: LocalDate?,
    showAllTransfers: Boolean,
    onSourceChanged: (String?) -> Unit,
    onDestChanged: (String?) -> Unit,
    onClearWarehouseFilters: () -> Unit,
    onSearchChanged: (String) -> Unit,
    onPickStartDate: () -> Unit,
    onPickEndDate: () -> Unit,
    onClearDates: () -> Unit,
    onToggleShowAll: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
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
            Icon(Icons.Filled.FilterList, contentDescription = null, tint = AftertenRed)
            Text(
                text = "Filter transfers by source and destination",
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White,
                modifier = Modifier.weight(1f)
            )
            if (selectedSourceId != null || selectedDestId != null) {
                TextButton(onClick = onClearWarehouseFilters, colors = ButtonDefaults.textButtonColors(contentColor = AftertenRed)) {
                    Text("Clear")
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            DateFilterButton(
                modifier = Modifier.weight(1f),
                label = "From date",
                value = startDate,
                onClick = onPickStartDate
            )
            DateFilterButton(
                modifier = Modifier.weight(1f),
                label = "To date",
                value = endDate,
                onClick = onPickEndDate
            )
            TextButton(onClick = onClearDates, colors = ButtonDefaults.textButtonColors(contentColor = AftertenRed)) {
                Text("Clear dates")
            }
        }

        OutlinedTextField(
            value = searchQuery,
            onValueChange = onSearchChanged,
            modifier = Modifier
                .fillMaxWidth()
                .border(BorderStroke(1.5.dp, AftertenRed), RoundedCornerShape(18.dp)),
            singleLine = true,
            keyboardOptions = KeyboardOptions.Default.copy(imeAction = ImeAction.Search),
            placeholder = { Text("Search by warehouse or product", color = Color.White.copy(alpha = 0.5f)) },
            label = { Text("Search transfers", color = Color.White) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = AftertenRed) },
            colors = transferTextFieldColors()
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            FilterChip(
                selected = showAllTransfers,
                onClick = onToggleShowAll,
                label = { Text("Show entire history") },
                leadingIcon = if (showAllTransfers) {
                    {
                        Icon(Icons.Filled.Refresh, contentDescription = null, tint = Color.White)
                    }
                } else null,
                colors = FilterChipDefaults.filterChipColors(
                    containerColor = Color.Transparent,
                    selectedContainerColor = AftertenRed.copy(alpha = 0.2f),
                    labelColor = Color.White,
                    selectedLabelColor = Color.White
                ),
                border = FilterChipDefaults.filterChipBorder(
                    borderColor = AftertenRed,
                    selectedBorderColor = AftertenRed
                )
            )
            Text(
                text = if (showAllTransfers) "Showing up to 500 transfers" else "Showing latest 120 transfers",
                color = Color.White.copy(alpha = 0.7f),
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
private fun DateFilterButton(
    modifier: Modifier = Modifier,
    label: String,
    value: LocalDate?,
    onClick: () -> Unit
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.5.dp, AftertenRed),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
    ) {
        Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = AftertenRed)
        Spacer(modifier = Modifier.width(8.dp))
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(text = label, style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.8f))
            Text(
                text = value?.format(DateOnlyFormatter) ?: "Any date",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = Color.White
            )
        }
    }
}

@Composable
private fun transferTextFieldColors() = TextFieldDefaults.colors(
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White,
    disabledTextColor = Color.White,
    focusedLabelColor = Color.White,
    unfocusedLabelColor = Color.White.copy(alpha = 0.7f),
    focusedContainerColor = Color.Transparent,
    unfocusedContainerColor = Color.Transparent,
    disabledContainerColor = Color.Transparent,
    focusedIndicatorColor = Color.Transparent,
    unfocusedIndicatorColor = Color.Transparent,
    disabledIndicatorColor = Color.Transparent,
    cursorColor = AftertenRed,
    selectionColors = TextSelectionColors(
        handleColor = AftertenRed,
        backgroundColor = AftertenRed.copy(alpha = 0.3f)
    )
)

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
                .fillMaxWidth()
                .border(BorderStroke(1.5.dp, AftertenRed), RoundedCornerShape(18.dp)),
            value = selectedName,
            onValueChange = {},
            readOnly = true,
            label = { Text(label, color = Color.White) },
            placeholder = { Text("Any warehouse", color = Color.White.copy(alpha = 0.5f)) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            colors = transferTextFieldColors()
        )
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            containerColor = PanelBackground
        ) {
            DropdownMenuItem(
                text = { Text("Any warehouse", color = Color.White) },
                onClick = {
                    onSelected(null)
                    expanded = false
                }
            )
            warehouses.forEach { warehouse ->
                DropdownMenuItem(
                    text = { Text(warehouse.name, color = Color.White) },
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
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .border(BorderStroke(1.5.dp, AftertenRed.copy(alpha = 0.6f)), RoundedCornerShape(20.dp)),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.elevatedCardColors(
            containerColor = PanelBackground,
            contentColor = Color.White
        ),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "$sourceName → $destName",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        color = Color.White,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = formatMovementTimestamp(transfer.createdAt),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.7f)
                    )
                }
                AssistChip(
                    onClick = {},
                    label = { Text(formatStatusLabel(transfer.status), color = Color.White) },
                    border = BorderStroke(1.dp, AftertenRed),
                    colors = AssistChipDefaults.assistChipColors(
                        containerColor = Color.Transparent,
                        labelColor = Color.White
                    )
                )
                IconButton(onClick = onToggleExpand) {
                    Icon(
                        imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                        contentDescription = if (expanded) "Collapse" else "Expand",
                        tint = AftertenRed
                    )
                }
            }
            transfer.note?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Note: $it",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.8f)
                )
            }
            transfer.completedAt?.let {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Completed ${formatMovementTimestamp(it)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.7f)
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
                                fontWeight = FontWeight.Medium,
                                color = Color.White
                            )
                            Text(
                                text = "${qtyFormatter.format(item.qty)} ${item.variation?.uom ?: item.product?.uom ?: "units"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.8f)
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
        val zoned = OffsetDateTime.parse(iso).atZoneSameInstant(ZambiaZoneId)
        TimestampFormatter.format(zoned)
    }.getOrElse { iso }
}

private fun LocalDate.toStartOfDayIso(): String =
    this.atStartOfDay(ZambiaZoneId).toOffsetDateTime().toString()

private fun LocalDate.toEndOfDayIso(): String =
    this.atTime(LocalTime.of(23, 59, 59)).atZone(ZambiaZoneId).toOffsetDateTime().toString()

private fun String?.toZambiaLocalDate(): LocalDate? = this?.let {
    runCatching { OffsetDateTime.parse(it).atZoneSameInstant(ZambiaZoneId).toLocalDate() }.getOrNull()
}

private fun showDatePicker(context: Context, seed: LocalDate?, onPicked: (LocalDate) -> Unit) {
    val initial = seed ?: LocalDate.now(ZambiaZoneId)
    DatePickerDialog(
        context,
        { _, year, month, day -> onPicked(LocalDate.of(year, month + 1, day)) },
        initial.year,
        initial.monthValue - 1,
        initial.dayOfMonth
    ).show()
}

private fun WarehouseTransferDto.matchesQuery(
    query: String,
    warehouseNames: Map<String, String>
): Boolean {
    fun matchesCandidate(value: String?) =
        value?.lowercase(Locale.getDefault())?.contains(query) == true

    val resolvedSource = warehouseNames[sourceWarehouseId] ?: sourceWarehouse?.name
    val resolvedDest = warehouseNames[destWarehouseId] ?: destWarehouse?.name
    if (matchesCandidate(resolvedSource) || matchesCandidate(resolvedDest)) return true
    if (matchesCandidate(note) || matchesCandidate(status)) return true
    return items.any { item ->
        matchesCandidate(item.product?.name) || matchesCandidate(item.variation?.name)
    }
}

private fun formatStatusLabel(value: String): String {
    if (value.isBlank()) return "Unknown"
    val lower = value.lowercase(Locale.getDefault())
    return lower.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }
}

private fun OutletSession?.hasRequiredWarehouseAdminRole(): Boolean =
    this.hasRole(RoleGuards.WarehouseAdmin)
