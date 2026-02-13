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
import androidx.compose.foundation.layout.statusBarsPadding
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
import androidx.compose.material3.AlertDialog
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
import androidx.activity.compose.BackHandler
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
import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.widget.Toast
import android.util.Log
import com.afterten.orders.util.generateStocktakeVariancePdf
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.launch
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.pow
import kotlin.math.round

private fun formatUtcIso(value: String?): String? {
    val raw = value?.trim().orEmpty()
    if (raw.isEmpty()) return null
    val normalized = raw.replace(" ", "T")
    val candidate = if (normalized.endsWith("Z") || normalized.contains("+")) normalized else "${normalized}Z"
    return runCatching {
        OffsetDateTime.parse(candidate)
            .withOffsetSameInstant(ZoneOffset.UTC)
            .format(DateTimeFormatter.ISO_INSTANT)
    }.getOrElse { raw }
}

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

    var warehouseMenu by remember { mutableStateOf(false) }

    val warehouseLabel = ui.warehouses.firstOrNull { it.id == ui.selectedWarehouseId }?.name
        ?: "Select warehouse"
    val warehouseEnabled = ui.warehouses.isNotEmpty()
    val cutoffUtc = formatUtcIso(ui.openPeriod?.openedAt)

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
                    onClick = { vm.startStocktake(null) },
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
                    cutoffUtc?.let {
                        Text("Sync cutoff (UTC): $it", color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodySmall)
                        Text("Use this exact time in the tray app.", color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall)
                    }
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
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
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
                Log.d("Stocktake", "variance pdf: start periodId=${period.id}")
                val activeSession = session
                if (activeSession == null) {
                    Log.e("Stocktake", "variance pdf: no active session")
                    Toast.makeText(ctx, "Sign in required to export PDF", Toast.LENGTH_LONG).show()
                    return@launch
                }
                val report = vm.buildVarianceReport(period.id)
                Log.d("Stocktake", "variance pdf: report rows=${report.rows.size}")
                val pdfFile = generateStocktakeVariancePdf(ctx.cacheDir, ctx, report)
                val safeName = period.stocktakeNumber?.ifBlank { null } ?: period.id.take(8)
                val fileName = "stocktake-variance-$safeName.pdf"
                val storagePath = "stocktake/variance/$fileName"
                val pdfBytes = pdfFile.readBytes()
                pdfFile.delete()

                val bucket = "orders"
                Log.d("Stocktake", "variance pdf: upload bucket=$bucket path=$storagePath size=${pdfBytes.size}")
                val uploadResp = root.supabaseProvider.uploadToStorage(
                    jwt = activeSession.token,
                    bucket = bucket,
                    path = storagePath,
                    bytes = pdfBytes,
                    contentType = "application/pdf",
                    upsert = true
                )
                val uploadCode = uploadResp.status.value
                if (uploadCode !in 200..299) {
                    val detail = runCatching { uploadResp.bodyAsText() }.getOrNull().orEmpty()
                    Log.e("Stocktake", "variance pdf: upload failed code=$uploadCode detail=$detail")
                    throw IllegalStateException("Upload failed: HTTP $uploadCode $detail")
                }
                Log.d("Stocktake", "variance pdf: upload ok code=$uploadCode")

                val url = root.supabaseProvider.createSignedUrl(
                    jwt = activeSession.token,
                    bucket = bucket,
                    path = storagePath,
                    expiresInSeconds = 3600,
                    downloadName = fileName
                )
                Log.d("Stocktake", "variance pdf: signed url=$url")
                val downloadManager = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
                if (downloadManager == null) {
                    Log.e("Stocktake", "variance pdf: DownloadManager unavailable")
                    Toast.makeText(ctx, "Download manager unavailable", Toast.LENGTH_LONG).show()
                    return@launch
                }
                val request = DownloadManager.Request(Uri.parse(url))
                    .setTitle(fileName)
                    .setDescription("Stocktake variance PDF")
                    .setMimeType("application/pdf")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(true)
                    .setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, fileName)
                val downloadId = downloadManager.enqueue(request)
                Log.d("Stocktake", "variance pdf: enqueue downloadId=$downloadId fileName=$fileName")
                Toast.makeText(ctx, "Downloading variance PDF", Toast.LENGTH_LONG).show()
            } catch (err: Throwable) {
                Log.e("Stocktake", "variance pdf: failed", err)
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
        if (periodId.isNotBlank()) {
            vm.loadPeriod(periodId)
            vm.loadPeriodCounts(periodId)
        }
    }
    val ui by vm.ui.collectAsState()
    var showImportDialog by remember { mutableStateOf(false) }

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

    data class CombinedCountRow(
        val itemName: String,
        val variantName: String,
        val openingQty: Double,
        val closingQty: Double,
        val varianceQty: Double
    )

    val combinedRows = remember(ui.periodOpeningCounts, ui.periodClosingCounts) {
        val openingMap = ui.periodOpeningCounts.associateBy {
            "${it.itemId}|${it.variantKey}".lowercase()
        }
        val closingMap = ui.periodClosingCounts.associateBy {
            "${it.itemId}|${it.variantKey}".lowercase()
        }
        val keys = (openingMap.keys + closingMap.keys).toSet()
        keys.mapNotNull { key ->
            val opening = openingMap[key]
            val closing = closingMap[key]
            val itemName = opening?.itemName ?: closing?.itemName ?: return@mapNotNull null
            val variantName = opening?.variantName ?: closing?.variantName ?: "Base"
            val openingQty = opening?.qty ?: 0.0
            val closingQty = closing?.qty ?: 0.0
            val varianceQty = closingQty - openingQty
            CombinedCountRow(itemName, variantName, openingQty, closingQty, varianceQty)
        }.sortedWith(compareBy({ it.itemName.lowercase() }, { it.variantName.lowercase() }))
    }

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

        val canImport = ui.openPeriod?.id == periodId && ui.openPeriod?.status == "open" && !ui.periodCountsLoading
        if (canImport) {
            OutlinedButton(
                onClick = { showImportDialog = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                border = BorderStroke(1.dp, primaryRed)
            ) { Text("Import previous closing as opening") }
        }

        if (combinedRows.isNotEmpty()) {
            Text("Opening / Closing / Variance", fontWeight = FontWeight.Bold, color = Color.White)
            combinedRows.forEach { row ->
                val varianceColor = if (row.varianceQty < 0) primaryRed else Color(0xFF2E7D32)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = surfaceBlack),
                    border = BorderStroke(1.dp, primaryRed)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(row.itemName, fontWeight = FontWeight.Bold, color = Color.White)
                        Text("Variant: ${row.variantName}", color = Color.White)
                        Text("Opening: ${formatQty(row.openingQty)}", color = Color.White)
                        Text("Closing: ${formatQty(row.closingQty)}", color = Color.White)
                        Text("Variance: ${formatQty(row.varianceQty)}", color = varianceColor)
                    }
                }
            }
        }

        if (!ui.periodCountsLoading && combinedRows.isEmpty()) {
            Text("No counts recorded for this period.", color = Color.White)
        }

        if (showImportDialog) {
            AlertDialog(
                onDismissRequest = { showImportDialog = false },
                title = { Text("Import previous closing counts") },
                text = {
                    Text(
                        "This will overwrite opening counts for this period using the previous period's closing counts. Items with no previous count will be set to 0."
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            showImportDialog = false
                            val warehouseId = ui.openPeriod?.warehouseId ?: return@TextButton
                            vm.importPreviousClosingIntoOpening(
                                periodId = periodId,
                                warehouseId = warehouseId,
                                includeZeros = true,
                                auto = false
                            )
                        }
                    ) { Text("Import") }
                },
                dismissButton = {
                    TextButton(onClick = { showImportDialog = false }) { Text("Cancel") }
                }
            )
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
    LaunchedEffect(periodId, session?.token) {
        vm.loadPeriod(periodId)
        vm.loadPeriodCounts(periodId)
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

    var search by remember { mutableStateOf("") }
    var inputError by remember { mutableStateOf<String?>(null) }
    var variantDialogOpen by remember { mutableStateOf(false) }
    var dialogItemId by remember { mutableStateOf("") }
    var dialogItemName by remember { mutableStateOf("") }
    var dialogItemKind by remember { mutableStateOf<String?>(null) }
    val dialogQty = remember { mutableStateMapOf<String, String>() }
    val unsavedKeys = remember { mutableStateMapOf<String, Boolean>() }
    var showLeaveDialog by remember { mutableStateOf(false) }
    var leaveAction by remember { mutableStateOf<(() -> Unit)?>(null) }
    var showCloseDialog by remember { mutableStateOf(false) }
    var closeRequested by remember { mutableStateOf(false) }

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

    val openingCountMap = remember(ui.periodOpeningCounts) {
        ui.periodOpeningCounts.associateBy(
            { "${it.itemId}|${it.variantKey.ifBlank { "base" }}".lowercase() },
            { it.qty }
        )
    }
    val closingCountMap = remember(ui.periodClosingCounts) {
        ui.periodClosingCounts.associateBy(
            { "${it.itemId}|${it.variantKey.ifBlank { "base" }}".lowercase() },
            { it.qty }
        )
    }

    val primaryRed = Color(0xFFB71C1C)
    val backgroundBlack = Color(0xFF0B0B0B)
    val surfaceBlack = Color(0xFF121212)
    val warehouseLabel = ui.warehouses.firstOrNull { it.id == ui.selectedWarehouseId }?.name ?: "Warehouse"
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

    val hasUnsaved = unsavedKeys.isNotEmpty()
    val hasOpenPeriod = ui.openPeriod?.status == "open"

    LaunchedEffect(ui.lastBatchSavedKeys) {
        if (ui.lastBatchSavedKeys.isNotEmpty()) {
            ui.lastBatchSavedKeys.forEach { key ->
                unsavedKeys.remove(key)
            }
        }
    }

    fun requestLeave(action: () -> Unit) {
        if (hasUnsaved) {
            leaveAction = action
            showLeaveDialog = true
        } else {
            action()
        }
    }

    BackHandler(enabled = showLeaveDialog) {
        showLeaveDialog = false
    }

    BackHandler(enabled = hasUnsaved && !showLeaveDialog) {
        requestLeave { onBack() }
    }

    LaunchedEffect(ui.openPeriod, ui.loading, closeRequested) {
        if (closeRequested && !ui.loading && ui.openPeriod == null) {
            closeRequested = false
            onBack()
        }
    }

    fun buildBatchForRows(rows: List<com.afterten.orders.data.SupabaseProvider.WarehouseStockItem>): List<StocktakeViewModel.CountInput>? {
        var hadError = false
        val batch = mutableListOf<StocktakeViewModel.CountInput>()
        val seenKeys = mutableSetOf<String>()
        rows.forEach { row ->
            val key = row.variantKey?.ifBlank { "base" } ?: "base"
            val qtyKey = "${row.itemId}|$key"
            if (!seenKeys.add(qtyKey)) return@forEach
            val openingLocked = ui.openingLockedKeys.contains(qtyKey)
            val closingLocked = ui.closingLockedKeys.contains(qtyKey)
            val entryMode = if (openingLocked) "closing" else "opening"
            if (entryMode == "closing" && closingLocked) return@forEach
            val rawText = dialogQty[qtyKey].orEmpty().trim()
            val parsed = if (rawText.isBlank()) 0.0 else rawText.toDoubleOrNull()
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
            batch.add(StocktakeViewModel.CountInput(row.itemId, rounded, key, entryMode))
        }
        if (hadError) return null
        return batch
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
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(20.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item(span = { GridItemSpan(columns) }) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { requestLeave { onBack() } }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
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
                        "Warehouse: $warehouseLabel",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.85f)
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
                    if (hasOpenPeriod) {
                        OutlinedButton(
                            onClick = { showCloseDialog = true },
                            enabled = !ui.loading && !hasUnsaved,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                            border = BorderStroke(1.dp, primaryRed)
                        ) {
                            Icon(Icons.Default.Check, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Close period")
                        }
                        if (hasUnsaved) {
                            Text(
                                "Save items before closing the period.",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White.copy(alpha = 0.7f)
                            )
                        }
                    }
                    inputError?.let {
                        Text(it, color = primaryRed, style = MaterialTheme.typography.labelSmall)
                    }
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
                    dialogItemId = row.itemId
                    dialogItemName = row.itemName ?: row.itemId
                    dialogItemKind = row.itemKind
                    variantDialogOpen = true
                },
                modifier = Modifier
                    .padding(4.dp)
                    .fillMaxWidth()
                    .aspectRatio(0.95f),
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

        LaunchedEffect(dialogItemId, displayRows.size, ui.openingLockedKeys, ui.periodOpeningCounts, ui.periodClosingCounts) {
            displayRows.forEach { row ->
                val key = "${row.itemId}|${row.variantKey?.ifBlank { "base" } ?: "base"}"
                if (!dialogQty.containsKey(key)) {
                    val initUom = ui.stocktakeUoms[row.itemId] ?: ui.productUoms[row.itemId] ?: "each"
                    val initDecimals = resolveDecimals(row.itemId, row.variantKey, initUom)
                    val normalizedKey = key.lowercase()
                    val openingLocked = ui.openingLockedKeys.contains(key)
                    val entryMode = if (openingLocked) "closing" else "opening"
                    val seed = if (entryMode == "closing") {
                        closingCountMap[normalizedKey] ?: 0.0
                    } else {
                        openingCountMap[normalizedKey] ?: 0.0
                    }
                    dialogQty[key] = if (seed == 0.0) "" else formatQty(seed, initDecimals)
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(backgroundBlack)
                .statusBarsPadding()
                .navigationBarsPadding()
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
                val cardSize = ((availableWidth - horizontalSpacing) / columns) * 0.94f
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
                        val closingLocked = ui.closingLockedKeys.contains(qtyKey)
                        val entryMode = if (openingLocked) "closing" else "opening"
                        val isLocked = if (entryMode == "closing") closingLocked else false
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
                                                    unsavedKeys[qtyKey] = true
                                                },
                                                modifier = Modifier.size(32.dp),
                                                enabled = !isLocked
                                            ) {
                                                Icon(Icons.Default.Remove, contentDescription = "Decrease", tint = fieldBorder)
                                            }
                                            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                                                BasicTextField(
                                                    value = currentQty,
                                                    onValueChange = {
                                                        dialogQty[qtyKey] = sanitizeQtyInput(it, rowDecimals)
                                                        unsavedKeys[qtyKey] = true
                                                    },
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
                                                    unsavedKeys[qtyKey] = true
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
                    onClick = {
                        val dialogKeys = displayRows.map { row ->
                            val vKey = row.variantKey?.ifBlank { "base" } ?: "base"
                            "${row.itemId}|$vKey"
                        }
                        val dialogHasUnsaved = dialogKeys.any { unsavedKeys[it] == true }
                        if (dialogHasUnsaved) {
                            requestLeave { variantDialogOpen = false }
                        } else {
                            variantDialogOpen = false
                        }
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
                ) {
                    Text("Back")
                }
                Button(
                    onClick = {
                        val batch = buildBatchForRows(displayRows)
                        inputError = if (batch == null) "Enter a non-negative number" else null
                        if (batch != null && batch.isNotEmpty()) {
                            vm.recordCountsBatch(batch)
                        }
                    },
                    enabled = !ui.loading && displayRows.any { row ->
                        val vKey = row.variantKey?.ifBlank { "base" } ?: "base"
                        val key = "${row.itemId}|$vKey"
                        unsavedKeys[key] == true
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = Color.White)
                ) {
                    Text("Save item")
                }
            }
            Text(
                "Use Save item to lock counts before leaving.",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.7f)
            )
        }
    }

    if (showLeaveDialog) {
        AlertDialog(
            onDismissRequest = { showLeaveDialog = false },
            title = { Text("Unsaved counts") },
            text = { Text("You have unsaved counts. Leave without saving?") },
            confirmButton = {
                TextButton(onClick = {
                    showLeaveDialog = false
                    leaveAction?.invoke()
                }) {
                    Text("Leave")
                }
            },
            dismissButton = {
                TextButton(onClick = { showLeaveDialog = false }) {
                    Text("Stay")
                }
            }
        )
    }

    if (showCloseDialog) {
        AlertDialog(
            onDismissRequest = { showCloseDialog = false },
            title = { Text("Close stocktake period") },
            text = { Text("Closing will lock this period so a new one can start. Continue?") },
            confirmButton = {
                TextButton(onClick = {
                    showCloseDialog = false
                    closeRequested = true
                    vm.closePeriod()
                }) {
                    Text("Close")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCloseDialog = false }) {
                    Text("Cancel")
                }
            }
        )
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

    fun safe(value: Double?): Double = value ?: 0.0
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
                        val varianceColor = if (safe(row.varianceQty) < 0) primaryRed else Color(0xFF2E7D32)
                        Text(row.itemName ?: row.itemId, fontWeight = FontWeight.Bold)
                        Text(row.itemId, style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                        Text("Variant: ${row.variantKey ?: "base"}", style = MaterialTheme.typography.labelSmall)
                        Text("Opening: ${fmt(safe(row.openingQty))}  Movement: ${fmt(safe(row.movementQty))}", style = MaterialTheme.typography.bodySmall)
                        Text("Expected: ${fmt(safe(row.expectedQty))}", style = MaterialTheme.typography.bodySmall)
                        Text("Counted: ${fmt(safe(row.closingQty))}", style = MaterialTheme.typography.bodySmall)
                        Text("Variance: ${fmt(safe(row.varianceQty))}", style = MaterialTheme.typography.bodySmall, color = varianceColor)
                        if (safe(row.unitCost) > 0.0) {
                            Text("Variance value: ${fmt(safe(row.varianceCost))}", style = MaterialTheme.typography.bodySmall, color = varianceColor)
                        }
                    }
                }
            }
        }

        // Debug log intentionally hidden from UI; logs remain in Logcat.
    }
}

