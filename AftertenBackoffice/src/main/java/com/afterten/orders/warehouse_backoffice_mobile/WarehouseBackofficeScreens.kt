package com.afterten.orders.warehouse_backoffice_mobile

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberDatePickerState
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import java.text.DateFormat
import java.util.Date
import java.text.SimpleDateFormat
import java.util.Locale

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun WarehouseBackofficeHomeScreen(
    sessionFlow: StateFlow<OutletSession?>,
    onOpenTransfers: () -> Unit,
    onOpenPurchases: () -> Unit,
    onOpenDamages: () -> Unit,
    onOpenCatalog: () -> Unit,
    onBack: () -> Unit,
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
            .padding(horizontal = 20.dp, vertical = 24.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                ElevatedButton(
                    onClick = onBack,
                    shape = RoundedCornerShape(28.dp),
                    colors = ButtonDefaults.elevatedButtonColors(containerColor = panel)
                ) {
                    Text("Back", color = Color.White)
                }
                ElevatedButton(
                    onClick = onLogout,
                    shape = RoundedCornerShape(32.dp),
                    colors = ButtonDefaults.elevatedButtonColors(containerColor = panel)
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
                HomeAction("Purchases", onOpenPurchases, accentTertiary),
                HomeAction("Catalog", onOpenCatalog, Color(0xFF22C55E))
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
                                colors = ButtonDefaults.buttonColors(containerColor = action.tint, contentColor = Color.White)
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun InventoryLandingScreen(
    sessionFlow: StateFlow<OutletSession?>,
    onOpenInventory: () -> Unit,
    onOpenCatalog: () -> Unit,
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

    val navyDark = Color(0xFF060F1F)
    val navy = Color(0xFF0B1B33)
    val panel = Color(0xFF0D223D)
    val accentPrimary = Color(0xFFE63946)
    val accentCatalog = Color(0xFF22C55E)
    val backgroundBrush = Brush.radialGradient(
        colors = listOf(navy, navyDark),
        center = androidx.compose.ui.geometry.Offset(400f, 300f),
        radius = 1200f
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundBrush)
            .padding(horizontal = 20.dp, vertical = 28.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.End
            ) {
                ElevatedButton(
                    onClick = onLogout,
                    shape = RoundedCornerShape(32.dp),
                    colors = ButtonDefaults.elevatedButtonColors(containerColor = panel)
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
                        "Tap Inventory to manage transfers, damages, and purchases.",
                        style = MaterialTheme.typography.bodyMedium.copy(color = Color(0xFFB6C2D0))
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .border(1.2.dp, accentPrimary.copy(alpha = 0.7f), RoundedCornerShape(18.dp)),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = panel.copy(alpha = 0.75f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(18.dp),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        "Inventory",
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.SemiBold,
                            color = accentPrimary
                        )
                    )
                    Button(
                        onClick = onOpenInventory,
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = accentPrimary, contentColor = Color.White),
                        modifier = Modifier.height(48.dp)
                    ) {
                        Text("Open")
                    }
                }
            }

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .border(1.2.dp, accentCatalog.copy(alpha = 0.7f), RoundedCornerShape(18.dp)),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = panel.copy(alpha = 0.8f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(18.dp),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        "Catalog",
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.SemiBold,
                            color = accentCatalog
                        )
                    )
                    Text(
                        "Create products and their variants before they show up in warehouse flows.",
                        style = MaterialTheme.typography.bodySmall.copy(color = Color(0xFFB6C2D0))
                    )
                    Button(
                        onClick = onOpenCatalog,
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = accentCatalog, contentColor = Color.White),
                        modifier = Modifier.height(48.dp)
                    ) {
                        Text("Open")
                    }
                }
            }
        }
    }
}

@Composable
fun CatalogLandingScreen(
    sessionFlow: StateFlow<OutletSession?>,
    onOpenNewProduct: () -> Unit,
    onOpenProducts: () -> Unit,
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    val session by sessionFlow.collectAsState()
    val canAccess = session.hasRole(RoleGuards.Supervisor) || session.hasRole(RoleGuards.Administrator)

    if (!canAccess) {
        AccessDeniedCard(
            title = "Warehouse access required",
            message = "Only supervisors or administrators can manage warehouse catalog.",
            primaryLabel = "Back",
            onPrimary = onBack,
            secondaryLabel = "Log out",
            onSecondary = onLogout
        )
        return
    }

    val navyDark = Color(0xFF060F1F)
    val navy = Color(0xFF0B1B33)
    val panel = Color(0xFF0D223D)
    val accentGreen = Color(0xFF22C55E)
    val accentBlue = Color(0xFF7DD3FC)
    val backgroundBrush = Brush.radialGradient(
        colors = listOf(navy, navyDark),
        center = androidx.compose.ui.geometry.Offset(400f, 300f),
        radius = 1200f
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundBrush)
            .padding(horizontal = 20.dp, vertical = 28.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                ElevatedButton(
                    onClick = onBack,
                    shape = RoundedCornerShape(28.dp),
                    colors = ButtonDefaults.elevatedButtonColors(containerColor = panel)
                ) { Text("Back", color = Color.White) }
                ElevatedButton(
                    onClick = onLogout,
                    shape = RoundedCornerShape(32.dp),
                    colors = ButtonDefaults.elevatedButtonColors(containerColor = panel)
                ) { Text("Log out", color = Color.White) }
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = panel.copy(alpha = 0.9f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
            ) {
                Column(Modifier.padding(20.dp)) {
                    Text(
                        "Catalog",
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold, color = Color.White)
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Create a product first, then add variants tied to it. You can also edit existing catalog entries.",
                        style = MaterialTheme.typography.bodyMedium.copy(color = Color(0xFFB6C2D0))
                    )
                }
            }

            val cards = listOf(
                HomeAction("New Product", onOpenNewProduct, accentGreen),
                HomeAction("Products & Variants", onOpenProducts, accentBlue)
            )

            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(cards) { action ->
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
                                colors = ButtonDefaults.buttonColors(containerColor = action.tint, contentColor = Color.White)
                            ) { Text("Open") }
                        }
                    }
                }
            }
        }
    }
}

@Serializable
data class CatalogItemDto(
    val id: String? = null,
    val name: String? = null,
    val sku: String? = null,
    @SerialName("item_kind") val itemKind: String? = null,
    @SerialName("base_unit") val baseUnit: String? = null,
    @SerialName("consumption_uom") val consumptionUom: String? = null,
    @SerialName("purchase_pack_unit") val purchasePackUnit: String? = null,
    @SerialName("units_per_purchase_pack") val unitsPerPurchasePack: Double? = null,
    @SerialName("purchase_unit_mass") val purchaseUnitMass: Double? = null,
    @SerialName("purchase_unit_mass_uom") val purchaseUnitMassUom: String? = null,
    @SerialName("transfer_unit") val transferUnit: String? = null,
    @SerialName("transfer_quantity") val transferQuantity: Double? = null,
    val cost: Double? = null,
    @SerialName("has_variations") val hasVariations: Boolean = false,
    @SerialName("locked_from_warehouse_id") val lockedFromWarehouseId: String? = null,
    @SerialName("outlet_order_visible") val outletOrderVisible: Boolean = true,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("default_warehouse_id") val defaultWarehouseId: String? = null,
    val active: Boolean = true
)

@Serializable
data class CatalogVariantDto(
    val id: String? = null,
    val name: String? = null,
    val sku: String? = null,
    @SerialName("item_id") val itemId: String? = null,
    @SerialName("consumption_uom") val consumptionUom: String? = null,
    @SerialName("purchase_pack_unit") val purchasePackUnit: String? = null,
    @SerialName("units_per_purchase_pack") val unitsPerPurchasePack: Double? = null,
    @SerialName("purchase_unit_mass") val purchaseUnitMass: Double? = null,
    @SerialName("purchase_unit_mass_uom") val purchaseUnitMassUom: String? = null,
    @SerialName("transfer_unit") val transferUnit: String? = null,
    @SerialName("transfer_quantity") val transferQuantity: Double? = null,
    val cost: Double? = null,
    @SerialName("locked_from_warehouse_id") val lockedFromWarehouseId: String? = null,
    @SerialName("outlet_order_visible") val outletOrderVisible: Boolean = true,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("default_warehouse_id") val defaultWarehouseId: String? = null,
    val active: Boolean = true
)

@Serializable
private data class CatalogItemResponse(
    val item: CatalogItemDto? = null,
    val items: List<CatalogItemDto>? = null,
    val error: String? = null
)

@Serializable
private data class CatalogVariantResponse(
    val variant: CatalogVariantDto? = null,
    val variants: List<CatalogVariantDto>? = null,
    val error: String? = null
)

private val quantityUnits = listOf("each", "g", "kg", "mg", "ml", "l")
private val itemKinds = listOf("finished", "ingredient")

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun CatalogProductListScreen(
    sessionFlow: StateFlow<OutletSession?>,
    onBack: () -> Unit,
    onLogout: () -> Unit,
    onOpenProductForm: (String?) -> Unit,
    onOpenVariants: (String, String?) -> Unit
) {
    val session by sessionFlow.collectAsState()
    val canAccess = session.hasRole(RoleGuards.Supervisor) || session.hasRole(RoleGuards.Administrator)

    if (!canAccess) {
        AccessDeniedCard(
            title = "Warehouse access required",
            message = "Only supervisors or administrators can manage catalog products.",
            primaryLabel = "Back",
            onPrimary = onBack,
            secondaryLabel = "Log out",
            onSecondary = onLogout
        )
        return
    }

    val scope = rememberCoroutineScope()
    val json = remember { Json { ignoreUnknownKeys = true; isLenient = true } }
    val client = remember {
        HttpClient(OkHttp) {
            install(ContentNegotiation) { json(json) }
            install(Logging) { level = LogLevel.NONE }
        }
    }
    val baseUrl = remember { BuildConfig.WAREHOUSE_BACKOFFICE_URL.trimEnd('/') }

    var products by remember { mutableStateOf<List<CatalogItemDto>>(emptyList()) }
    var search by remember { mutableStateOf(TextFieldValue("")) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<String?>(null) }

    fun refresh() {
        val token = session?.token ?: return
        if (baseUrl.isEmpty()) {
            error = "WAREHOUSE_BACKOFFICE_URL is not configured"
            return
        }
        scope.launch {
            isLoading = true
            error = null
            runCatching {
                val body: String = client.get("$baseUrl/api/catalog/items") {
                    header("Authorization", "Bearer $token")
                    if (search.text.isNotBlank()) parameter("q", search.text.trim())
                }.body()
                json.decodeFromString(CatalogItemResponse.serializer(), body).items ?: emptyList()
            }.onSuccess { list ->
                products = list
                if (list.isEmpty()) info = "No products found yet. Add one to get started."
            }.onFailure { throwable ->
                error = throwable.message ?: "Failed to load products"
            }
            isLoading = false
        }
    }

    LaunchedEffect(session?.token) {
        if (session?.token != null && baseUrl.isNotEmpty()) refresh()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0A1626))
            .padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Catalog Products", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), color = Color.White)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ElevatedButton(onClick = onBack) { Text("Back") }
                ElevatedButton(onClick = onLogout) { Text("Log out") }
            }
        }

        OutlinedTextField(
            value = search,
            onValueChange = { search = it },
            label = { Text("Search by name or SKU") },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            singleLine = true,
            trailingIcon = {
                Button(onClick = { refresh() }, enabled = !isLoading) { Text(if (isLoading) "..." else "Go") }
            },
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent
            )
        )

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = { onOpenProductForm(null) }) { Text("Add product") }
            TextButton(onClick = { refresh() }, enabled = !isLoading) { Text("Refresh") }
        }

        if (!error.isNullOrBlank()) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Text(error ?: "", modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer)
            }
        }
        if (!info.isNullOrBlank()) {
            Text(info ?: "", color = Color(0xFFB6C2D0))
        }

        if (products.isEmpty() && isLoading) {
            Text("Loading products...", color = Color.White)
            return
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 32.dp)
        ) {
            items(products.size) { idx ->
                val item = products[idx]
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF122233))
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(item.name ?: "Unnamed product", style = MaterialTheme.typography.titleMedium, color = Color.White)
                        Text(item.sku ?: "No SKU", color = Color(0xFFB6C2D0))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Kind: ${item.itemKind ?: "ingredient"}", color = Color(0xFFB6C2D0))
                            Text(if (item.active) "Active" else "Inactive", color = if (item.active) Color(0xFF22C55E) else Color(0xFFE63946))
                            if (item.hasVariations) Text("Has variants", color = Color(0xFF7DD3FC))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Button(onClick = { onOpenProductForm(item.id) }) { Text("Edit product") }
                            Button(onClick = { item.id?.let { onOpenVariants(it, item.name) } }, enabled = item.id != null) { Text("Variants") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CatalogProductFormScreen(
    sessionFlow: StateFlow<OutletSession?>,
    itemId: String?,
    onBack: () -> Unit,
    onLogout: () -> Unit,
    onOpenVariants: (String, String?) -> Unit
) {
    val session by sessionFlow.collectAsState()
    val canAccess = session.hasRole(RoleGuards.Supervisor) || session.hasRole(RoleGuards.Administrator)

    if (!canAccess) {
        AccessDeniedCard(
            title = "Warehouse access required",
            message = "Only supervisors or administrators can manage catalog products.",
            primaryLabel = "Back",
            onPrimary = onBack,
            secondaryLabel = "Log out",
            onSecondary = onLogout
        )
        return
    }

    val scope = rememberCoroutineScope()
    val json = remember { Json { ignoreUnknownKeys = true; isLenient = true } }
    val client = remember {
        HttpClient(OkHttp) {
            install(ContentNegotiation) { json(json) }
            install(Logging) { level = LogLevel.NONE }
        }
    }
    val baseUrl = remember { BuildConfig.WAREHOUSE_BACKOFFICE_URL.trimEnd('/') }

    var name by remember { mutableStateOf("") }
    var sku by remember { mutableStateOf("") }
    var itemKind by remember { mutableStateOf(itemKinds.last()) }
    var baseUnit by remember { mutableStateOf(quantityUnits.first()) }
    var consumptionUom by remember { mutableStateOf("each") }
    var purchasePackUnit by remember { mutableStateOf("each") }
    var unitsPerPack by remember { mutableStateOf("1") }
    var purchaseUnitMass by remember { mutableStateOf("") }
    var purchaseUnitMassUom by remember { mutableStateOf("kg") }
    var transferUnit by remember { mutableStateOf("each") }
    var transferQuantity by remember { mutableStateOf("1") }
    var cost by remember { mutableStateOf("0") }
    var hasVariations by remember { mutableStateOf(false) }
    var lockedFromWarehouseId by remember { mutableStateOf("") }
    var outletOrderVisible by remember { mutableStateOf(true) }
    var imageUrl by remember { mutableStateOf("") }
    var defaultWarehouseId by remember { mutableStateOf("") }
    var active by remember { mutableStateOf(true) }

    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }

    fun buildProductPayload(): Map<String, Any?>? {
        val allowedUnits = quantityUnits.joinToString()
        val normalizedKind = itemKind.lowercase().trim()
        if (name.isBlank()) {
            error = "Name is required"
            return null
        }
        if (!itemKinds.contains(normalizedKind)) {
            error = "Item kind must be finished or ingredient"
            return null
        }

        val normalizedBaseUnit = baseUnit.lowercase().trim()
        if (!quantityUnits.contains(normalizedBaseUnit)) {
            error = "Base unit must be one of $allowedUnits"
            return null
        }

        val normalizedConsumption = consumptionUom.trim().ifBlank { "each" }
        val normalizedPurchaseUnit = purchasePackUnit.trim().ifBlank { "each" }
        val normalizedTransferUnit = transferUnit.trim().ifBlank { "each" }

        val unitsValue = unitsPerPack.toDoubleOrNull()
        if (unitsValue == null || unitsValue <= 0) {
            error = "Units per purchase pack must be greater than 0"
            return null
        }

        val transferValue = transferQuantity.toDoubleOrNull()
        if (transferValue == null || transferValue <= 0) {
            error = "Transfer quantity must be greater than 0"
            return null
        }

        val costValue = cost.toDoubleOrNull()
        if (costValue == null || costValue < 0) {
            error = "Cost must be 0 or higher"
            return null
        }

        val purchaseMassValue = purchaseUnitMass.toDoubleOrNull()
        if (purchaseUnitMass.isNotBlank() && (purchaseMassValue == null || purchaseMassValue <= 0)) {
            error = "Purchase unit mass must be greater than 0"
            return null
        }

        val normalizedPurchaseMassUom = purchaseMassValue?.let { purchaseUnitMassUom.lowercase().trim() }
        if (normalizedPurchaseMassUom != null && !quantityUnits.contains(normalizedPurchaseMassUom)) {
            error = "Purchase mass unit must be one of $allowedUnits"
            return null
        }

        error = null
        return mapOf(
            "id" to itemId,
            "name" to name.trim(),
            "sku" to sku.ifBlank { null },
            "item_kind" to normalizedKind,
            "base_unit" to normalizedBaseUnit,
            "consumption_uom" to normalizedConsumption,
            "purchase_pack_unit" to normalizedPurchaseUnit,
            "units_per_purchase_pack" to unitsValue,
            "purchase_unit_mass" to purchaseMassValue,
            "purchase_unit_mass_uom" to normalizedPurchaseMassUom,
            "transfer_unit" to normalizedTransferUnit,
            "transfer_quantity" to transferValue,
            "cost" to costValue,
            "has_variations" to hasVariations,
            "locked_from_warehouse_id" to lockedFromWarehouseId.ifBlank { null },
            "outlet_order_visible" to outletOrderVisible,
            "image_url" to imageUrl.ifBlank { null },
            "default_warehouse_id" to defaultWarehouseId.ifBlank { null },
            "active" to active
        )
    }

    fun loadExisting(id: String) {
        val token = session?.token ?: return
        if (baseUrl.isEmpty()) {
            error = "WAREHOUSE_BACKOFFICE_URL is not configured"
            return
        }
        scope.launch {
            isLoading = true
            runCatching {
                val body: String = client.get("$baseUrl/api/catalog/items") {
                    header("Authorization", "Bearer $token")
                    parameter("id", id)
                }.body()
                json.decodeFromString(CatalogItemResponse.serializer(), body).item
            }.onSuccess { dto ->
                dto?.let {
                    name = it.name.orEmpty()
                    sku = it.sku.orEmpty()
                    itemKind = it.itemKind ?: itemKinds.last()
                    baseUnit = it.baseUnit ?: quantityUnits.first()
                    consumptionUom = it.consumptionUom ?: "each"
                    purchasePackUnit = it.purchasePackUnit ?: "each"
                    unitsPerPack = it.unitsPerPurchasePack?.toString() ?: "1"
                    purchaseUnitMass = it.purchaseUnitMass?.toString() ?: ""
                    purchaseUnitMassUom = it.purchaseUnitMassUom ?: "kg"
                    transferUnit = it.transferUnit ?: "each"
                    transferQuantity = it.transferQuantity?.toString() ?: "1"
                    cost = it.cost?.toString() ?: "0"
                    hasVariations = it.hasVariations
                    lockedFromWarehouseId = it.lockedFromWarehouseId.orEmpty()
                    outletOrderVisible = it.outletOrderVisible
                    imageUrl = it.imageUrl.orEmpty()
                    defaultWarehouseId = it.defaultWarehouseId.orEmpty()
                    active = it.active
                }
            }.onFailure { throwable -> error = throwable.message ?: "Failed to load product" }
            isLoading = false
        }
    }

    fun save() {
        val token = session?.token ?: return
        if (baseUrl.isEmpty()) {
            error = "WAREHOUSE_BACKOFFICE_URL is not configured"
            return
        }
        scope.launch {
            isLoading = true
            error = null
            success = null
            val payload = buildProductPayload()
            if (payload == null) {
                isLoading = false
                return@launch
            }

            runCatching {
                val body: String = if (itemId.isNullOrBlank()) {
                    client.post("$baseUrl/api/catalog/items") {
                        header("Authorization", "Bearer $token")
                        contentType(ContentType.Application.Json)
                        setBody(payload)
                    }.body()
                } else {
                    client.put("$baseUrl/api/catalog/items") {
                        header("Authorization", "Bearer $token")
                        contentType(ContentType.Application.Json)
                        setBody(payload)
                    }.body()
                }
                json.decodeFromString(CatalogItemResponse.serializer(), body).item
            }.onSuccess { dto ->
                if (dto != null) {
                    success = if (itemId.isNullOrBlank()) "Product created" else "Product updated"
                } else {
                    error = "Unable to save product"
                }
            }.onFailure { throwable ->
                error = throwable.message ?: "Failed to save product"
            }
            isLoading = false
        }
    }

    LaunchedEffect(itemId, session?.token) {
        if (!itemId.isNullOrBlank()) loadExisting(itemId)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0A1626))
            .padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(if (itemId == null) "New Product" else "Edit Product", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), color = Color.White)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ElevatedButton(onClick = onBack) { Text("Back") }
                ElevatedButton(onClick = onLogout) { Text("Log out") }
            }
        }

        if (!error.isNullOrBlank()) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Text(error ?: "", modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer)
            }
        }
        if (!success.isNullOrBlank()) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Text(success ?: "", modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Product name") },
                supportingText = { Text("Visible in listings") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = sku,
                onValueChange = { sku = it },
                label = { Text("SKU (optional)") },
                supportingText = { Text("Use a human-friendly code") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = itemKind,
                onValueChange = { itemKind = it.lowercase() },
                label = { Text("Item kind (finished or ingredient)") },
                supportingText = { Text("Controls how the product is treated in recipes") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = baseUnit,
                onValueChange = { baseUnit = it.lowercase() },
                label = { Text("Base unit") },
                supportingText = { Text("Allowed: ${quantityUnits.joinToString()}") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = consumptionUom,
                onValueChange = { consumptionUom = it },
                label = { Text("Consumption unit") },
                supportingText = { Text("Unit used when deducting stock") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = purchasePackUnit,
                onValueChange = { purchasePackUnit = it },
                label = { Text("Purchase pack unit") },
                supportingText = { Text("Unit you buy from suppliers") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = unitsPerPack,
                onValueChange = { unitsPerPack = it },
                label = { Text("Units per purchase pack") },
                supportingText = { Text("How many base units per purchase pack") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            OutlinedTextField(
                value = purchaseUnitMass,
                onValueChange = { purchaseUnitMass = it },
                label = { Text("Purchase unit mass (optional)") },
                supportingText = { Text("Set when the pack has weight/volume") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            OutlinedTextField(
                value = purchaseUnitMassUom,
                onValueChange = { purchaseUnitMassUom = it },
                label = { Text("Purchase mass unit") },
                supportingText = { Text("Allowed: ${quantityUnits.joinToString()}") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = transferUnit,
                onValueChange = { transferUnit = it },
                label = { Text("Transfer unit") },
                supportingText = { Text("Unit used for internal transfers") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = transferQuantity,
                onValueChange = { transferQuantity = it },
                label = { Text("Transfer quantity") },
                supportingText = { Text("Default quantity when transferring") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            OutlinedTextField(
                value = cost,
                onValueChange = { cost = it },
                label = { Text("Cost per purchase unit") },
                supportingText = { Text("Numbers only, will store as double") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Switch(checked = hasVariations, onCheckedChange = { hasVariations = it })
                Text("This product has variants", color = Color.White)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Switch(checked = outletOrderVisible, onCheckedChange = { outletOrderVisible = it })
                Text("Show in outlet ordering", color = Color.White)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Switch(checked = active, onCheckedChange = { active = it })
                Text("Active", color = Color.White)
            }
            OutlinedTextField(
                value = lockedFromWarehouseId,
                onValueChange = { lockedFromWarehouseId = it },
                label = { Text("Lock from warehouse (UUID optional)") },
                supportingText = { Text("If set, prevent transfers from this warehouse") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = defaultWarehouseId,
                onValueChange = { defaultWarehouseId = it },
                label = { Text("Default warehouse (UUID optional)") },
                supportingText = { Text("Auto-select when creating docs") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = imageUrl,
                onValueChange = { imageUrl = it },
                label = { Text("Image URL (optional)") },
                supportingText = { Text("Used for previews in apps") },
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = { save() }, enabled = !isLoading) { Text(if (isLoading) "Saving..." else "Save product") }
                if (!itemId.isNullOrBlank()) {
                    Button(onClick = { onOpenVariants(itemId, name) }, enabled = itemId != null) { Text("Manage variants") }
                }
            }
        }
    }
}

@Composable
fun CatalogVariantListScreen(
    sessionFlow: StateFlow<OutletSession?>,
    itemId: String,
    itemName: String?,
    onBack: () -> Unit,
    onLogout: () -> Unit,
    onOpenVariantForm: (String?) -> Unit
) {
    val session by sessionFlow.collectAsState()
    val canAccess = session.hasRole(RoleGuards.Supervisor) || session.hasRole(RoleGuards.Administrator)

    if (!canAccess) {
        AccessDeniedCard(
            title = "Warehouse access required",
            message = "Only supervisors or administrators can manage variants.",
            primaryLabel = "Back",
            onPrimary = onBack,
            secondaryLabel = "Log out",
            onSecondary = onLogout
        )
        return
    }

    val scope = rememberCoroutineScope()
    val json = remember { Json { ignoreUnknownKeys = true; isLenient = true } }
    val client = remember {
        HttpClient(OkHttp) {
            install(ContentNegotiation) { json(json) }
            install(Logging) { level = LogLevel.NONE }
        }
    }
    val baseUrl = remember { BuildConfig.WAREHOUSE_BACKOFFICE_URL.trimEnd('/') }

    var variants by remember { mutableStateOf<List<CatalogVariantDto>>(emptyList()) }
    var search by remember { mutableStateOf(TextFieldValue("")) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun refresh() {
        val token = session?.token ?: return
        if (baseUrl.isEmpty()) {
            error = "WAREHOUSE_BACKOFFICE_URL is not configured"
            return
        }
        scope.launch {
            isLoading = true
            runCatching {
                val body: String = client.get("$baseUrl/api/catalog/variants") {
                    header("Authorization", "Bearer $token")
                    parameter("item_id", itemId)
                    if (search.text.isNotBlank()) parameter("q", search.text.trim())
                }.body()
                json.decodeFromString(CatalogVariantResponse.serializer(), body).variants ?: emptyList()
            }.onSuccess { list -> variants = list }
                .onFailure { throwable -> error = throwable.message ?: "Failed to load variants" }
            isLoading = false
        }
    }

    LaunchedEffect(session?.token, itemId) {
        if (session?.token != null && itemId.isNotBlank()) refresh()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0A1626))
            .padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Variants", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), color = Color.White)
                Text(itemName ?: "", color = Color(0xFFB6C2D0))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ElevatedButton(onClick = onBack) { Text("Back") }
                ElevatedButton(onClick = onLogout) { Text("Log out") }
            }
        }

        OutlinedTextField(
            value = search,
            onValueChange = { search = it },
            label = { Text("Search variants") },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            singleLine = true,
            trailingIcon = { Button(onClick = { refresh() }, enabled = !isLoading) { Text("Go") } },
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent
            )
        )

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = { onOpenVariantForm(null) }) { Text("Add variant") }
            TextButton(onClick = { refresh() }, enabled = !isLoading) { Text("Refresh") }
        }

        if (!error.isNullOrBlank()) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Text(error ?: "", modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer)
            }
        }

        if (variants.isEmpty() && !isLoading) {
            Text("No variants yet. Create the first one.", color = Color(0xFFB6C2D0))
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(variants.size) { idx ->
                val variant = variants[idx]
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF122233))
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(variant.name ?: "Unnamed variant", style = MaterialTheme.typography.titleMedium, color = Color.White)
                        Text(variant.sku ?: "No SKU", color = Color(0xFFB6C2D0))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(if (variant.active) "Active" else "Inactive", color = if (variant.active) Color(0xFF22C55E) else Color(0xFFE63946))
                            Text("Cost: ${variant.cost ?: 0.0}", color = Color(0xFFB6C2D0))
                        }
                        Button(onClick = { onOpenVariantForm(variant.id) }, enabled = variant.id != null) { Text("Edit") }
                    }
                }
            }
        }
    }
}

@Composable
fun CatalogVariantFormScreen(
    sessionFlow: StateFlow<OutletSession?>,
    itemId: String,
    itemName: String?,
    variantId: String?,
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    val session by sessionFlow.collectAsState()
    val canAccess = session.hasRole(RoleGuards.Supervisor) || session.hasRole(RoleGuards.Administrator)

    if (!canAccess) {
        AccessDeniedCard(
            title = "Warehouse access required",
            message = "Only supervisors or administrators can manage variants.",
            primaryLabel = "Back",
            onPrimary = onBack,
            secondaryLabel = "Log out",
            onSecondary = onLogout
        )
        return
    }

    val scope = rememberCoroutineScope()
    val json = remember { Json { ignoreUnknownKeys = true; isLenient = true } }
    val client = remember {
        HttpClient(OkHttp) {
            install(ContentNegotiation) { json(json) }
            install(Logging) { level = LogLevel.NONE }
        }
    }
    val baseUrl = remember { BuildConfig.WAREHOUSE_BACKOFFICE_URL.trimEnd('/') }

    var name by remember { mutableStateOf("") }
    var sku by remember { mutableStateOf("") }
    var consumptionUom by remember { mutableStateOf("each") }
    var purchasePackUnit by remember { mutableStateOf("each") }
    var unitsPerPack by remember { mutableStateOf("1") }
    var purchaseUnitMass by remember { mutableStateOf("") }
    var purchaseUnitMassUom by remember { mutableStateOf("kg") }
    var transferUnit by remember { mutableStateOf("each") }
    var transferQuantity by remember { mutableStateOf("1") }
    var cost by remember { mutableStateOf("0") }
    var lockedFromWarehouseId by remember { mutableStateOf("") }
    var outletOrderVisible by remember { mutableStateOf(true) }
    var imageUrl by remember { mutableStateOf("") }
    var defaultWarehouseId by remember { mutableStateOf("") }
    var active by remember { mutableStateOf(true) }

    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }

    fun buildVariantPayload(): Map<String, Any?>? {
        val allowedUnits = quantityUnits.joinToString()
        if (name.isBlank()) {
            error = "Name is required"
            return null
        }

        val normalizedConsumption = consumptionUom.trim().ifBlank { "each" }
        val normalizedPurchaseUnit = purchasePackUnit.trim().ifBlank { "each" }
        val normalizedTransferUnit = transferUnit.trim().ifBlank { "each" }

        val unitsValue = unitsPerPack.toDoubleOrNull()
        if (unitsValue == null || unitsValue <= 0) {
            error = "Units per purchase pack must be greater than 0"
            return null
        }

        val transferValue = transferQuantity.toDoubleOrNull()
        if (transferValue == null || transferValue <= 0) {
            error = "Transfer quantity must be greater than 0"
            return null
        }

        val costValue = cost.toDoubleOrNull()
        if (costValue == null || costValue < 0) {
            error = "Cost must be 0 or higher"
            return null
        }

        val purchaseMassValue = purchaseUnitMass.toDoubleOrNull()
        if (purchaseUnitMass.isNotBlank() && (purchaseMassValue == null || purchaseMassValue <= 0)) {
            error = "Purchase unit mass must be greater than 0"
            return null
        }

        val normalizedPurchaseMassUom = purchaseMassValue?.let { purchaseUnitMassUom.lowercase().trim() }
        if (normalizedPurchaseMassUom != null && !quantityUnits.contains(normalizedPurchaseMassUom)) {
            error = "Purchase mass unit must be one of $allowedUnits"
            return null
        }

        error = null
        return mapOf(
            "id" to variantId,
            "item_id" to itemId,
            "name" to name.trim(),
            "sku" to sku.ifBlank { null },
            "consumption_uom" to normalizedConsumption,
            "purchase_pack_unit" to normalizedPurchaseUnit,
            "units_per_purchase_pack" to unitsValue,
            "purchase_unit_mass" to purchaseMassValue,
            "purchase_unit_mass_uom" to normalizedPurchaseMassUom,
            "transfer_unit" to normalizedTransferUnit,
            "transfer_quantity" to transferValue,
            "cost" to costValue,
            "locked_from_warehouse_id" to lockedFromWarehouseId.ifBlank { null },
            "outlet_order_visible" to outletOrderVisible,
            "image_url" to imageUrl.ifBlank { null },
            "default_warehouse_id" to defaultWarehouseId.ifBlank { null },
            "active" to active
        )
    }

    fun loadExisting(id: String) {
        val token = session?.token ?: return
        if (baseUrl.isEmpty()) {
            error = "WAREHOUSE_BACKOFFICE_URL is not configured"
            return
        }
        scope.launch {
            isLoading = true
            runCatching {
                val body: String = client.get("$baseUrl/api/catalog/variants") {
                    header("Authorization", "Bearer $token")
                    parameter("id", id)
                }.body()
                json.decodeFromString(CatalogVariantResponse.serializer(), body).variant
            }.onSuccess { dto ->
                dto?.let {
                    name = it.name.orEmpty()
                    sku = it.sku.orEmpty()
                    consumptionUom = it.consumptionUom ?: "each"
                    purchasePackUnit = it.purchasePackUnit ?: "each"
                    unitsPerPack = it.unitsPerPurchasePack?.toString() ?: "1"
                    purchaseUnitMass = it.purchaseUnitMass?.toString() ?: ""
                    purchaseUnitMassUom = it.purchaseUnitMassUom ?: "kg"
                    transferUnit = it.transferUnit ?: "each"
                    transferQuantity = it.transferQuantity?.toString() ?: "1"
                    cost = it.cost?.toString() ?: "0"
                    lockedFromWarehouseId = it.lockedFromWarehouseId.orEmpty()
                    outletOrderVisible = it.outletOrderVisible
                    imageUrl = it.imageUrl.orEmpty()
                    defaultWarehouseId = it.defaultWarehouseId.orEmpty()
                    active = it.active
                }
            }.onFailure { throwable -> error = throwable.message ?: "Failed to load variant" }
            isLoading = false
        }
    }

    fun save() {
        val token = session?.token ?: return
        if (baseUrl.isEmpty()) {
            error = "WAREHOUSE_BACKOFFICE_URL is not configured"
            return
        }
        scope.launch {
            isLoading = true
            error = null
            success = null
            val payload = buildVariantPayload()
            if (payload == null) {
                isLoading = false
                return@launch
            }

            runCatching {
                val body: String = if (variantId.isNullOrBlank()) {
                    client.post("$baseUrl/api/catalog/variants") {
                        header("Authorization", "Bearer $token")
                        contentType(ContentType.Application.Json)
                        setBody(payload)
                    }.body()
                } else {
                    client.put("$baseUrl/api/catalog/variants") {
                        header("Authorization", "Bearer $token")
                        contentType(ContentType.Application.Json)
                        setBody(payload)
                    }.body()
                }
                json.decodeFromString(CatalogVariantResponse.serializer(), body).variant
            }.onSuccess { dto ->
                if (dto != null) {
                    success = if (variantId.isNullOrBlank()) "Variant created" else "Variant updated"
                } else {
                    error = "Unable to save variant"
                }
            }.onFailure { throwable -> error = throwable.message ?: "Failed to save variant" }
            isLoading = false
        }
    }

    LaunchedEffect(variantId, session?.token) {
        if (!variantId.isNullOrBlank()) loadExisting(variantId)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0A1626))
            .padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(if (variantId == null) "New Variant" else "Edit Variant", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), color = Color.White)
                Text(itemName ?: "", color = Color(0xFFB6C2D0))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ElevatedButton(onClick = onBack) { Text("Back") }
                ElevatedButton(onClick = onLogout) { Text("Log out") }
            }
        }

        if (!error.isNullOrBlank()) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Text(error ?: "", modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer)
            }
        }
        if (!success.isNullOrBlank()) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Text(success ?: "", modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Variant name") },
                supportingText = { Text("Required. Shown in selection lists") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = sku,
                onValueChange = { sku = it },
                label = { Text("SKU (optional)") },
                supportingText = { Text("Unique code for this variant") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = consumptionUom,
                onValueChange = { consumptionUom = it },
                label = { Text("Consumption unit") },
                supportingText = { Text("Unit when deducting stock") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = purchasePackUnit,
                onValueChange = { purchasePackUnit = it },
                label = { Text("Purchase pack unit") },
                supportingText = { Text("Unit you buy from suppliers") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = unitsPerPack,
                onValueChange = { unitsPerPack = it },
                label = { Text("Units per purchase pack") },
                supportingText = { Text("How many base units per pack") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            OutlinedTextField(
                value = purchaseUnitMass,
                onValueChange = { purchaseUnitMass = it },
                label = { Text("Purchase unit mass (optional)") },
                supportingText = { Text("Enter weight/volume if relevant") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            OutlinedTextField(
                value = purchaseUnitMassUom,
                onValueChange = { purchaseUnitMassUom = it },
                label = { Text("Purchase mass unit") },
                supportingText = { Text("Allowed: ${quantityUnits.joinToString()}") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = transferUnit,
                onValueChange = { transferUnit = it },
                label = { Text("Transfer unit") },
                supportingText = { Text("Unit used for moves") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = transferQuantity,
                onValueChange = { transferQuantity = it },
                label = { Text("Transfer quantity") },
                supportingText = { Text("Default move quantity") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            OutlinedTextField(
                value = cost,
                onValueChange = { cost = it },
                label = { Text("Cost per purchase unit") },
                supportingText = { Text("Numbers only") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Switch(checked = outletOrderVisible, onCheckedChange = { outletOrderVisible = it })
                Text("Show in outlet ordering", color = Color.White)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Switch(checked = active, onCheckedChange = { active = it })
                Text("Active", color = Color.White)
            }
            OutlinedTextField(
                value = lockedFromWarehouseId,
                onValueChange = { lockedFromWarehouseId = it },
                label = { Text("Lock from warehouse (UUID optional)") },
                supportingText = { Text("Block transfers from this warehouse") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = defaultWarehouseId,
                onValueChange = { defaultWarehouseId = it },
                label = { Text("Default warehouse (UUID optional)") },
                supportingText = { Text("Auto-select when creating docs") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = imageUrl,
                onValueChange = { imageUrl = it },
                label = { Text("Image URL (optional)") },
                supportingText = { Text("Used for previews") },
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = { save() }, enabled = !isLoading) { Text(if (isLoading) "Saving..." else "Save variant") }
                TextButton(onClick = onBack) { Text("Cancel") }
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

private data class WarehouseOption(val id: String?, val name: String)

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

    var warehouses by remember { mutableStateOf<List<WarehouseOption>>(emptyList()) }
    var documents by remember { mutableStateOf<List<WarehouseDocument>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var lastUpdatedMillis by remember { mutableStateOf<Long?>(null) }
    var search by remember { mutableStateOf(TextFieldValue("")) }
    var fromDate by remember { mutableStateOf("") }
    var toDate by remember { mutableStateOf("") }
    var fromWarehouse by remember { mutableStateOf<String?>(null) }
    var toWarehouse by remember { mutableStateOf<String?>(null) }
    val focusManager = LocalFocusManager.current
    val baseUrl = remember { BuildConfig.WAREHOUSE_BACKOFFICE_URL.trimEnd('/') }

    val isTransfers = path.contains("transfer", ignoreCase = true)
    val isPurchases = path.contains("purchase", ignoreCase = true)
    val isDamages = path.contains("damage", ignoreCase = true)

    val userDateFormatter = remember { SimpleDateFormat("dd-MM-yyyy", Locale.getDefault()).apply { isLenient = false } }
    val apiDateFormatter = remember { SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).apply { isLenient = false } }

    fun buildDateParam(raw: String): String? {
        if (raw.isBlank()) return null
        return runCatching { userDateFormatter.parse(raw) }
            .getOrNull()
            ?.let { apiDateFormatter.format(it) }
    }

    fun matchesSearch(doc: WarehouseDocument, query: String): Boolean {
        if (query.isBlank()) return true
        val q = query.lowercase()
        return listOf(
            doc.reference,
            doc.id,
            doc.status,
            doc.fromLocation,
            doc.toLocation,
            doc.notes
        ).any { it?.lowercase()?.contains(q) == true }
    }

    suspend fun loadWarehouses() {
        if (baseUrl.isEmpty()) return
        runCatching {
                val body: String = client.get("$baseUrl/api/warehouses") {
                    header("Authorization", "Bearer ${sessionFlow.value?.token ?: ""}")
                }.body()
            val element = json.parseToJsonElement(body)
            val array = (element as? JsonObject)?.get("warehouses") as? JsonArray
            val decoded = array?.let { json.decodeFromJsonElement(ListSerializer(JsonObject.serializer()), it) } ?: emptyList()
            warehouses = listOf(WarehouseOption(null, "Any warehouse")) + decoded.mapNotNull { obj ->
                val id = obj["id"]?.toString()?.trim('"')
                val name = obj["name"]?.toString()?.trim('"') ?: "Warehouse"
                if (id != null) WarehouseOption(id, name) else null
            }
        }.onFailure {
            // keep existing list; show inline error later if needed
        }
    }

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
                val body: String = client.get(url) {
                    header("Authorization", "Bearer $token")
                    buildDateParam(fromDate)?.let { parameter("startDate", it) }
                    buildDateParam(toDate)?.let { parameter("endDate", it) }
                    if (isTransfers) {
                        fromWarehouse?.let { parameter("sourceId", it) }
                        toWarehouse?.let { parameter("destId", it) }
                    } else if (isPurchases || isDamages) {
                        fromWarehouse?.let { parameter("warehouseId", it) }
                    }
                }.body()

                val element = json.parseToJsonElement(body)
                val array: JsonArray? = when (element) {
                    is JsonArray -> element
                    is JsonObject -> {
                        element["purchases"] as? JsonArray
                            ?: element["transfers"] as? JsonArray
                            ?: element["damages"] as? JsonArray
                            ?: element["data"] as? JsonArray
                            ?: element.values.firstOrNull { it is JsonArray } as? JsonArray
                    }
                    else -> null
                }

                array ?: throw IllegalStateException("Unexpected response shape for $title")

                val decoded = json.decodeFromJsonElement(ListSerializer(WarehouseDocument.serializer()), array)
                decoded.filter { matchesSearch(it, search.text) }
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
            loadWarehouses()
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
            .background(Color(0xFF0A1626))
            .padding(horizontal = 20.dp, vertical = 44.dp),
        verticalArrangement = Arrangement.Top
    ) {
        val lastUpdated = lastUpdatedMillis?.let { millis ->
            val formatted = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(millis))
            "Updated $formatted"
        }

        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                title,
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
            if (!lastUpdated.isNullOrEmpty()) {
                Text(
                    lastUpdated,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f)
                )
            }
            Spacer(Modifier.height(14.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Button(
                    onClick = { refresh() },
                    enabled = !isLoading,
                    modifier = Modifier.height(48.dp)
                ) { Text(if (isLoading) "Refreshing..." else "Refresh", style = MaterialTheme.typography.bodyMedium) }
                ElevatedButton(onClick = onBack, modifier = Modifier.height(48.dp)) { Text("Back", style = MaterialTheme.typography.bodyMedium) }
                ElevatedButton(
                    onClick = onLogout,
                    shape = RoundedCornerShape(50),
                    modifier = Modifier.height(48.dp)
                ) { Text("Log out", style = MaterialTheme.typography.bodyMedium) }
            }
        }
        Spacer(Modifier.height(32.dp))

        FilterPanel(
            isTransfers = isTransfers,
            warehouses = warehouses,
            fromWarehouse = fromWarehouse,
            toWarehouse = toWarehouse,
            onFromWarehouseChange = { fromWarehouse = it; refresh() },
            onToWarehouseChange = { toWarehouse = it; refresh() },
            fromDate = fromDate,
            toDate = toDate,
            onFromDateChange = { fromDate = it },
            onToDateChange = { toDate = it },
            search = search,
            onSearchChange = { search = it },
            onApply = {
                focusManager.clearFocus()
                refresh()
            },
            onReset = {
                fromWarehouse = null
                toWarehouse = null
                fromDate = ""
                toDate = ""
                search = TextFieldValue("")
                refresh()
            }
        )
        Spacer(Modifier.height(16.dp))
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
            Box(
                Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = true),
                contentAlignment = Alignment.Center
            ) {
                Text("No records yet.", style = MaterialTheme.typography.bodyMedium)
            }
            return
        }
        Box(Modifier.weight(1f, fill = true)) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)
            ) {
                items(documents.size) { idx ->
                    val doc = documents[idx]
                    WarehouseDocumentCard(document = doc)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilterPanel(
    isTransfers: Boolean,
    warehouses: List<WarehouseOption>,
    fromWarehouse: String?,
    toWarehouse: String?,
    onFromWarehouseChange: (String?) -> Unit,
    onToWarehouseChange: (String?) -> Unit,
    fromDate: String,
    toDate: String,
    onFromDateChange: (String) -> Unit,
    onToDateChange: (String) -> Unit,
    search: TextFieldValue,
    onSearchChange: (TextFieldValue) -> Unit,
    onApply: () -> Unit,
    onReset: () -> Unit,
) {
    val controlHeight = 56.dp
    val accentGreen = Color(0xFF22C55E)
    val dateFormatter = remember {
        SimpleDateFormat("dd-MM-yyyy", Locale.getDefault()).apply { isLenient = false }
    }
    var showFromDatePicker by remember { mutableStateOf(false) }
    var showToDatePicker by remember { mutableStateOf(false) }
    val fromPickerState = rememberDatePickerState(
        initialSelectedDateMillis = runCatching { dateFormatter.parse(fromDate)?.time }.getOrNull()
    )
    val toPickerState = rememberDatePickerState(
        initialSelectedDateMillis = runCatching { dateFormatter.parse(toDate)?.time }.getOrNull()
    )

    val datePickerScheme = MaterialTheme.colorScheme.copy(
        onSurface = Color.White,
        onSurfaceVariant = Color.White,
        primary = accentGreen,
        onPrimary = Color(0xFF0A1626)
    )
    val datePickerTypography = MaterialTheme.typography.run {
        copy(
            headlineLarge = headlineLarge.copy(fontSize = headlineLarge.fontSize * 1.08f),
            headlineMedium = headlineMedium.copy(fontSize = headlineMedium.fontSize * 1.08f),
            headlineSmall = headlineSmall.copy(fontSize = headlineSmall.fontSize * 1.08f),
            titleLarge = titleLarge.copy(fontSize = titleLarge.fontSize * 1.05f)
        )
    }
    val datePickerColors = DatePickerDefaults.colors(
        containerColor = Color(0xFF1A1F2A),
        titleContentColor = Color.White,
        headlineContentColor = Color.White,
        weekdayContentColor = Color.White,
        subheadContentColor = Color.White,
        navigationContentColor = Color.White,
        yearContentColor = Color.White,
        disabledYearContentColor = Color(0x80FFFFFF),
        selectedYearContentColor = Color.White,
        disabledSelectedYearContentColor = Color(0x80FFFFFF),
        currentYearContentColor = accentGreen,
        dayContentColor = Color.White,
        disabledDayContentColor = Color(0x66FFFFFF),
        selectedDayContentColor = Color(0xFF0A1626),
        disabledSelectedDayContentColor = Color(0x660A1626),
        selectedDayContainerColor = accentGreen,
        disabledSelectedDayContainerColor = accentGreen.copy(alpha = 0.35f),
        todayContentColor = accentGreen,
        todayDateBorderColor = accentGreen
    )

    LaunchedEffect(fromDate) {
        fromPickerState.selectedDateMillis = runCatching { dateFormatter.parse(fromDate)?.time }.getOrNull()
    }

    LaunchedEffect(toDate) {
        toPickerState.selectedDateMillis = runCatching { dateFormatter.parse(toDate)?.time }.getOrNull()
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, accentGreen.copy(alpha = 0.65f), RoundedCornerShape(18.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        if (isTransfers) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                WarehouseDropdown(
                    label = "From warehouse",
                    options = warehouses,
                    selectedId = fromWarehouse,
                    onSelect = onFromWarehouseChange,
                    modifier = Modifier
                        .weight(1f)
                        .height(controlHeight)
                )
                WarehouseDropdown(
                    label = "To warehouse",
                    options = warehouses,
                    selectedId = toWarehouse,
                    onSelect = onToWarehouseChange,
                    modifier = Modifier
                        .weight(1f)
                        .height(controlHeight)
                )
            }
        } else {
            WarehouseDropdown(
                label = "Warehouse",
                options = warehouses,
                selectedId = fromWarehouse,
                onSelect = onFromWarehouseChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(controlHeight)
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(controlHeight)
                    .clickable { showFromDatePicker = true }
            ) {
                OutlinedTextField(
                    value = fromDate,
                    onValueChange = onFromDateChange,
                    label = { Text("From date (dd-MM-yyyy)", fontSize = 11.sp) },
                    enabled = false,
                    readOnly = true,
                    modifier = Modifier.fillMaxSize(),
                    singleLine = true,
                    colors = TextFieldDefaults.colors(
                        disabledIndicatorColor = accentGreen,
                        disabledLabelColor = accentGreen,
                        disabledTextColor = Color.White,
                        disabledContainerColor = Color.Transparent,
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = accentGreen,
                        unfocusedIndicatorColor = accentGreen.copy(alpha = 0.8f),
                        focusedLabelColor = accentGreen,
                        unfocusedLabelColor = accentGreen.copy(alpha = 0.85f),
                        cursorColor = accentGreen
                    )
                )
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(controlHeight)
                    .clickable { showToDatePicker = true }
            ) {
                OutlinedTextField(
                    value = toDate,
                    onValueChange = onToDateChange,
                    label = { Text("To date (dd-MM-yyyy)", fontSize = 11.sp) },
                    enabled = false,
                    readOnly = true,
                    modifier = Modifier.fillMaxSize(),
                    singleLine = true,
                    colors = TextFieldDefaults.colors(
                        disabledIndicatorColor = accentGreen,
                        disabledLabelColor = accentGreen,
                        disabledTextColor = Color.White,
                        disabledContainerColor = Color.Transparent,
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = accentGreen,
                        unfocusedIndicatorColor = accentGreen.copy(alpha = 0.8f),
                        focusedLabelColor = accentGreen,
                        unfocusedLabelColor = accentGreen.copy(alpha = 0.85f),
                        cursorColor = accentGreen
                    )
                )
            }
        }

        OutlinedTextField(
            value = search,
            onValueChange = onSearchChange,
            label = { Text("Search everything", fontSize = 11.sp) },
            modifier = Modifier
                .fillMaxWidth()
                .height(controlHeight),
            singleLine = true,
            colors = TextFieldDefaults.colors(
                focusedIndicatorColor = accentGreen,
                unfocusedIndicatorColor = accentGreen.copy(alpha = 0.8f),
                focusedLabelColor = accentGreen,
                unfocusedLabelColor = accentGreen.copy(alpha = 0.85f),
                cursorColor = accentGreen,
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent
            )
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = onApply,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.height(controlHeight)
            ) { Text("Apply filters", style = MaterialTheme.typography.bodyMedium) }
            TextButton(onClick = onReset, modifier = Modifier.height(controlHeight)) {
                Text("Reset all filters", style = MaterialTheme.typography.bodyMedium)
            }
        }
    }

    if (showFromDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showFromDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        fromPickerState.selectedDateMillis?.let { millis ->
                            onFromDateChange(dateFormatter.format(Date(millis)))
                        }
                        showFromDatePicker = false
                    }
                ) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showFromDatePicker = false }) { Text("Cancel") }
            }
        ) {
            MaterialTheme(colorScheme = datePickerScheme, typography = datePickerTypography) {
                DatePicker(state = fromPickerState, colors = datePickerColors)
            }
        }
    }

    if (showToDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showToDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        toPickerState.selectedDateMillis?.let { millis ->
                            onToDateChange(dateFormatter.format(Date(millis)))
                        }
                        showToDatePicker = false
                    }
                ) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showToDatePicker = false }) { Text("Cancel") }
            }
        ) {
            MaterialTheme(colorScheme = datePickerScheme, typography = datePickerTypography) {
                DatePicker(state = toPickerState, colors = datePickerColors)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WarehouseDropdown(
    label: String,
    options: List<WarehouseOption>,
    selectedId: String?,
    onSelect: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val accentGreen = Color(0xFF22C55E)
    var expanded by remember { mutableStateOf(false) }
    val selectedName = options.find { it.id == selectedId }?.name ?: options.firstOrNull()?.name ?: "Any"

    Column(modifier) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold, fontSize = 11.sp),
            color = accentGreen,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(6.dp))
        Button(
            onClick = { expanded = true },
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF112338)),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .border(1.dp, accentGreen, RoundedCornerShape(12.dp))
        ) {
            Text(
                selectedName,
                color = Color.White,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center
            )
        }
        androidx.compose.material3.DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            options.forEach { option ->
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text(option.name, color = Color.White) },
                    onClick = {
                        onSelect(option.id)
                        expanded = false
                    },
                    colors = MenuDefaults.itemColors(textColor = Color.White)
                )
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
                    document.notes,
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
