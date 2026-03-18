package com.afterten.stocktake.ui.stocktake

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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.afterten.stocktake.RootViewModel
import com.afterten.stocktake.data.RoleGuards
import com.afterten.stocktake.data.hasRole
import com.afterten.stocktake.data.repo.StocktakeRepository
import com.afterten.stocktake.ui.components.AccessDeniedCard
import com.afterten.stocktake.ui.theme.StocktakePalette
import kotlinx.coroutines.launch
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

private val qtyFormat = DecimalFormat("#,##0.###", DecimalFormatSymbols(Locale.US))

private fun formatQty(value: Double): String = qtyFormat.format(value)

private fun normalizeVariantKey(value: String?): String {
    val raw = value?.trim()?.lowercase(Locale.US).orEmpty()
    return if (raw.isBlank()) "base" else raw
}

private fun formatVariantLabel(value: String): String = if (value == "base") "Base" else value

private fun startOfDayUtc(date: String): String? {
    val trimmed = date.trim()
    if (trimmed.isEmpty()) return null
    return runCatching {
        LocalDate.parse(trimmed)
            .atStartOfDay(ZoneOffset.UTC)
            .format(DateTimeFormatter.ISO_INSTANT)
    }.getOrNull()
}

private fun endOfDayUtcExclusive(date: String): String? {
    val trimmed = date.trim()
    if (trimmed.isEmpty()) return null
    return runCatching {
        LocalDate.parse(trimmed)
            .plusDays(1)
            .atStartOfDay(ZoneOffset.UTC)
            .format(DateTimeFormatter.ISO_INSTANT)
    }.getOrNull()
}

private fun nowLabel(): String {
    return runCatching {
        LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
    }.getOrDefault("")
}

private data class VehicleReportRow(
    val vehicleId: String,
    val vehicleName: String,
    val numberPlate: String,
    val driverName: String,
    val itemName: String,
    val variantLabel: String,
    val qty: Double
)

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun VehicleReportsScreen(
    root: RootViewModel,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val canAccess = session.hasRole(RoleGuards.Stocktake) || session.hasRole(RoleGuards.Backoffice)
    val repo = remember { StocktakeRepository(root.supabaseProvider) }
    val scope = rememberCoroutineScope()

    if (!canAccess || session == null) {
        AccessDeniedCard(
            title = "Stocktake access required",
            message = "Ask an admin to assign the Stocktake role to your account.",
            primaryLabel = "Back",
            onPrimary = onBack
        )
        return
    }

    val accent = StocktakePalette.Accent
    val background = StocktakePalette.Background
    val surface = StocktakePalette.Panel
    val surfaceStrong = StocktakePalette.PanelStrong
    val text = StocktakePalette.Text
    val muted = StocktakePalette.Muted
    val border = StocktakePalette.Border

    val outlinedFieldColors = TextFieldDefaults.colors(
        focusedIndicatorColor = accent,
        unfocusedIndicatorColor = accent,
        disabledIndicatorColor = accent,
        cursorColor = text,
        focusedLabelColor = text,
        unfocusedLabelColor = text,
        disabledLabelColor = text,
        focusedTextColor = text,
        unfocusedTextColor = text,
        disabledTextColor = text.copy(alpha = 0.6f),
        focusedContainerColor = surface,
        unfocusedContainerColor = surface,
        disabledContainerColor = surface
    )

    var vehicles by remember { mutableStateOf<List<StocktakeRepository.VehicleRow>>(emptyList()) }
    var warehouseIds by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedVehicleId by remember { mutableStateOf("all") }
    var driverSearch by remember { mutableStateOf("") }
    var plateSearch by remember { mutableStateOf("") }
    var startDate by remember { mutableStateOf(LocalDate.now().minusDays(7).toString()) }
    var endDate by remember { mutableStateOf(LocalDate.now().toString()) }
    var rows by remember { mutableStateOf<List<VehicleReportRow>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var loadingVehicles by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var reportAt by remember { mutableStateOf<String?>(null) }
    var vehicleMenu by remember { mutableStateOf(false) }

    val eligibleVehicles = remember(vehicles, warehouseIds) {
        vehicles.filter { vehicle ->
            val active = vehicle.active ?: true
            val whId = vehicle.warehouseId
            if (!active || whId.isNullOrBlank()) return@filter false
            if (warehouseIds.isEmpty()) return@filter true
            warehouseIds.contains(whId)
        }
    }

    val selectedVehicleLabel = when {
        selectedVehicleId == "all" -> "All vehicles"
        else -> eligibleVehicles.firstOrNull { it.id == selectedVehicleId }?.name
            ?: eligibleVehicles.firstOrNull { it.id == selectedVehicleId }?.numberPlate
            ?: "Selected vehicle"
    }

    val totalQty = rows.sumOf { it.qty }

    LaunchedEffect(session?.token) {
        val jwt = session?.token ?: return@LaunchedEffect
        loadingVehicles = true
        error = null
        runCatching {
            val outlets = buildList {
                session?.outletId?.takeIf { it.isNotBlank() }?.let { add(it) }
                if (isEmpty()) {
                    addAll(repo.listWhoamiOutlets(jwt).mapNotNull { it.outletId.takeIf(String::isNotBlank) })
                }
            }
            warehouseIds = if (outlets.isEmpty()) {
                emptyList()
            } else {
                repo.listWarehouseIdsForOutlets(jwt, outlets, true)
            }
            vehicles = repo.listVehicles(jwt)
        }.onFailure { err ->
            error = err.message
            vehicles = emptyList()
        }
        loadingVehicles = false
    }

    fun resetFilters() {
        selectedVehicleId = "all"
        driverSearch = ""
        plateSearch = ""
    }

    fun runReport() {
        val jwt = session?.token ?: return
        loading = true
        error = null
        scope.launch {
            runCatching {
                val driverTerm = driverSearch.trim().lowercase(Locale.US)
                val plateTerm = plateSearch.trim().lowercase(Locale.US)
                val filteredVehicles = eligibleVehicles.filter { vehicle ->
                    if (selectedVehicleId != "all" && vehicle.id != selectedVehicleId) return@filter false
                    if (driverTerm.isNotEmpty() && !(vehicle.driverName ?: "").lowercase(Locale.US).contains(driverTerm)) return@filter false
                    if (plateTerm.isNotEmpty() && !(vehicle.numberPlate ?: "").lowercase(Locale.US).contains(plateTerm)) return@filter false
                    true
                }

                if (filteredVehicles.isEmpty()) {
                    rows = emptyList()
                    reportAt = nowLabel()
                    return@runCatching
                }

                val warehouseSet = filteredVehicles.mapNotNull { it.warehouseId }.distinct()
                val startedAt = startOfDayUtc(startDate)
                val endedAt = endOfDayUtcExclusive(endDate)

                val ledgerRows = repo.listVehicleLedger(jwt, warehouseSet, startedAt, endedAt)
                val itemIds = ledgerRows.map { it.itemId }.distinct()

                if (itemIds.isEmpty()) {
                    rows = emptyList()
                    reportAt = nowLabel()
                    return@runCatching
                }

                val catalogItems = repo.listCatalogItemsMeta(jwt, itemIds)
                val itemMap = catalogItems.associateBy { it.id }
                val variantLabelMap = mutableMapOf<String, String>()

                catalogItems.forEach { item ->
                    item.variants.orEmpty().forEach { variant ->
                        val label = variant.name?.trim().orEmpty()
                        if (label.isBlank()) return@forEach
                        val key = normalizeVariantKey(variant.key ?: variant.id)
                        variantLabelMap["${item.id}|${key}".lowercase(Locale.US)] = label
                    }
                }

                val vehicleByWarehouse = filteredVehicles.associateBy { it.warehouseId }
                val totals = mutableMapOf<String, Double>()
                val detail = mutableMapOf<String, Triple<StocktakeRepository.VehicleRow, String, String>>()

                ledgerRows.forEach { row ->
                    val whId = row.warehouseId ?: return@forEach
                    val vehicle = vehicleByWarehouse[whId] ?: return@forEach
                    val variantKey = normalizeVariantKey(row.variantKey)
                    val itemId = row.itemId
                    val key = "${vehicle.id}|${itemId}|${variantKey}".lowercase(Locale.US)
                    val delta = row.deltaUnits ?: 0.0
                    if (delta <= 0) return@forEach
                    totals[key] = (totals[key] ?: 0.0) + delta
                    if (!detail.containsKey(key)) detail[key] = Triple(vehicle, itemId, variantKey)
                }

                rows = detail.entries.map { (key, meta) ->
                    val vehicle = meta.first
                    val itemId = meta.second
                    val variantKey = meta.third
                    val itemName = itemMap[itemId]?.name ?: "Item"
                    val variantLabel = variantLabelMap["${itemId}|${variantKey}".lowercase(Locale.US)]
                        ?: formatVariantLabel(variantKey)

                    VehicleReportRow(
                        vehicleId = vehicle.id,
                        vehicleName = vehicle.name ?: "Vehicle",
                        numberPlate = vehicle.numberPlate ?: "-",
                        driverName = vehicle.driverName ?: "-",
                        itemName = itemName,
                        variantLabel = variantLabel,
                        qty = totals[key] ?: 0.0
                    )
                }.sortedWith(
                    compareBy<VehicleReportRow> { it.vehicleName }
                        .thenBy { it.itemName }
                        .thenBy { it.variantLabel }
                )

                reportAt = nowLabel()
            }.onFailure { err ->
                error = err.message
                rows = emptyList()
            }
            loading = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(background)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = text) }
            Text("Vehicle Reports", fontWeight = FontWeight.Bold, color = text)
            Spacer(Modifier.size(40.dp))
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = surface),
            border = BorderStroke(1.dp, border)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Vehicle filters", color = text, fontWeight = FontWeight.Bold)
                ExposedDropdownMenuBox(expanded = vehicleMenu, onExpandedChange = { vehicleMenu = it }) {
                    OutlinedTextField(
                        value = selectedVehicleLabel,
                        onValueChange = {},
                        readOnly = true,
                        enabled = eligibleVehicles.isNotEmpty() && !loadingVehicles,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = vehicleMenu) },
                        modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                        colors = outlinedFieldColors
                    )
                    DropdownMenu(expanded = vehicleMenu, onDismissRequest = { vehicleMenu = false }) {
                        DropdownMenuItem(
                            text = { Text("All vehicles", color = text) },
                            onClick = {
                                vehicleMenu = false
                                selectedVehicleId = "all"
                            },
                            contentPadding = MenuDefaults.DropdownMenuItemContentPadding
                        )
                        eligibleVehicles.forEach { vehicle ->
                            DropdownMenuItem(
                                text = { Text(vehicle.name ?: vehicle.numberPlate ?: vehicle.id, color = text) },
                                onClick = {
                                    vehicleMenu = false
                                    selectedVehicleId = vehicle.id
                                },
                                contentPadding = MenuDefaults.DropdownMenuItemContentPadding
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = driverSearch,
                    onValueChange = { driverSearch = it },
                    label = { Text("Driver name") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = outlinedFieldColors
                )

                OutlinedTextField(
                    value = plateSearch,
                    onValueChange = { plateSearch = it },
                    label = { Text("Number plate") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = outlinedFieldColors
                )
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = surface),
            border = BorderStroke(1.dp, border)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Date range", color = text, fontWeight = FontWeight.Bold)
                OutlinedTextField(
                    value = startDate,
                    onValueChange = { startDate = it },
                    label = { Text("Start date (YYYY-MM-DD)") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = outlinedFieldColors
                )
                OutlinedTextField(
                    value = endDate,
                    onValueChange = { endDate = it },
                    label = { Text("End date (YYYY-MM-DD)") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = outlinedFieldColors
                )
            }
        }

        if (error != null) {
            Card(
                colors = CardDefaults.cardColors(containerColor = surface),
                border = BorderStroke(1.dp, border)
            ) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = accent)
                    Spacer(Modifier.width(8.dp))
                    Text(error ?: "", color = text)
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Button(
                onClick = { runReport() },
                modifier = Modifier.weight(1f),
                enabled = !loading && !loadingVehicles,
                colors = ButtonDefaults.buttonColors(containerColor = accent, contentColor = MaterialTheme.colorScheme.onPrimary)
            ) {
                Text(if (loading) "Loading..." else "Run report")
            }
            OutlinedButton(
                onClick = { resetFilters() },
                modifier = Modifier.weight(1f),
                border = BorderStroke(1.dp, border),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = text)
            ) {
                Text("Reset filters")
            }
        }

        if (loading) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                CircularProgressIndicator(color = accent)
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = surface),
            border = BorderStroke(1.dp, border)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Summary", color = text, fontWeight = FontWeight.Bold)
                Text("Vehicle filter: $selectedVehicleLabel", color = text)
                Text("Rows: ${rows.size}", color = text)
                Text("Total qty: ${formatQty(totalQty)}", color = text)
                reportAt?.takeIf { it.isNotBlank() }?.let {
                    Text("Updated: $it", color = muted, fontSize = 12.sp)
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = surface),
            border = BorderStroke(1.dp, border)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Vehicle transfer rows", color = text, fontWeight = FontWeight.Bold)
                if (!loading && rows.isEmpty()) {
                    Text("No vehicle transfers matched this filter.", color = muted)
                }
                rows.forEach { row ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = surfaceStrong),
                        border = BorderStroke(1.dp, border)
                    ) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(row.vehicleName, color = text, fontWeight = FontWeight.SemiBold)
                            Text("Plate: ${row.numberPlate} · Driver: ${row.driverName}", color = muted, fontSize = 12.sp)
                            Text("Product: ${row.itemName}", color = text)
                            Text("Variant: ${row.variantLabel}", color = text.copy(alpha = 0.85f))
                            Text("Qty: ${formatQty(row.qty)}", color = text, textAlign = TextAlign.End)
                        }
                    }
                }
            }
        }

        TextButton(onClick = onBack, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text("Back", color = text)
        }
    }
}
