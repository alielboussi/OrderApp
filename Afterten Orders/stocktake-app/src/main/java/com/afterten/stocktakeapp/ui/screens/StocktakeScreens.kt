package com.afterten.stocktakeapp.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.afterten.shared.data.OutletSession
import com.afterten.shared.data.RoleGuards
import com.afterten.shared.data.SupabaseProvider
import com.afterten.shared.data.hasRole
import com.afterten.shared.data.repo.OutletRepository
import com.afterten.shared.ui.components.AccessDeniedCard
import com.afterten.shared.ui.components.AppOutlinedTextField
import com.afterten.shared.ui.components.BrandHeader
import com.afterten.shared.ui.components.PrimaryButton
import com.afterten.shared.ui.theme.BrandColors
import com.afterten.stocktakeapp.RootViewModel
import kotlinx.coroutines.launch
import java.time.Instant

private data class StocktakeLineKey(val itemId: String, val variantKey: String)

private data class StocktakeProductGroup(
    val itemId: String,
    val name: String,
    val imageUrl: String?,
    val hasVariations: Boolean,
    val uom: String,
    val variants: List<SupabaseProvider.StocktakeCatalogRow>
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(onLoggedIn: (OutletSession) -> Unit, viewModel: RootViewModel) {
    val repo = remember { OutletRepository(viewModel.supabaseProvider) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    fun submit() {
        loading = true
        error = null
        scope.launch {
            try {
                val session = repo.login(email.trim(), password)
                if (!session.hasRole(RoleGuards.Stocktake) && !session.hasRole(RoleGuards.Branch) && !session.isAdmin) {
                    error = "Stocktake access required"
                    return@launch
                }
                viewModel.setSession(session)
                onLoggedIn(session)
            } catch (t: Throwable) {
                error = t.message ?: "Login failed"
            } finally {
                loading = false
            }
        }
    }

    Surface(color = BrandColors.Background, modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(24.dp))
            BrandHeader(title = "Afterten Stocktake", subtitle = "Outlet warehouse counts")
            Spacer(Modifier.height(8.dp))
            Text(
                "Sign in with your outlet credentials",
                color = BrandColors.Purple,
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(Modifier.height(24.dp))
            AppOutlinedTextField(
                value = email,
                onValueChange = { email = it.trim() },
                label = "Email",
                modifier = Modifier.fillMaxWidth(),
                borderColor = BrandColors.Red
            )
            Spacer(Modifier.height(12.dp))
            AppOutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = "Password",
                modifier = Modifier.fillMaxWidth(),
                borderColor = BrandColors.GoldDark,
                visualTransformation = PasswordVisualTransformation()
            )
            error?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = BrandColors.Red)
            }
            Spacer(Modifier.height(16.dp))
            PrimaryButton(text = if (loading) "Signing in…" else "Sign in", enabled = !loading, onClick = { submit() })
            Spacer(Modifier.height(12.dp))
            OutlinedButton(
                onClick = {
                    Toast.makeText(
                        context,
                        "Enable Google provider in Supabase Auth to use Sign in with Google",
                        Toast.LENGTH_LONG
                    ).show()
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = BrandColors.Black)
            ) {
                Text("Sign in with Google")
            }
        }
    }
}

@Composable
fun WelcomeScreen(onSelectOutlet: () -> Unit, onLogout: () -> Unit) {
    Surface(color = BrandColors.Background, modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                "Welcome to the Afterten Stocktake Portal",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = BrandColors.Black,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = onSelectOutlet,
                colors = ButtonDefaults.buttonColors(containerColor = BrandColors.Red, contentColor = BrandColors.OnRed),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Click to Select Outlet")
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
                Text("Sign out", color = BrandColors.Purple)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OutletPickerScreen(viewModel: RootViewModel, onSelected: (SupabaseProvider.OutletWarehouseOption) -> Unit, onBack: () -> Unit) {
    val session = viewModel.session.collectAsState().value ?: return
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var options by remember { mutableStateOf(listOf<SupabaseProvider.OutletWarehouseOption>()) }

    androidx.compose.runtime.LaunchedEffect(session.token) {
        loading = true
        try {
            options = viewModel.supabaseProvider.listStocktakeOutletWarehouses(session.token)
        } catch (t: Throwable) {
            error = t.message
        } finally {
            loading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Select outlet warehouse") },
                navigationIcon = { IconButton(onClick = onBack) { Text("←") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BrandColors.Background)
            )
        },
        containerColor = BrandColors.Background
    ) { padding ->
        Column(Modifier.padding(padding).padding(16.dp)) {
            when {
                loading -> CircularProgressIndicator(color = BrandColors.Red)
                error != null -> Text(error ?: "", color = BrandColors.Red)
                options.isEmpty() -> Text("No stocktake warehouses linked to your account.")
                else -> options.forEach { option ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 6.dp)
                            .clickable { onSelected(option) },
                        colors = CardDefaults.cardColors(containerColor = BrandColors.Surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text(option.outletName, fontWeight = FontWeight.Bold, color = BrandColors.Black)
                            Text(option.warehouseName, color = BrandColors.Purple)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StocktakeGridScreen(
    viewModel: RootViewModel,
    selection: SupabaseProvider.OutletWarehouseOption,
    onBack: () -> Unit
) {
    val session = viewModel.session.collectAsState().value ?: return
    if (!session.hasRole(RoleGuards.Stocktake) && !session.hasRole(RoleGuards.Branch) && !session.isAdmin) {
        AccessDeniedCard(title = "Access denied", message = "Stocktake role required.", onPrimary = onBack)
        return
    }

    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var openPeriod by remember { mutableStateOf<SupabaseProvider.StockPeriodDto?>(null) }
    var groups by remember { mutableStateOf(listOf<StocktakeProductGroup>()) }
    var variantDialog by remember { mutableStateOf<StocktakeProductGroup?>(null) }
    val qtyMap = remember { mutableStateMapOf<StocktakeLineKey, String>() }

    val countKind = if (openPeriod == null) "opening" else "closing"
    val countLabel = if (countKind == "opening") "Opening stock" else "Closing stock"

    fun reload() {
        scope.launch {
            loading = true
            error = null
            try {
                openPeriod = viewModel.supabaseProvider.fetchOpenStockPeriod(session.token, selection.warehouseId)
                val rows = viewModel.supabaseProvider.listOutletStocktakeCatalog(session.token, selection.outletId)
                groups = rows
                    .groupBy { it.itemId }
                    .map { (itemId, lines) ->
                        val head = lines.first()
                        StocktakeProductGroup(
                            itemId = itemId,
                            name = head.itemName,
                            imageUrl = head.imageUrl,
                            hasVariations = head.hasVariations || lines.any { it.variantKey != "base" },
                            uom = head.stocktakeUom ?: "each",
                            variants = lines.filter { it.variantKey != "base" || !head.hasVariations }
                        )
                    }
                    .sortedBy { it.name.lowercase() }
            } catch (t: Throwable) {
                error = t.message
            } finally {
                loading = false
            }
        }
    }

    androidx.compose.runtime.LaunchedEffect(session.token, selection.warehouseId) { reload() }

    fun completeStocktake() {
        scope.launch {
            saving = true
            error = null
            message = null
            try {
                var period = openPeriod
                if (period == null) {
                    period = viewModel.supabaseProvider.startStockPeriod(
                        session.token,
                        selection.warehouseId,
                        "Opening stocktake from Stocktake app"
                    )
                    openPeriod = period
                }
                val periodId = period?.id ?: throw IllegalStateException("No stock period")
                val lines = mutableListOf<Triple<String, String, Double>>()
                groups.forEach { group ->
                    if (group.hasVariations) {
                        group.variants.forEach { variant ->
                            val key = StocktakeLineKey(group.itemId, variant.variantKey)
                            val raw = qtyMap[key]?.trim().orEmpty()
                            if (raw.isNotEmpty()) {
                                lines.add(Triple(group.itemId, variant.variantKey, raw.toDouble()))
                            }
                        }
                    } else {
                        val key = StocktakeLineKey(group.itemId, "base")
                        val raw = qtyMap[key]?.trim().orEmpty()
                        if (raw.isNotEmpty()) {
                            lines.add(Triple(group.itemId, "base", raw.toDouble()))
                        }
                    }
                }
                if (lines.isEmpty()) throw IllegalStateException("Enter at least one quantity")
                lines.forEach { (itemId, variantKey, qty) ->
                    viewModel.supabaseProvider.recordStockCount(
                        jwt = session.token,
                        periodId = periodId,
                        itemId = itemId,
                        variantKey = variantKey,
                        kind = countKind,
                        qty = qty
                    )
                }
                val now = Instant.now().toString()
                if (countKind == "opening") {
                    viewModel.supabaseProvider.upsertOutletPeriodSummary(
                        jwt = session.token,
                        outletId = selection.outletId,
                        warehouseId = selection.warehouseId,
                        stockPeriodId = periodId,
                        status = "period_started",
                        openingAt = now
                    )
                    message = "Opening stock saved. Period started."
                } else {
                    viewModel.supabaseProvider.closeStockPeriod(session.token, periodId)
                    viewModel.supabaseProvider.upsertOutletPeriodSummary(
                        jwt = session.token,
                        outletId = selection.outletId,
                        warehouseId = selection.warehouseId,
                        stockPeriodId = periodId,
                        status = "period_closed",
                        closingAt = now
                    )
                    message = "Closing stock saved. Next period will open automatically."
                    openPeriod = null
                }
                reload()
            } catch (t: Throwable) {
                error = t.message ?: "Save failed"
            } finally {
                saving = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(selection.outletName, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(countLabel, style = MaterialTheme.typography.labelMedium, color = BrandColors.GoldDark)
                    }
                },
                navigationIcon = { IconButton(onClick = onBack) { Text("←") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BrandColors.Background)
            )
        },
        bottomBar = {
            Surface(shadowElevation = 8.dp, color = BrandColors.Background) {
                Button(
                    onClick = { completeStocktake() },
                    enabled = !saving && !loading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandColors.Purple)
                ) {
                    Text(if (saving) "Saving…" else "Complete Stocktake")
                }
            }
        },
        containerColor = BrandColors.Background
    ) { padding ->
        Column(Modifier.padding(padding).padding(horizontal = 12.dp)) {
            message?.let { Text(it, color = BrandColors.Purple, modifier = Modifier.padding(8.dp)) }
            error?.let { Text(it, color = BrandColors.Red, modifier = Modifier.padding(8.dp)) }
            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = BrandColors.Red)
                }
                groups.isEmpty() -> Text(
                    "No stocktake products configured. Use Outlet Catalog Access in the Website Portal.",
                    modifier = Modifier.padding(16.dp)
                )
                else -> LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    contentPadding = PaddingValues(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(groups, key = { it.itemId }) { group ->
                        StocktakeProductCard(
                            group = group,
                            qtyMap = qtyMap,
                            onOpenVariants = { variantDialog = group }
                        )
                    }
                }
            }
        }
    }

    variantDialog?.let { group ->
        VariantQtyDialog(
            group = group,
            qtyMap = qtyMap,
            onDismiss = { variantDialog = null }
        )
    }
}

@Composable
private fun StocktakeProductCard(
    group: StocktakeProductGroup,
    qtyMap: MutableMap<StocktakeLineKey, String>,
    onOpenVariants: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = BrandColors.Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .padding(8.dp)
                .then(if (group.hasVariations) Modifier.clickable { onOpenVariants() } else Modifier),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            AsyncImage(
                model = group.imageUrl,
                contentDescription = group.name,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(BrandColors.Background),
                contentScale = ContentScale.Crop
            )
            Text(
                group.name,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(top = 4.dp)
            )
            Text(group.uom, style = MaterialTheme.typography.labelSmall, color = BrandColors.GoldDark)
            if (group.hasVariations) {
                Text("Tap for variants", style = MaterialTheme.typography.labelSmall, color = BrandColors.Purple)
            } else {
                OutlinedTextField(
                    value = qtyMap[StocktakeLineKey(group.itemId, "base")] ?: "",
                    onValueChange = { qtyMap[StocktakeLineKey(group.itemId, "base")] = it },
                    label = { Text("Qty") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    singleLine = true
                )
            }
        }
    }
}

@Composable
private fun VariantQtyDialog(
    group: StocktakeProductGroup,
    qtyMap: MutableMap<StocktakeLineKey, String>,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {},
        title = { Text(group.name) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                group.variants.forEach { variant ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        AsyncImage(
                            model = variant.imageUrl ?: group.imageUrl,
                            contentDescription = variant.variantName,
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(6.dp)),
                            contentScale = ContentScale.Crop
                        )
                        Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                            Text(variant.variantName ?: variant.variantKey)
                            Text(variant.stocktakeUom ?: group.uom, style = MaterialTheme.typography.labelSmall)
                        }
                        OutlinedTextField(
                            value = qtyMap[StocktakeLineKey(group.itemId, variant.variantKey)] ?: "",
                            onValueChange = {
                                qtyMap[StocktakeLineKey(group.itemId, variant.variantKey)] = it
                            },
                            label = { Text("Qty") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        },
        dismissButton = {
            IconButton(onClick = onDismiss) {
                Icon(Icons.Default.Close, contentDescription = "Close")
            }
        }
    )
}
