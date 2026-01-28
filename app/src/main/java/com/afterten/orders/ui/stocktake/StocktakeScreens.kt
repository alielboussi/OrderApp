package com.afterten.orders.ui.stocktake

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Remove
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
import androidx.compose.material3.LocalTextStyle
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
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import android.os.Environment
import android.widget.Toast
import com.afterten.orders.util.generateStocktakeVariancePdf
import java.io.File
import kotlinx.coroutines.launch
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard
import java.util.Locale
import kotlin.math.pow
import kotlin.math.round

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun StocktakeDashboardScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onOpenCounts: (String) -> Unit,
    onOpenVariance: (String) -> Unit,
    onOpenPeriods: (String) -> Unit
) {
    val session by root.session.collectAsState()
    val vm: StocktakeViewModel = viewModel(factory = StocktakeViewModel.Factory(root.supabaseProvider))
    LaunchedEffect(session?.token) { vm.bindSession(session) }
    val ui by vm.ui.collectAsState()
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val hasOpenPeriod = ui.openPeriod?.status == "open"

    if (session != null && !session.hasRole(RoleGuards.Stocktake)) {
        AccessDeniedCard(
            title = "Stocktake role required",
            message = "Ask an admin to assign the Stocktake role to your account.",
            primaryLabel = "Back",
            onPrimary = onBack
        )
        return
    }

    val primaryRed = Color(0xFFB71C1C)
    val backgroundBlack = Color(0xFF0B0B0B)
    val surfaceBlack = Color(0xFF121212)
    val outlinedFieldColors = TextFieldDefaults.colors(
        focusedIndicatorColor = primaryRed,
        unfocusedIndicatorColor = primaryRed,
        disabledIndicatorColor = primaryRed,
        cursorColor = Color.White,
        focusedLabelColor = Color.White,
        unfocusedLabelColor = Color.White,
        disabledLabelColor = Color.White,
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White,
        disabledTextColor = Color.White,
        focusedContainerColor = surfaceBlack,
        unfocusedContainerColor = surfaceBlack,
        disabledContainerColor = surfaceBlack
    )

    var note by remember { mutableStateOf("") }
    var warehouseMenu by remember { mutableStateOf(false) }

    val warehouseLabel = ui.warehouses.firstOrNull { it.id == ui.selectedWarehouseId }?.name
        ?: "Select warehouse"
    val warehouseEnabled = ui.warehouses.isNotEmpty()

    Column(
        modifier = Modifier
            .fillMaxSize()
                .background(backgroundBlack)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White) }
            Text("Warehouse Stocktake", fontWeight = FontWeight.Bold, color = Color.White)
            Spacer(Modifier.size(40.dp))
        }

        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = surfaceBlack),
            border = BorderStroke(1.dp, primaryRed)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Warehouse", color = Color.White, fontWeight = FontWeight.Bold)
                ExposedDropdownMenuBox(expanded = warehouseMenu, onExpandedChange = { warehouseMenu = it }) {
                    OutlinedTextField(
                        value = warehouseLabel,
                        onValueChange = {},
                        readOnly = true,
                        enabled = warehouseEnabled && !ui.loading,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = warehouseMenu) },
                        modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                        colors = outlinedFieldColors
                    )
                    DropdownMenu(expanded = warehouseMenu, onDismissRequest = { warehouseMenu = false }) {
                        ui.warehouses.forEach { wh ->
                            DropdownMenuItem(
                                text = { Text(wh.name, color = Color.White) },
                                onClick = {
                                    warehouseMenu = false
                                    vm.selectWarehouse(wh.id)
                                },
                                contentPadding = MenuDefaults.DropdownMenuItemContentPadding
                            )
                        }
                    }
                }

                Text(
                    "Stocktake is warehouse-level. Pick the warehouse you count in.",
                    color = Color.White.copy(alpha = 0.8f),
                    style = MaterialTheme.typography.bodySmall
                )
                Text(
                    "Flow: enter opening counts, process transfers/damages, then enter closing counts and close the period.",
                    color = Color.White.copy(alpha = 0.8f),
                    style = MaterialTheme.typography.bodySmall
                )

                if (ui.warehouses.isEmpty()) {
                    Text("No mapped warehouses available", color = Color.White)
                }

                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Note (optional)") },
                    colors = outlinedFieldColors
                )
                ui.error?.let {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = surfaceBlack),
                        border = BorderStroke(1.dp, primaryRed)
                    ) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Warning, contentDescription = null, tint = primaryRed)
                            Spacer(Modifier.width(8.dp))
                            Text(it, color = Color.White)
                        }
                    }
                }
                Button(
                    enabled = !hasOpenPeriod && ui.selectedWarehouseId != null && !ui.loading,
                    onClick = { vm.startStocktake(note.takeIf { it.isNotBlank() }) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
                ) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Start stocktake")
                }
            }
        }

        ui.openPeriod?.let { period ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = surfaceBlack),
                border = BorderStroke(1.dp, primaryRed)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(period.stocktakeNumber ?: "In-progress", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Color.White)
                    Text("Status: ${period.status}", color = Color.White)
                    period.note?.takeIf { it.isNotBlank() }?.let { Text("Note: $it", color = Color.White) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { onOpenCounts(period.id) },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
                        ) { Text("Enter counts") }
                        OutlinedButton(
                            onClick = { onOpenVariance(period.id) },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                            border = BorderStroke(1.dp, primaryRed)
                        ) { Text("View variance") }
                    }
                    OutlinedButton(
                        onClick = { vm.closePeriod() },
                        enabled = period.status == "open" && !ui.loading,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                        border = BorderStroke(1.dp, primaryRed)
                    ) { Text("Close period") }
                }
            }
        }

        TextButton(onClick = onBack, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text("Back", color = Color.White)
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun StocktakePeriodsScreen(
    root: RootViewModel,
    warehouseId: String,
    onBack: () -> Unit,
    onOpenPeriodDetails: (String) -> Unit
) {
    val session by root.session.collectAsState()
    val vm: StocktakeViewModel = viewModel(factory = StocktakeViewModel.Factory(root.supabaseProvider))
    LaunchedEffect(session?.token) { vm.bindSession(session) }
    val ui by vm.ui.collectAsState()
    val needsSelection = warehouseId.isBlank() || warehouseId == "select"
    val effectiveWarehouseId = if (needsSelection) ui.selectedWarehouseId ?: "" else warehouseId
    LaunchedEffect(effectiveWarehouseId, session?.token) {
        if (effectiveWarehouseId.isNotBlank()) vm.loadPeriods(effectiveWarehouseId)
    }

    if (session != null && !session.hasRole(RoleGuards.Stocktake)) {
        AccessDeniedCard(
            title = "Stocktake role required",
            message = "Ask an admin to assign the Stocktake role to your account.",
            primaryLabel = "Back",
            onPrimary = onBack
        )
        return
    }

    val primaryRed = Color(0xFFB71C1C)
    val backgroundBlack = Color(0xFF0B0B0B)
    val surfaceBlack = Color(0xFF121212)

    val outlinedFieldColors = TextFieldDefaults.colors(
        focusedIndicatorColor = primaryRed,
        unfocusedIndicatorColor = primaryRed,
        disabledIndicatorColor = primaryRed,
        cursorColor = Color.White,
        focusedLabelColor = Color.White,
        unfocusedLabelColor = Color.White,
        disabledLabelColor = Color.White,
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White,
        disabledTextColor = Color.White,
        focusedContainerColor = surfaceBlack,
        unfocusedContainerColor = surfaceBlack,
        disabledContainerColor = surfaceBlack
    )

    var warehouseMenu by remember { mutableStateOf(false) }
    val warehouseLabel = ui.warehouses.firstOrNull { it.id == ui.selectedWarehouseId }?.name ?: "Select warehouse"
    val warehouseEnabled = ui.warehouses.isNotEmpty()

    fun formatStamp(raw: String?): String {
        if (raw.isNullOrBlank()) return "—"
        val trimmed = raw.replace('T', ' ')
        return if (trimmed.length > 19) trimmed.take(19) else trimmed
    }

    fun downloadVariancePdf(period: com.afterten.orders.data.repo.StocktakeRepository.StockPeriod) {
        scope.launch {
            try {
                val report = vm.buildVarianceReport(period.id)
                val pdfFile = generateStocktakeVariancePdf(ctx.cacheDir, ctx, report)
                val dir = ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: ctx.cacheDir
                val safeName = period.stocktakeNumber?.ifBlank { null } ?: period.id.take(8)
                val outFile = File(dir, "stocktake-variance-$safeName.pdf")
                pdfFile.copyTo(outFile, overwrite = true)
                pdfFile.delete()
                Toast.makeText(ctx, "Saved to ${outFile.absolutePath}", Toast.LENGTH_LONG).show()
            } catch (err: Throwable) {
                Toast.makeText(ctx, err.message ?: "Failed to export PDF", Toast.LENGTH_LONG).show()
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundBlack)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White) }
            Text("Stocktake periods", fontWeight = FontWeight.Bold, color = Color.White)
            Spacer(Modifier.size(40.dp))
        }

        if (needsSelection) {
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = surfaceBlack),
                border = BorderStroke(1.dp, primaryRed)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Warehouse", color = Color.White, fontWeight = FontWeight.Bold)
                    ExposedDropdownMenuBox(expanded = warehouseMenu, onExpandedChange = { warehouseMenu = it }) {
                        OutlinedTextField(
                            value = warehouseLabel,
                            onValueChange = {},
                            readOnly = true,
                            enabled = warehouseEnabled && !ui.loading,
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = warehouseMenu) },
                            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                            colors = outlinedFieldColors
                        )
                        DropdownMenu(expanded = warehouseMenu, onDismissRequest = { warehouseMenu = false }) {
                            ui.warehouses.forEach { wh ->
                                DropdownMenuItem(
                                    text = { Text(wh.name, color = Color.White) },
                                    onClick = {
                                        warehouseMenu = false
                                        vm.selectWarehouse(wh.id)
                                    },
                                    contentPadding = MenuDefaults.DropdownMenuItemContentPadding
                                )
                            }
                        }
                    }
                }
            }
        }

        if (ui.periodsLoading) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                CircularProgressIndicator(color = primaryRed)
            }
        }

        ui.periodsError?.let {
            Card(colors = CardDefaults.cardColors(containerColor = surfaceBlack), border = BorderStroke(1.dp, primaryRed)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = primaryRed)
                    Spacer(Modifier.width(8.dp))
                    Text(it, color = Color.White)
                }
            }
        }

        if (ui.periods.isEmpty() && !ui.periodsLoading) {
            Text("No stocktake periods found for this warehouse.", color = Color.White)
        }

        val openPeriods = ui.periods.filter { it.status.equals("open", ignoreCase = true) }
        val closedPeriods = ui.periods.filter { !it.status.equals("open", ignoreCase = true) }

        if (openPeriods.isNotEmpty()) {
            Text("Open periods", fontWeight = FontWeight.Bold, color = Color.White)
            openPeriods.forEach { period ->
                Card(
                    onClick = { onOpenPeriodDetails(period.id) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = surfaceBlack),
                    border = BorderStroke(1.dp, primaryRed)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(period.stocktakeNumber ?: period.id.take(8), fontWeight = FontWeight.Bold, color = Color.White)
                        Text("Status: ${period.status}", color = Color.White)
                        Text("Opened: ${formatStamp(period.openedAt)}", color = Color.White)
                        Text("Closed: ${formatStamp(period.closedAt)}", color = Color.White)
                        period.note?.takeIf { it.isNotBlank() }?.let { Text("Note: $it", color = Color.White) }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = { onOpenPeriodDetails(period.id) },
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
                            ) { Text("View counts") }
                            OutlinedButton(
                                onClick = { downloadVariancePdf(period) },
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                                border = BorderStroke(1.dp, primaryRed)
                            ) { Text("Variance PDF") }
                        }
                    }
                }
            }
        }

        if (closedPeriods.isNotEmpty()) {
            Text("Closed periods", fontWeight = FontWeight.Bold, color = Color.White)
            closedPeriods.forEach { period ->
                Card(
                    onClick = { onOpenPeriodDetails(period.id) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = surfaceBlack),
                    border = BorderStroke(1.dp, primaryRed)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(period.stocktakeNumber ?: period.id.take(8), fontWeight = FontWeight.Bold, color = Color.White)
                        Text("Status: ${period.status}", color = Color.White)
                        Text("Opened: ${formatStamp(period.openedAt)}", color = Color.White)
                        Text("Closed: ${formatStamp(period.closedAt)}", color = Color.White)
                        period.note?.takeIf { it.isNotBlank() }?.let { Text("Note: $it", color = Color.White) }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = { onOpenPeriodDetails(period.id) },
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
                            ) { Text("View counts") }
                            OutlinedButton(
                                onClick = { downloadVariancePdf(period) },
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                                border = BorderStroke(1.dp, primaryRed)
                            ) { Text("Variance PDF") }
                        }
                    }
                }
            }
        }

        TextButton(onClick = onBack, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text("Back", color = Color.White)
        }
    }
}

@Composable
fun StocktakePeriodCountsScreen(
    root: RootViewModel,
    periodId: String,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val vm: StocktakeViewModel = viewModel(factory = StocktakeViewModel.Factory(root.supabaseProvider))
    LaunchedEffect(session?.token) { vm.bindSession(session) }
    LaunchedEffect(periodId, session?.token) {
        if (periodId.isNotBlank()) vm.loadPeriodCounts(periodId)
    }
    val ui by vm.ui.collectAsState()

    if (session != null && !session.hasRole(RoleGuards.Stocktake)) {
        AccessDeniedCard(
            title = "Stocktake role required",
            message = "Ask an admin to assign the Stocktake role to your account.",
            primaryLabel = "Back",
            onPrimary = onBack
        )
        return
    }

    val primaryRed = Color(0xFFB71C1C)
    val backgroundBlack = Color(0xFF0B0B0B)
    val surfaceBlack = Color(0xFF121212)

    fun formatQty(value: Double): String = String.format("%.2f", value)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundBlack)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White) }
            Text("Stocktake Counts", fontWeight = FontWeight.Bold, color = Color.White)
            if (ui.periodCountsLoading) CircularProgressIndicator(modifier = Modifier.size(24.dp), color = primaryRed) else Spacer(Modifier.size(24.dp))
        }

        ui.periodCountsError?.let {
            Card(colors = CardDefaults.cardColors(containerColor = surfaceBlack), border = BorderStroke(1.dp, primaryRed)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = primaryRed)
                    Spacer(Modifier.width(8.dp))
                    Text(it, color = Color.White)
                }
            }
        }

        if (ui.periodOpeningCounts.isNotEmpty()) {
            Text("Opening counts", fontWeight = FontWeight.Bold, color = Color.White)
            ui.periodOpeningCounts.forEach { row ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = surfaceBlack),
                    border = BorderStroke(1.dp, primaryRed)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(row.itemName, fontWeight = FontWeight.Bold, color = Color.White)
                        Text("Variant: ${row.variantName}", color = Color.White)
                        Text("Qty: ${formatQty(row.qty)}", color = Color.White)
                    }
                }
            }
        }

        if (ui.periodClosingCounts.isNotEmpty()) {
            Text("Closing counts", fontWeight = FontWeight.Bold, color = Color.White)
            ui.periodClosingCounts.forEach { row ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = surfaceBlack),
                    border = BorderStroke(1.dp, primaryRed)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(row.itemName, fontWeight = FontWeight.Bold, color = Color.White)
                        Text("Variant: ${row.variantName}", color = Color.White)
                        Text("Qty: ${formatQty(row.qty)}", color = Color.White)
                    }
                }
            }
        }

        if (!ui.periodCountsLoading && ui.periodOpeningCounts.isEmpty() && ui.periodClosingCounts.isEmpty()) {
            Text("No counts recorded for this period.", color = Color.White)
        }
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
fun StocktakeCountScreen(
    root: RootViewModel,
    periodId: String,
    stocktakeNumber: String? = null,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val vm: StocktakeViewModel = viewModel(factory = StocktakeViewModel.Factory(root.supabaseProvider))
    LaunchedEffect(session?.token) { vm.bindSession(session) }
    LaunchedEffect(periodId, session?.token) { vm.loadPeriod(periodId) }
    val ui by vm.ui.collectAsState()

    if (session != null && !session.hasRole(RoleGuards.Stocktake)) {
        AccessDeniedCard(
            title = "Stocktake role required",
            message = "Ask an admin to assign the Stocktake role to your account.",
            primaryLabel = "Back",
            onPrimary = onBack
        )
        return
    }

    var search by remember { mutableStateOf("") }
    var inputError by remember { mutableStateOf<String?>(null) }
    var variantDialogOpen by remember { mutableStateOf(false) }
    var dialogItemId by remember { mutableStateOf("") }
    var dialogItemName by remember { mutableStateOf("") }
    var dialogItemKind by remember { mutableStateOf<String?>(null) }
    val dialogQty = remember { mutableStateMapOf<String, String>() }

    fun formatQty(value: Double?, decimals: Int): String {
        val safe = decimals.coerceIn(0, 6)
        return String.format(Locale.US, "%.${safe}f", value ?: 0.0)
    }
    fun defaultDecimalsForUom(raw: String?): Int {
        val key = raw?.trim()?.lowercase().orEmpty()
        return when (key) {
            "g", "kg", "mg", "ml", "l" -> 2
            "each", "case", "crate", "bottle", "tin can", "jar", "plastic" -> 0
            else -> 2
        }
    }
    fun resolveDecimals(itemId: String, variantKey: String?, uom: String): Int {
        val key = "${itemId}|${variantKey?.ifBlank { "base" } ?: "base"}".lowercase()
        val baseKey = "${itemId}|base".lowercase()
        return ui.qtyDecimals[key] ?: ui.qtyDecimals[baseKey] ?: defaultDecimalsForUom(uom)
    }
    fun stepForDecimals(decimals: Int): Double {
        val safe = decimals.coerceIn(0, 6)
        return if (safe == 0) 1.0 else 1.0 / 10.0.pow(safe.toDouble())
    }
    fun sanitizeQtyInput(raw: String, decimals: Int): String {
        val cleaned = raw.filter { it.isDigit() || it == '.' }
        if (decimals <= 0) return cleaned.filter { it.isDigit() }
        val parts = cleaned.split('.', limit = 2)
        val whole = parts.getOrNull(0).orEmpty()
        val frac = parts.getOrNull(1).orEmpty().take(decimals.coerceIn(0, 6))
        val normalizedWhole = if (whole.isBlank() && cleaned.startsWith(".")) "0" else whole
        return if (cleaned.contains('.')) "$normalizedWhole.$frac" else normalizedWhole
    }
    fun formatUomLabel(raw: String?): String {
        val key = raw?.trim()?.lowercase().orEmpty()
        return when (key) {
            "g", "gram", "grams", "g(s)" -> "Gram(s)"
            "kg", "kilogram", "kilograms", "kg(s)" -> "Kilogram(s)"
            "mg", "milligram", "milligrams", "mg(s)" -> "Milligram(s)"
            "ml", "millilitre", "millilitres", "ml(s)" -> "Millilitre(s)"
            "l", "litre", "litres", "l(s)" -> "Litre(s)"
            "each" -> "Each"
            "case" -> "Case(s)"
            "crate" -> "Crate(s)"
            "bottle" -> "Bottle(s)"
            "tin can", "tin can(s)" -> "Tin Can(s)"
            "jar", "jar(s)" -> "Jar(s)"
            "plastic", "plastic(s)" -> "Plastic(s)"
            else -> {
                if (key.isBlank()) "Each" else key.replaceFirstChar { it.titlecase() }
            }
        }
    }
    val imageSize = 112.dp

    val primaryRed = Color(0xFFB71C1C)
    val backgroundBlack = Color(0xFF0B0B0B)
    val surfaceBlack = Color(0xFF121212)
    val outlinedFieldColors = TextFieldDefaults.colors(
        focusedIndicatorColor = primaryRed,
        unfocusedIndicatorColor = primaryRed,
        disabledIndicatorColor = primaryRed,
        cursorColor = Color.White,
        focusedLabelColor = Color.White,
        unfocusedLabelColor = Color.White,
        disabledLabelColor = Color.White,
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White,
        disabledTextColor = Color.White,
        focusedContainerColor = surfaceBlack,
        unfocusedContainerColor = surfaceBlack,
        disabledContainerColor = surfaceBlack
    )

    val variantLabelMap = remember(ui.variations) {
        val map = mutableMapOf("base" to "Base")
        ui.variations.forEach { variation ->
            map[variation.id] = variation.name.ifBlank { variation.id }
            map[variation.id.lowercase()] = variation.name.ifBlank { variation.id }
            variation.key?.let { key ->
                map[key] = variation.name.ifBlank { key }
                map[key.lowercase()] = variation.name.ifBlank { key }
            }
        }
        map
    }
    val variantUomMap = remember(ui.variations) {
        val map = mutableMapOf<String, String>()
        ui.variations.forEach { variation ->
            val uom = variation.consumptionUom.ifBlank { variation.uom.ifBlank { "each" } }
            map[variation.id] = uom
            map[variation.id.lowercase()] = uom
            variation.key?.let { key -> map[key] = uom }
            variation.key?.let { key -> map[key.lowercase()] = uom }
        }
        map
    }
    val variantImageMap = remember(ui.variations) {
        val map = mutableMapOf<String, String>()
        ui.variations.forEach { variation ->
            val url = variation.imageUrl?.trim().orEmpty()
            if (url.isNotBlank()) {
                map[variation.id] = url
                map[variation.id.lowercase()] = url
                variation.key?.let { key -> map[key] = url }
                variation.key?.let { key -> map[key.lowercase()] = url }
            }
        }
        map
    }
    val variantStocktakeUomMap = remember(ui.variations) {
        val map = mutableMapOf<String, String>()
        ui.variations.forEach { variation ->
            val uom = variation.stocktakeUom?.ifBlank { null }
                ?: variation.consumptionUom.ifBlank { variation.uom.ifBlank { "each" } }
            map[variation.id] = uom
            map[variation.id.lowercase()] = uom
            variation.key?.let { key -> map[key] = uom }
            variation.key?.let { key -> map[key.lowercase()] = uom }
        }
        map
    }

    val allItemsByItemId = remember(ui.allItems, ui.items) {
        val source = if (ui.allItems.isNotEmpty()) ui.allItems else ui.items
        source.groupBy { it.itemId }
    }
    val displayItemsByItemId = remember(ui.items) {
        ui.items.groupBy { it.itemId }
    }

    val filteredBaseItems = remember(ui.items, ui.variations, search) {
        val term = search.trim().lowercase()
        val matchesTerm: (String, List<com.afterten.orders.data.SupabaseProvider.WarehouseStockItem>) -> Boolean = { itemId, rows ->
            if (term.isBlank()) {
                true
            } else {
                val nameMatch = rows.firstOrNull()?.itemName?.lowercase()?.contains(term) == true
                if (nameMatch || itemId.lowercase().contains(term)) {
                    true
                } else {
                    rows.any { row ->
                        val key = row.variantKey?.ifBlank { "base" } ?: "base"
                        val label = variantLabelMap[key]?.lowercase() ?: ""
                        label.contains(term)
                    }
                }
            }
        }

        displayItemsByItemId.mapNotNull { (itemId, rows) ->
            val baseRow = rows.firstOrNull { (it.variantKey ?: "base") == "base" } ?: rows.firstOrNull()
            when {
                baseRow == null -> null
                !matchesTerm(itemId, rows) -> null
                else -> baseRow
            }
        }
    }

    val recipeTargets = remember(filteredBaseItems, allItemsByItemId) {
        filteredBaseItems.mapNotNull { row ->
            val rows = allItemsByItemId[row.itemId].orEmpty()
            val hasRecipe = rows.any { it.hasRecipe == true } && (row.itemKind ?: "").lowercase() != "ingredient"
            if (hasRecipe) row.itemId else null
        }
    }

    LaunchedEffect(recipeTargets, ui.recipeIngredients, ui.recipeIngredientsLoading) {
        recipeTargets.forEach { itemId ->
            val recipeKey = "$itemId|base"
            if (!ui.recipeIngredients.containsKey(recipeKey) && !ui.recipeIngredientsLoading.contains(recipeKey)) {
                vm.loadRecipeIngredients(itemId, "base")
            }
        }
    }


    val columns = 2
    LazyVerticalGrid(
        columns = GridCells.Fixed(columns),
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundBlack)
            .padding(20.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item(span = { GridItemSpan(columns) }) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White) }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(stocktakeNumber ?: ui.openPeriod?.stocktakeNumber ?: "Stocktake", fontWeight = FontWeight.Bold, color = Color.White)
                    Text(periodId.take(8) + "…", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.7f))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(
                        onClick = { vm.refreshItems() },
                        enabled = !ui.loading && !ui.selectedWarehouseId.isNullOrBlank()
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White)
                    }
                    if (ui.loading) CircularProgressIndicator(modifier = Modifier.size(24.dp), color = primaryRed) else Spacer(Modifier.size(24.dp))
                }
            }
        }

        ui.error?.let { message ->
            item(span = { GridItemSpan(columns) }) {
                Card(colors = CardDefaults.cardColors(containerColor = surfaceBlack), border = BorderStroke(1.dp, primaryRed)) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = primaryRed)
                        Spacer(Modifier.width(8.dp))
                        Text(message, color = Color.White)
                    }
                }
            }
        }

        item(span = { GridItemSpan(columns) }) {
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = surfaceBlack),
                border = BorderStroke(1.dp, primaryRed)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = search,
                        onValueChange = { search = it },
                        label = { Text("Search items in warehouse") },
                        modifier = Modifier.fillMaxWidth(),
                        colors = outlinedFieldColors
                    )
                    Text(
                        "Tap an ingredient, variant group, or recipe item to enter counts.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.8f)
                    )
                    Text(
                        "Opening counts must be entered before closing counts for the same item.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.8f)
                    )
                    if (filteredBaseItems.isEmpty()) {
                        Text("No items found for this warehouse", style = MaterialTheme.typography.bodyMedium, color = Color.White)
                    }
                }
            }
        }

        items(
            items = filteredBaseItems,
            key = { row -> row.itemId }
        ) { row ->
            Button(
                onClick = {
                    inputError = null
                    dialogQty.clear()
                    dialogItemId = row.itemId
                    dialogItemName = row.itemName ?: row.itemId
                    dialogItemKind = row.itemKind
                    variantDialogOpen = true
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f),
                colors = ButtonDefaults.buttonColors(containerColor = surfaceBlack, contentColor = Color.White),
                border = BorderStroke(1.dp, primaryRed),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    AsyncImage(
                        model = row.imageUrl,
                        contentDescription = "Product photo",
                        modifier = Modifier
                            .size(imageSize)
                            .clip(RoundedCornerShape(8.dp)),
                        alignment = Alignment.Center,
                        contentScale = ContentScale.Crop
                    )
                    Text(
                        row.itemName ?: "Item",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    val rows = allItemsByItemId[row.itemId].orEmpty()
                    val variantCount = rows.count { (it.variantKey ?: "base") != "base" }
                    val hasRecipe = rows.any { it.hasRecipe == true } && (row.itemKind ?: "").lowercase() != "ingredient"
                    val recipeKey = "${row.itemId}|base"
                    val ingredientCount = ui.recipeIngredients[recipeKey]?.size
                    val badge = if ((row.itemKind ?: "").lowercase() == "ingredient") {
                        "Ingredient"
                    } else if (hasRecipe) {
                        when (ingredientCount) {
                            null -> "Ingredients: …"
                            else -> "Ingredients: $ingredientCount"
                        }
                    } else {
                        "Variants: $variantCount"
                    }
                    Text(badge, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.9f))
                }
            }
        }

        ui.lastCount?.let { last ->
            item(span = { GridItemSpan(columns) }) {
                val kindLabel = last.kind.replaceFirstChar { ch -> ch.titlecase() }
                Text(
                    "$kindLabel saved: ${formatQty(last.countedQty, 2)}",
                    color = Color.White,
                    style = MaterialTheme.typography.labelSmall
                )
            }
        }
    }

    if (variantDialogOpen) {
        val dialogRows = allItemsByItemId[dialogItemId].orEmpty()
        val baseRow = dialogRows.firstOrNull { (it.variantKey ?: "base") == "base" } ?: dialogRows.firstOrNull()
        val kindLabel = (dialogItemKind ?: baseRow?.itemKind ?: "").lowercase()
        val isIngredient = kindLabel == "ingredient"
        val hasRecipe = !isIngredient && (baseRow?.hasRecipe == true)
        val dialogVariantKey = baseRow?.variantKey?.ifBlank { "base" } ?: "base"
        val recipeKey = "$dialogItemId|$dialogVariantKey"
        val ingredientIds = ui.recipeIngredients[recipeKey].orEmpty()
        val ingredientRows = if (hasRecipe) {
            ingredientIds.mapNotNull { id ->
                val rows = allItemsByItemId[id].orEmpty()
                rows.firstOrNull { (it.variantKey ?: "base") == "base" } ?: rows.firstOrNull()
            }
        } else {
            emptyList()
        }
        val recipeLoading = hasRecipe && ui.recipeIngredientsLoading.contains(recipeKey)
        val variantRows = dialogRows.filter { (it.variantKey ?: "base") != "base" }
        val displayRows = when {
            hasRecipe -> ingredientRows
            isIngredient -> listOfNotNull(baseRow)
            variantRows.isNotEmpty() -> variantRows
            else -> listOfNotNull(baseRow)
        }

        LaunchedEffect(dialogItemId, dialogVariantKey, hasRecipe) {
            if (hasRecipe) {
                vm.loadRecipeIngredients(dialogItemId, dialogVariantKey)
            }
        }

        LaunchedEffect(dialogItemId, displayRows.size) {
            displayRows.forEach { row ->
                val key = "${row.itemId}|${row.variantKey?.ifBlank { "base" } ?: "base"}"
                if (!dialogQty.containsKey(key)) {
                    val initUom = ui.stocktakeUoms[row.itemId] ?: ui.productUoms[row.itemId] ?: "each"
                    val initDecimals = resolveDecimals(row.itemId, row.variantKey, initUom)
                    val seed = row.netUnits ?: 0.0
                    dialogQty[key] = if (seed == 0.0) "" else formatQty(seed, initDecimals)
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(backgroundBlack)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = { variantDialogOpen = false }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = primaryRed)
                }
                Text(
                    dialogItemName.ifBlank { dialogItemId },
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Spacer(Modifier.size(40.dp))
            }

            Text(
                if (hasRecipe) "Enter ingredient counts" else if (isIngredient) "Enter ingredient count" else "Enter variant counts",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.8f)
            )

            if (hasRecipe && recipeLoading) {
                Text("Loading ingredients...", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
            }

            if (hasRecipe && !recipeLoading && ingredientRows.isEmpty()) {
                Text("No ingredients found for this recipe.", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
            }

            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                val configuration = LocalConfiguration.current
                val horizontalSpacing = 12.dp
                val verticalSpacing = 12.dp
                val columns = 2
                val availableWidth = (configuration.screenWidthDp.dp - 32.dp).coerceAtLeast(0.dp)
                val cardSize = (availableWidth - horizontalSpacing) / columns
                val imageSize = minOf(140.dp, cardSize * 0.4f)

                LazyVerticalGrid(
                    columns = GridCells.Fixed(columns),
                    verticalArrangement = Arrangement.spacedBy(verticalSpacing),
                    horizontalArrangement = Arrangement.spacedBy(horizontalSpacing),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(displayRows, key = { row -> "${row.itemId}|${row.variantKey?.ifBlank { "base" } ?: "base"}" }) { row ->
                        val key = row.variantKey?.ifBlank { "base" } ?: "base"
                        val label = if (hasRecipe) {
                            row.itemName ?: row.itemId
                        } else if (key == "base") {
                            "Base"
                        } else {
                            variantLabelMap[key] ?: variantLabelMap[key.lowercase()] ?: key.take(8)
                        }
                        val imageModel = if (hasRecipe || isIngredient || key == "base") {
                            row.imageUrl
                        } else {
                            variantImageMap[key] ?: variantImageMap[key.lowercase()]
                        }
                        val uom = variantStocktakeUomMap[key] ?: variantStocktakeUomMap[key.lowercase()]
                            ?: ui.stocktakeUoms[row.itemId]
                            ?: variantUomMap[key] ?: variantUomMap[key.lowercase()]
                            ?: ui.productUoms[row.itemId]
                            ?: "each"
                        val qtyKey = "${row.itemId}|$key"
                        val rowDecimals = resolveDecimals(row.itemId, key, uom)
                        val step = stepForDecimals(rowDecimals)
                        val currentQty = dialogQty[qtyKey].orEmpty()
                        val openingLocked = ui.openingLockedKeys.contains(qtyKey)
                        val entryMode = if (openingLocked) "closing" else "opening"
                        val isLocked = openingLocked && entryMode == "opening"
                        val fieldBorder = if (isLocked) primaryRed.copy(alpha = 0.4f) else primaryRed
                        val fieldText = if (isLocked) Color.White.copy(alpha = 0.6f) else Color.White

                        Card(
                            colors = CardDefaults.cardColors(containerColor = surfaceBlack),
                            border = BorderStroke(1.dp, primaryRed),
                            modifier = Modifier.size(cardSize)
                        ) {
                            Column(
                                modifier = Modifier.fillMaxSize().padding(10.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                AsyncImage(
                                    model = imageModel,
                                    contentDescription = "Item photo",
                                    modifier = Modifier
                                        .size(imageSize)
                                        .clip(RoundedCornerShape(12.dp)),
                                    alignment = Alignment.Center,
                                    contentScale = ContentScale.Crop
                                )
                                Column(
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(
                                        label,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color.White,
                                        style = MaterialTheme.typography.titleMedium,
                                        modifier = Modifier.fillMaxWidth(),
                                        textAlign = TextAlign.Center,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        formatUomLabel(uom),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = Color.White.copy(alpha = 0.8f),
                                        modifier = Modifier.fillMaxWidth(),
                                        textAlign = TextAlign.Center,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(60.dp)
                                            .border(BorderStroke(1.dp, fieldBorder), RoundedCornerShape(12.dp))
                                            .padding(horizontal = 6.dp, vertical = 6.dp)
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                            modifier = Modifier.fillMaxSize()
                                        ) {
                                            IconButton(
                                                onClick = {
                                                    val parsed = currentQty.toDoubleOrNull() ?: 0.0
                                                    val next = (parsed - step).coerceAtLeast(0.0)
                                                    dialogQty[qtyKey] = formatQty(next, rowDecimals)
                                                },
                                                modifier = Modifier.size(32.dp),
                                                enabled = !isLocked
                                            ) {
                                                Icon(Icons.Default.Remove, contentDescription = "Decrease", tint = fieldBorder)
                                            }
                                            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                                                BasicTextField(
                                                    value = currentQty,
                                                    onValueChange = { dialogQty[qtyKey] = sanitizeQtyInput(it, rowDecimals) },
                                                    singleLine = true,
                                                    keyboardOptions = KeyboardOptions(keyboardType = if (rowDecimals > 0) KeyboardType.Decimal else KeyboardType.Number),
                                                    textStyle = LocalTextStyle.current.copy(textAlign = TextAlign.Center, fontSize = 20.sp, lineHeight = 22.sp, color = fieldText),
                                                    modifier = Modifier.fillMaxWidth(),
                                                    enabled = !isLocked
                                                )
                                                if (currentQty.isBlank()) {
                                                    Text(
                                                        if (isLocked) "Locked" else "Qty",
                                                        color = Color.White.copy(alpha = if (isLocked) 0.5f else 0.6f),
                                                        textAlign = TextAlign.Center
                                                    )
                                                }
                                            }
                                            IconButton(
                                                onClick = {
                                                    val parsed = currentQty.toDoubleOrNull() ?: 0.0
                                                    val next = parsed + step
                                                    dialogQty[qtyKey] = formatQty(next, rowDecimals)
                                                },
                                                modifier = Modifier.size(32.dp),
                                                enabled = !isLocked
                                            ) {
                                                Icon(Icons.Default.Add, contentDescription = "Increase", tint = fieldBorder)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = { variantDialogOpen = false },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
                ) {
                    Text("Back")
                }
                Button(
                    onClick = {
                        var hadError = false
                        displayRows.forEach { row ->
                            val key = row.variantKey?.ifBlank { "base" } ?: "base"
                            val qtyKey = "${row.itemId}|$key"
                            val openingLocked = ui.openingLockedKeys.contains(qtyKey)
                            val entryMode = if (openingLocked) "closing" else "opening"
                            if (openingLocked && entryMode == "opening") return@forEach
                            val rawText = (dialogQty[qtyKey] ?: "").trim()
                            if (rawText.isBlank()) return@forEach
                            val parsed = rawText.toDoubleOrNull()
                            if (parsed == null || parsed < 0) {
                                hadError = true
                                return@forEach
                            }
                            val uom = variantStocktakeUomMap[key] ?: variantStocktakeUomMap[key.lowercase()]
                                ?: ui.stocktakeUoms[row.itemId]
                                ?: variantUomMap[key] ?: variantUomMap[key.lowercase()]
                                ?: ui.productUoms[row.itemId]
                                ?: "each"
                            val rowDecimals = resolveDecimals(row.itemId, key, uom)
                            val factor = 10.0.pow(rowDecimals.coerceIn(0, 6).toDouble())
                            val rounded = round(parsed * factor) / factor
                            val mode = entryMode
                            vm.recordCount(row.itemId, rounded, key, mode)
                        }
                        inputError = if (hadError) "Enter a non-negative number" else null
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
                ) {
                    Icon(Icons.Default.Check, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text("Save all")
                }
            }

            inputError?.let { Text(it, color = primaryRed, style = MaterialTheme.typography.labelSmall) }
        }
    }
}

@Composable
fun StocktakeVarianceScreen(
    root: RootViewModel,
    periodId: String,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    val vm: StocktakeViewModel = viewModel(factory = StocktakeViewModel.Factory(root.supabaseProvider))
    LaunchedEffect(session?.token) { vm.bindSession(session) }
    LaunchedEffect(periodId, session?.token) {
        vm.loadPeriod(periodId)
        vm.loadVarianceFor(periodId)
    }
    val ui by vm.ui.collectAsState()

    fun fmt(value: Double): String = String.format("%.2f", value)

    val allowedVariance = remember(ui.items, ui.variance) {
        if (ui.items.isEmpty()) return@remember ui.variance
        val allowed = ui.items
            .groupBy { it.itemId }
            .mapValues { entry ->
                entry.value.map { it.variantKey?.ifBlank { "base" } ?: "base" }.toSet()
            }
        ui.variance.filter { row ->
            val keys = allowed[row.itemId] ?: return@filter false
            val vKey = row.variantKey?.ifBlank { "base" } ?: "base"
            keys.contains(vKey)
        }
    }

    if (session != null && !session.hasRole(RoleGuards.Stocktake)) {
        AccessDeniedCard(
            title = "Stocktake role required",
            message = "Ask an admin to assign the Stocktake role to your account.",
            primaryLabel = "Back",
            onPrimary = onBack
        )
        return
    }

    val primaryRed = Color(0xFFD50000)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
            Text(ui.openPeriod?.stocktakeNumber ?: "Variance", fontWeight = FontWeight.Bold)
            if (ui.loading) CircularProgressIndicator(modifier = Modifier.size(24.dp), color = primaryRed) else Spacer(Modifier.size(24.dp))
        }

        ui.error?.let {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(it, color = MaterialTheme.colorScheme.onErrorContainer)
                }
            }
        }

        if (allowedVariance.isEmpty()) {
            Text("No variance rows for this period yet", style = MaterialTheme.typography.bodyMedium)
        } else {
            allowedVariance.forEach { row ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        val varianceColor = if (row.varianceQty < 0) primaryRed else Color(0xFF2E7D32)
                        Text(row.itemName ?: row.itemId, fontWeight = FontWeight.Bold)
                        Text(row.itemId, style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                        Text("Variant: ${row.variantKey ?: "base"}", style = MaterialTheme.typography.labelSmall)
                        Text("Opening: ${fmt(row.openingQty)}  Movement: ${fmt(row.movementQty)}", style = MaterialTheme.typography.bodySmall)
                        Text("Expected: ${fmt(row.expectedQty)}", style = MaterialTheme.typography.bodySmall)
                        Text("Counted: ${fmt(row.closingQty)}", style = MaterialTheme.typography.bodySmall)
                        Text("Variance: ${fmt(row.varianceQty)}", style = MaterialTheme.typography.bodySmall, color = varianceColor)
                        if (row.unitCost > 0.0) {
                            Text("Variance value: ${fmt(row.varianceCost)}", style = MaterialTheme.typography.bodySmall, color = varianceColor)
                        }
                    }
                }
            }
        }

        // Debug log intentionally hidden from UI; logs remain in Logcat.
    }
}

