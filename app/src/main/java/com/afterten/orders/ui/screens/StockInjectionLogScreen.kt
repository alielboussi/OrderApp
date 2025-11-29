package com.afterten.orders.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.SupabaseProvider
import com.afterten.orders.util.rememberScreenLogger
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockInjectionLogScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    embedded: Boolean = false
) {
    val session by root.session.collectAsState()
    val scope = rememberCoroutineScope()
    val logger = rememberScreenLogger("StockInjectionLog")

    LaunchedEffect(Unit) { logger.enter() }

    if (session == null) {
        logger.warn("MissingSession")
        MissingAuthMessage()
        return
    }
    if (session?.isAdmin != true) {
        logger.warn("UnauthorizedAccess")
        UnauthorizedMessage()
        return
    }

    var warehouses by remember { mutableStateOf<List<SupabaseProvider.Warehouse>>(emptyList()) }
    var selectedWarehouseId by remember { mutableStateOf<String?>(null) }
    var entries by remember { mutableStateOf<List<SupabaseProvider.StockEntryRow>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var searchText by remember { mutableStateOf("") }
    var appliedSearch by remember { mutableStateOf("") }
    var refreshKey by remember { mutableStateOf(0) }
    var selectedEntryKind by remember { mutableStateOf<SupabaseProvider.StockEntryKind?>(null) }

    LaunchedEffect(selectedWarehouseId) {
        logger.state("WarehouseFilterChanged", mapOf("warehouseId" to selectedWarehouseId))
    }
    LaunchedEffect(selectedEntryKind?.name) {
        logger.state("EntryKindFilterChanged", mapOf("kind" to selectedEntryKind?.name))
    }

    fun refreshEntries(jwt: String, warehouseId: String?, entryKind: SupabaseProvider.StockEntryKind?) {
        scope.launch {
            isLoading = true
            error = null
            logger.state(
                "LogFetchStart",
                mapOf("warehouseId" to warehouseId, "kind" to entryKind?.name)
            )
            runCatching { root.supabaseProvider.fetchStockEntries(jwt, warehouseId, entryKind) }
                .onSuccess {
                    entries = it
                    logger.state("LogFetchSuccess", mapOf("rows" to it.size))
                }
                .onFailure {
                    error = it.message
                    logger.error("LogFetchFailed", it)
                }
            isLoading = false
        }
    }

    LaunchedEffect(session?.token) {
        val jwt = session?.token ?: return@LaunchedEffect
        logger.state("WarehousesLoadStart")
        runCatching { root.supabaseProvider.listWarehouses(jwt) }
            .onSuccess { list ->
                warehouses = list.filter { it.active }
                if (selectedWarehouseId == null && list.isNotEmpty()) {
                    selectedWarehouseId = list.first().id
                }
                logger.state("WarehousesLoadSuccess", mapOf("count" to list.size))
            }
            .onFailure {
                error = it.message
                logger.error("WarehousesLoadFailed", it)
            }
    }

    LaunchedEffect(session?.token, selectedWarehouseId, refreshKey, selectedEntryKind) {
        val jwt = session?.token ?: return@LaunchedEffect
        refreshEntries(jwt, selectedWarehouseId, selectedEntryKind)
    }

    val filteredEntries = remember(entries, appliedSearch) {
        val query = appliedSearch.trim().lowercase()
        if (query.isEmpty()) entries else entries.filter { entry ->
            val productName = entry.product?.name ?: entry.productId
            val variationName = entry.variation?.name ?: ""
            productName.lowercase().contains(query) || variationName.lowercase().contains(query)
        }
    }

    val content: @Composable (Modifier) -> Unit = { modifier ->
        Column(
            modifier = modifier,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Filters", style = MaterialTheme.typography.titleMedium)
                    SimpleSelector(
                        label = "Warehouse",
                        options = listOf(null to "<All warehouses>") + warehouses.map { it.id to it.name },
                        selectedId = selectedWarehouseId,
                        onSelected = { selectedWarehouseId = it }
                    )
                    SimpleSelector(
                        label = "Entry Type",
                        options = listOf(null to "<All entry types>") + SupabaseProvider.StockEntryKind.values().map { it.apiValue to it.label },
                        selectedId = selectedEntryKind?.apiValue,
                        onSelected = { value ->
                            selectedEntryKind = SupabaseProvider.StockEntryKind.values().firstOrNull { it.apiValue == value }
                        }
                    )
                    OutlinedTextField(
                        value = searchText,
                        onValueChange = { searchText = it },
                        label = { Text("Search product or variation") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(onClick = {
                            logger.event("LogSearchApplied", mapOf("query" to searchText))
                            appliedSearch = searchText.trim()
                        }) { Text("Apply Search") }
                        OutlinedButton(onClick = {
                            logger.event("LogRefreshTriggered")
                            refreshKey++
                        }) { Text("Refresh") }
                    }
                }
            }

            if (error != null) {
                Text(error ?: "", color = MaterialTheme.colorScheme.error)
            }
            if (isLoading) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                    Text("Loading...")
                }
            }

            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (filteredEntries.isEmpty() && !isLoading) {
                    item {
                        Text("No injections recorded for the selected filters", style = MaterialTheme.typography.bodyMedium)
                    }
                } else {
                    items(filteredEntries, key = { it.id }) { entry ->
                        InjectionRow(entry)
                    }
                }
            }
        }
    }

    if (embedded) {
        content(Modifier.fillMaxWidth())
    } else {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Stock Injection Log") },
                    navigationIcon = {
                        TextButton(onClick = onBack) { Text("Back") }
                    }
                )
            }
        ) { padding ->
            content(
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp)
            )
        }
    }
}

@Composable
private fun SimpleSelector(
    label: String,
    options: List<Pair<String?, String>>,
    selectedId: String?,
    onSelected: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val current = options.firstOrNull { it.first == selectedId }?.second ?: "Select"
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        OutlinedButton(onClick = { expanded = true }) {
            Text(current, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
private fun InjectionRow(entry: SupabaseProvider.StockEntryRow) {
    val kindLabel = SupabaseProvider.StockEntryKind.fromApi(entry.entryKind)?.label
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(entry.product?.name ?: entry.productId, style = MaterialTheme.typography.titleMedium)
            entry.variation?.name?.let { Text("Variation: $it") }
            Text("${kindLabel ?: entry.entryKind} • ${entry.qty.displayQty()} units")
            Text("Recorded: ${formatTimestamp(entry.recordedAt)}")
            entry.note?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun MissingAuthMessage() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("Please sign in to continue.")
    }
}

@Composable
private fun UnauthorizedMessage() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("Admins only", color = MaterialTheme.colorScheme.error)
    }
}

private fun Double.displayQty(): String =
    if (abs(this % 1.0) < 1e-6) this.toLong().toString() else String.format(java.util.Locale.US, "%.2f", this)

private fun formatTimestamp(value: String): String =
    runCatching {
        val instant = Instant.parse(value)
        val zoned = instant.atZone(ZoneId.systemDefault())
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").format(zoned)
    }.getOrElse { value }
