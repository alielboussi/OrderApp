package com.afterten.orders.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.BrokenImage
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.ColorPainter
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.window.Dialog
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.repo.ProductRepository
import com.afterten.orders.db.AppDatabase
import com.afterten.orders.db.ProductEntity
import com.afterten.orders.db.VariationEntity
import com.afterten.orders.util.formatMoney
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import com.afterten.orders.ui.components.AppOutlinedTextField
import androidx.compose.ui.platform.LocalContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductListScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onContinue: () -> Unit
) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val repo = remember { ProductRepository(root.supabaseProvider, AppDatabase.get(ctx)) }
    val scope = rememberCoroutineScope()
    val session = root.session.collectAsState().value

    val products by repo.listenProducts().collectAsState(initial = emptyList())
    val allVariations by repo.listenAllVariations().collectAsState(initial = emptyList())
    var syncing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(session?.token) {
        if (session?.token != null) {
            syncing = true
            error = null
            try {
                repo.syncProducts(session.token)
                // fetch all variations once to power search and dialogs
                repo.syncAllVariations(session.token)
            } catch (t: Throwable) {
                error = t.message
            } finally { syncing = false }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Products") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(imageVector = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
                actions = {
                    IconButton(enabled = !syncing && session != null, onClick = {
                        scope.launch {
                            try { repo.syncProducts(session!!.token) } catch (_: Throwable) {}
                        }
                    }) {
                        Icon(imageVector = Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        },
        bottomBar = {
            val cartMap = root.cart.collectAsState().value
            val subtotal = cartMap.values.sumOf { it.lineTotal }
            val count = cartMap.values.sumOf { it.qty }
            Surface(shadowElevation = 4.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .imePadding()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(text = "$count items", style = MaterialTheme.typography.bodyMedium)
                        Text(text = "Subtotal: ${formatMoney(subtotal)}", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                    }
                    Button(onClick = onContinue, enabled = count > 0) { Text("Continue") }
                }
            }
        },
        contentWindowInsets = WindowInsets.safeDrawing
    ) { padding ->
        var showVariationsFor by remember { mutableStateOf<ProductEntity?>(null) }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Search field
        AppOutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = "Search products or variations",
                modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            )

            val minCostByProduct = remember(allVariations) {
                allVariations.groupBy { it.productId }
                    .mapValues { entry -> entry.value.minOfOrNull { it.cost } }
            }

            val filtered = remember(products, allVariations, query) {
                val q = query.trim()
                if (q.isEmpty()) products else {
                    val ql = q.lowercase()
                    val mapHasMatchVariation = allVariations
                        .filter { it.name.lowercase().contains(ql) }
                        .map { it.productId }
                        .toSet()
                    products.filter { p ->
                        p.name.lowercase().contains(ql) || mapHasMatchVariation.contains(p.id)
                    }
                }
            }

            // Grid of 2 columns
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier
                    .fillMaxSize(),
                contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 8.dp, bottom = 120.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (error != null) {
                    item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }, key = "error") {
                        Text(
                            text = error!!,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(16.dp)
                        )
                    }
                }
                items(filtered, key = { it.id }) { item ->
                    ProductCard(
                        root = root,
                        item = item,
                        minVariationCost = minCostByProduct[item.id],
                        onOpenVariations = { showVariationsFor = item }
                    )
                }
            }
        }

        val productForDialog = showVariationsFor
        if (productForDialog != null) {
            VariationsDialog(
                product = productForDialog,
                root = root,
                repo = repo,
                onDismiss = { showVariationsFor = null }
            )
        }
    }
}

@Composable
private fun ProductCard(root: RootViewModel, item: ProductEntity, minVariationCost: Double?, onOpenVariations: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1f),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(Modifier.fillMaxSize()) {
            ProductImage(
                url = item.imageUrl,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)),
                contentScale = ContentScale.Crop
            )
            Column(Modifier.padding(12.dp)) {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    maxLines = 2
                )
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        if (!item.hasVariations) {
                            Text(text = item.uom, style = MaterialTheme.typography.bodySmall, color = Color.White)
                        }
                        if (item.hasVariations) {
                            val mc = minVariationCost
                            if (mc != null && mc > 0.0) {
                                Text(
                                    text = "From ${formatMoney(mc)}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium,
                                    color = Color.White.copy(alpha = 0.95f)
                                )
                            }
                        } else {
                            Text(
                                text = "Cost: ${formatMoney(item.cost)}",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                                color = Color.White.copy(alpha = 0.95f)
                            )
                        }
                    }
                    if (item.hasVariations) {
                        TextButton(onClick = onOpenVariations) { Text("Variations") }
                    } else {
                        val cart = root.cart.collectAsState().value
                        val qty = cart["${item.id}:"]?.qty ?: 0
                        QuantityStepper(
                            qty = qty,
                            onDec = { root.dec(item.id, null, item.name, item.uom, item.cost) },
                            onInc = { root.inc(item.id, null, item.name, item.uom, item.cost) },
                            onChange = { n -> root.setQty(item.id, null, item.name, item.uom, item.cost, n) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductImage(url: String?, modifier: Modifier, contentScale: ContentScale) {
    val ctx = LocalContext.current
    var failed by remember(url) { mutableStateOf(url.isNullOrBlank()) }
    Box(modifier) {
        AsyncImage(
            model = ImageRequest.Builder(ctx)
                .data(url)
                .crossfade(true)
                .build(),
            contentDescription = null,
            contentScale = contentScale,
            placeholder = ColorPainter(Color(0xFF2A2A2A)),
            error = ColorPainter(Color(0xFF2A2A2A)),
            onError = { failed = true },
            onSuccess = { failed = false },
            modifier = Modifier.matchParentSize()
        )
        if (failed) {
            Box(Modifier.matchParentSize(), contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Filled.BrokenImage,
                    contentDescription = null,
                    tint = Color(0xFF666666)
                )
            }
        }
    }
}

@Composable
fun QuantityStepper(qty: Int, onDec: () -> Unit, onInc: () -> Unit, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        OutlinedButton(onClick = onDec, enabled = qty > 0) { Text("-") }
        OutlinedTextField(
            value = qty.toString(),
            onValueChange = { s ->
                val n = s.filter { it.isDigit() }.toIntOrNull() ?: 0
                onChange(n.coerceAtLeast(0))
            },
            singleLine = true,
            modifier = Modifier.width(64.dp).padding(horizontal = 6.dp),
            textStyle = LocalTextStyle.current.copy(textAlign = TextAlign.Center),
            keyboardOptions = KeyboardOptions.Default.copy(keyboardType = KeyboardType.Number),
            colors = TextFieldDefaults.colors(
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedIndicatorColor = Color.White,
                unfocusedIndicatorColor = Color.White.copy(alpha = 0.5f),
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent
            )
        )
        OutlinedButton(onClick = onInc) { Text("+") }
    }
}

@Composable
private fun VariationsDialog(product: ProductEntity, root: RootViewModel, repo: ProductRepository, onDismiss: () -> Unit) {
    val variations by repo.listenVariations(product.id).collectAsState(initial = emptyList())
    val session = root.session.collectAsState().value
    var loading by remember { mutableStateOf(false) }
    LaunchedEffect(product.id, session?.token) {
        if (session?.token != null) {
            loading = true
            runCatching { repo.syncVariations(session.token, product.id) }
            loading = false
        }
    }
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(20.dp), tonalElevation = 3.dp, modifier = Modifier.fillMaxWidth(0.95f)) {
            Column(Modifier.padding(20.dp)) {
                Text(text = product.name, style = MaterialTheme.typography.headlineSmall)
                Spacer(Modifier.height(12.dp))
                if (loading && variations.isEmpty()) {
                    Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else {
                    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
                        variations.forEachIndexed { index, v ->
                            VariationRow(root = root, v = v)
                            if (index < variations.lastIndex) {
                                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Done") }
                }
            }
        }
    }
}

@Composable
private fun VariationRow(root: RootViewModel, v: VariationEntity) {
    val cart = root.cart.collectAsState().value
    val qty = cart["${v.productId}:${v.id}"]?.qty ?: 0
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        // Thumbnail image (with placeholder/error) -> left
        ProductImage(
            url = v.imageUrl,
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(8.dp)),
            contentScale = ContentScale.Crop
        )
        Spacer(Modifier.width(12.dp))

        // Middle: variation name and cost under it
        Column(Modifier.weight(1f)) {
            Text(
                text = v.name,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = Color.White
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = "Cost: ${formatMoney(v.cost)}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = Color.White.copy(alpha = 0.95f)
            )
        }

        // Right: UOM above qty controls
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(start = 12.dp)) {
            Text(text = v.uom, style = MaterialTheme.typography.bodySmall, color = Color.White)
            Spacer(Modifier.height(6.dp))
            QuantityStepper(
                qty = qty,
                onDec = { root.dec(v.productId, v.id, v.name, v.uom, v.cost) },
                onInc = { root.inc(v.productId, v.id, v.name, v.uom, v.cost) },
                onChange = { n -> root.setQty(v.productId, v.id, v.name, v.uom, v.cost, n) }
            )
        }
    }
}
