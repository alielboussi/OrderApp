package com.afterten.orders.warehouse_backoffice_mobile

import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import com.afterten.orders.BuildConfig
import com.afterten.orders.data.OutletSession
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard
import io.ktor.client.call.body
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.text.DateFormat
import java.util.Date

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun WarehouseBackofficeHomeScreen(
    sessionFlow: StateFlow<OutletSession?>,
    onOpenTransfers: () -> Unit,
    onOpenPurchases: () -> Unit,
    onOpenDamages: () -> Unit,
    onLogout: () -> Unit
) {
    val session by sessionFlow.collectAsState()
    val canAccess = session.hasRole(RoleGuards.Supervisor) || session.hasRole(RoleGuards.Administrator)

    if (!canAccess) {
        AccessDeniedCard(
            title = "Warehouse access required",
            message = "Only supervisors or administrators can manage warehouse operations.",
            primaryLabel = "Log out",
            onPrimary = onLogout
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            ElevatedButton(onClick = onLogout, shape = RoundedCornerShape(50)) {
                Text("Log out")
            }
        }
        Spacer(Modifier.height(16.dp))
        Text("Warehouse Backoffice", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(8.dp))
        Text(
            "Dedicated mobile launcher for warehouse teams. Choose an area to manage.",
            style = MaterialTheme.typography.bodyMedium
        )
        Spacer(Modifier.height(24.dp))
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(
                listOf(
                    HomeAction("Transfers", onOpenTransfers, MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)),
                    HomeAction("Purchases", onOpenPurchases, MaterialTheme.colorScheme.secondary.copy(alpha = 0.1f)),
                    HomeAction("Damages", onOpenDamages, MaterialTheme.colorScheme.tertiary.copy(alpha = 0.1f))
                )
            ) { action ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = action.tint)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(action.label, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        contentAlignment = Alignment.BottomEnd
                    ) {
                        Button(onClick = action.onClick, shape = RoundedCornerShape(12.dp)) {
                            Text("Open")
                        }
                    }
                }
            }
        }
    }
}

@Serializable
data class WarehouseDocument(
    val id: String? = null,
    val reference: String? = null,
    val status: String? = null,
    @SerialName("from_location") val fromLocation: String? = null,
    @SerialName("to_location") val toLocation: String? = null,
    @SerialName("total_lines") val totalLines: Int? = null,
    val notes: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Composable
fun WarehouseDocumentListScreen(
    title: String,
    path: String,
    sessionFlow: StateFlow<OutletSession?>,
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    val session by sessionFlow.collectAsState()
    val canAccess = session.hasRole(RoleGuards.Supervisor) || session.hasRole(RoleGuards.Administrator)

    if (!canAccess) {
        AccessDeniedCard(
            title = "Warehouse access required",
            message = "Only supervisors or administrators can manage warehouse operations.",
            primaryLabel = "Back",
            onPrimary = onBack,
            secondaryLabel = "Log out",
            onSecondary = onLogout
        )
        return
    }

    val scope = rememberCoroutineScope()
    val json = remember {
        Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true }
    }
    val client = remember {
        HttpClient(OkHttp) {
            install(ContentNegotiation) { json(json) }
            install(Logging) { level = LogLevel.NONE }
        }
    }

    var documents by remember { mutableStateOf<List<WarehouseDocument>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var lastUpdatedMillis by remember { mutableStateOf<Long?>(null) }
    val baseUrl = remember { BuildConfig.WAREHOUSE_BACKOFFICE_URL.trimEnd('/') }

    fun refresh() {
        val token = session?.token ?: return
        if (baseUrl.isEmpty()) {
            error = "WAREHOUSE_BACKOFFICE_URL is not configured"
            return
        }
        val url = "$baseUrl/${path.trimStart('/')}"
        scope.launch {
            isLoading = true
            error = null
            runCatching {
                client.get(url) {
                    header("Authorization", "Bearer $token")
                }.body<List<WarehouseDocument>>()
            }.onSuccess { list ->
                documents = list
                lastUpdatedMillis = System.currentTimeMillis()
            }.onFailure { throwable ->
                error = throwable.message ?: "Failed to load $title"
            }
            isLoading = false
        }
    }

    LaunchedEffect(session?.token, path) {
        if (session?.token != null && baseUrl.isNotEmpty()) {
            refresh()
            while (true) {
                delay(120_000L)
                refresh()
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Top
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(title, style = MaterialTheme.typography.headlineSmall)
                val lastUpdated = lastUpdatedMillis?.let { millis ->
                    val formatted = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(millis))
                    "Updated $formatted"
                }
                if (!lastUpdated.isNullOrEmpty()) {
                    Text(
                        lastUpdated,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = refresh, enabled = !isLoading) { Text(if (isLoading) "Refreshing..." else "Refresh") }
                ElevatedButton(onClick = onBack) { Text("Back") }
                ElevatedButton(onClick = onLogout, shape = RoundedCornerShape(50)) { Text("Log out") }
            }
        }
        Spacer(Modifier.height(12.dp))
        if (error != null) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Text(
                    text = error ?: "",
                    modifier = Modifier.padding(12.dp),
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
            Spacer(Modifier.height(12.dp))
        }
        if (documents.isEmpty() && !isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No records yet.", style = MaterialTheme.typography.bodyMedium)
            }
            return
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(documents.size) { idx ->
                val doc = documents[idx]
                WarehouseDocumentCard(document = doc)
            }
        }
    }
}

@Composable
private fun WarehouseDocumentCard(document: WarehouseDocument) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(document.reference ?: document.id ?: "Unknown", style = MaterialTheme.typography.titleMedium)
            Text(document.status ?: "", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(document.fromLocation?.let { "From: $it" } ?: "")
                Text(document.toLocation?.let { "To: $it" } ?: "")
            }
            Text("Lines: ${document.totalLines ?: 0}", style = MaterialTheme.typography.bodySmall)
            if (!document.notes.isNullOrBlank()) {
                Text(
                    document.notes!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )
            }
            val created = document.createdAt ?: ""
            if (created.isNotEmpty()) {
                Text(
                    "Created: $created",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )
            }
        }
    }
}

data class HomeAction(val label: String, val onClick: () -> Unit, val tint: Color)
