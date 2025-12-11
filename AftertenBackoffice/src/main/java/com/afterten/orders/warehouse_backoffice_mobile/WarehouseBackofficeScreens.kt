package com.afterten.orders.warehouse_backoffice_mobile

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
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
import androidx.compose.foundation.border
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
import androidx.compose.ui.graphics.Brush
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

    // Web-like palette (deep navy background, neon accents)
    val navyDark = Color(0xFF060F1F)
    val navy = Color(0xFF0B1B33)
    val panel = Color(0xFF0D223D)
    val accentPrimary = Color(0xFFE63946)   // red
    val accentSecondary = Color(0xFFF97316) // amber/orange
    val accentTertiary = Color(0xFF22C55E)  // green
    val backgroundBrush = Brush.radialGradient(
        colors = listOf(navy, navyDark),
        center = androidx.compose.ui.geometry.Offset(400f, 300f),
        radius = 1200f
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundBrush)
            .padding(horizontal = 20.dp, vertical = 16.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                ElevatedButton(
                    onClick = onLogout,
                    shape = RoundedCornerShape(32.dp),
                    colors = CardDefaults.elevatedButtonColors(containerColor = panel)
                ) {
                    Text("Log out", color = Color.White)
                }
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = panel.copy(alpha = 0.9f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
            ) {
                Column(Modifier.padding(20.dp)) {
                    Text(
                        "Warehouse Backoffice",
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold, color = Color.White)
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Choose where to work today. Transfers are live now; more control rooms will plug in soon.",
                        style = MaterialTheme.typography.bodyMedium.copy(color = Color(0xFFB6C2D0))
                    )
                }
            }

            val actions = listOf(
                HomeAction("Transfers", onOpenTransfers, accentPrimary),
                HomeAction("Damages", onOpenDamages, accentSecondary),
                HomeAction("Purchases", onOpenPurchases, accentTertiary)
            )

            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(actions) { action ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(150.dp)
                            .border(1.2.dp, action.tint.copy(alpha = 0.7f), RoundedCornerShape(18.dp)),
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = panel.copy(alpha = 0.65f)),
                        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            verticalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                action.label,
                                style = MaterialTheme.typography.titleLarge.copy(
                                    fontWeight = FontWeight.SemiBold,
                                    color = action.tint
                                )
                            )
                            Button(
                                onClick = action.onClick,
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.buttonColors(containerColor = action.tint, contentColor = Color.White)
                            ) {
                                Text("Open")
                            }
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
                Button(onClick = { refresh() }, enabled = !isLoading) { Text(if (isLoading) "Refreshing..." else "Refresh") }
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
