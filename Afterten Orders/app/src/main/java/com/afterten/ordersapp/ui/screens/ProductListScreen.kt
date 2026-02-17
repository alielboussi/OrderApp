package com.afterten.ordersapp.ui.screens

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
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.window.Dialog
import com.afterten.ordersapp.RootViewModel
import com.afterten.ordersapp.data.repo.ProductRepository
import com.afterten.ordersapp.db.AppDatabase
import com.afterten.ordersapp.db.ProductEntity
import com.afterten.ordersapp.db.VariationEntity
import com.afterten.ordersapp.util.formatMoney
import com.afterten.ordersapp.util.formatPackageUnits
import com.afterten.ordersapp.util.ScreenLogger
import com.afterten.ordersapp.util.rememberScreenLogger
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import com.afterten.ordersapp.ui.components.AppOutlinedTextField
import androidx.compose.ui.platform.LocalContext
import com.afterten.ordersapp.data.RoleGuards
import com.afterten.ordersapp.data.hasRole
import com.afterten.ordersapp.ui.components.AccessDeniedCard

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
    val session by root.session.collectAsState()

        val hasAccess = session.hasRole(RoleGuards.Branch)
        if (!hasAccess) {
        AccessDeniedCard(
                title = "Branch access required",
                message = "Only branch (outlet) operators can place orders.",
            primaryLabel = "Back to Home",
            onPrimary = onBack
        )
        return
    }

    val products by repo.listenProducts().collectAsState(initial = emptyList())
    val allVariations by repo.listenAllVariations().collectAsState(initial = emptyList())
    var syncing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    val logger = rememberScreenLogger("ProductList")

    LaunchedEffect(Unit) { logger.enter() }
    LaunchedEffect(products.size, allVariations.size) {
        logger.state(
            "CatalogSnapshot",
            mapOf("products" to products.size, "variations" to allVariations.size)
        )
    }
    LaunchedEffect(error) { error?.let { logger.warn("InlineError", mapOf("message" to it.take(80))) } }
    LaunchedEffect(query) {
        logger.state("SearchQueryChanged", mapOf("length" to query.length))
    }

    LaunchedEffect(session?.token) {
        val currentSession = session ?: return@LaunchedEffect
        syncing = true
        error = null
        logger.state("InitialSyncStart", mapOf("hasSession" to true))
        try {
            repo.syncProducts(currentSession.token)
            repo.syncAllVariations(currentSession.token)
            logger.state("InitialSyncSuccess")
        } catch (t: Throwable) {
            error = t.message
            logger.error("InitialSyncFailed", t)
        } finally {
            syncing = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Products") },
                navigationIcon = {
                    IconButton(onClick = {
                        logger.event("BackTapped")
                        onBack()
                    }) { Icon(imageVector = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
                actions = {
                    IconButton(enabled = !syncing && session != null, onClick = {
                        logger.event("ManualSyncTapped")
                        scope.launch {
                            val token = session?.token ?: return@launch
                            logger.state("ManualSyncStart")
                            runCatching { repo.syncProducts(token) }
                                .onSuccess { logger.state("ManualSyncSuccess") }
                                .onFailure { logger.error("ManualSyncFailed", it) }
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
                    Button(
                        onClick = {
                            logger.event("ContinueTapped", mapOf("items" to count))
                            onContinue()
                        },
                        enabled = count > 0
                    ) { Text("Continue") }
                }
            }
        },
        contentWindowInsets = WindowInsets.safeDrawing
    ) { padding ->
        var showVariationsFor by remember { mutableStateOf<ProductEntity?>(null) }
        LaunchedEffect(showVariationsFor?.id) {
            showVariationsFor?.let { logger.state("VariationsDialogOpened", mapOf("productId" to it.id)) }
                ?: logger.state("VariationsDialogClosed")
        }

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

            Text(
                text = "Orders are captured in purchase pack units (cases). The conversion line shows how many consumption units are deducted per pack.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
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
                        logger = logger,
                        onOpenVariations = {
                            logger.event("VariationsTapped", mapOf("productId" to item.id))
                            showVariationsFor = item
                        }
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
                logger = logger,
                onDismiss = {
                    logger.event("VariationsDialogDismissed", mapOf("productId" to productForDialog.id))
                    showVariationsFor = null
                }
            )
        }
    }
}

@Composable
private fun ProductCard(
    root: RootViewModel,
    item: ProductEntity,
    minVariationCost: Double?,
    logger: ScreenLogger,
    onOpenVariations: () -> Unit
) {
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
                            Text(
                                text = "Order in ${item.purchasePackUnit.uppercase()}",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White
                            )
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
                            formatPackageUnits(item.unitsPerPurchasePack)?.let { units ->
                                Text(
                                    text = "1 ${item.purchasePackUnit.uppercase()} = $units ${item.consumptionUom.uppercase()}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color.White.copy(alpha = 0.85f)
                                )
                            }
                        }
                    }
                    if (item.hasVariations) {
                        TextButton(onClick = onOpenVariations) { Text("Variations") }
                    } else {
                        val cart = root.cart.collectAsState().value
                        val qty = cart["${item.id}:"]?.qty ?: 0
                        QuantityStepper(
                            qty = qty,
                            onDec = {
                                logger.event("QtyDecrement", mapOf("productId" to item.id))
                                root.dec(item.id, null, item.name, item.purchasePackUnit, item.consumptionUom, item.cost, item.unitsPerPurchasePack)
                            },
                            onInc = {
                                logger.event("QtyIncrement", mapOf("productId" to item.id))
                                root.inc(item.id, null, item.name, item.purchasePackUnit, item.consumptionUom, item.cost, item.unitsPerPurchasePack)
                            },
                            onChange = { n ->
                                logger.event("QtyChanged", mapOf("productId" to item.id, "newQty" to n))
                                root.setQty(item.id, null, item.name, item.purchasePackUnit, item.consumptionUom, item.cost, n, item.unitsPerPurchasePack)
                            }
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
                focusedIndicatorColor = MaterialTheme.colorScheme.error,
                unfocusedIndicatorColor = MaterialTheme.colorScheme.error.copy(alpha = 0.6f),
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent
            )
        )
        OutlinedButton(onClick = onInc) { Text("+") }
    }
}

@Composable
private fun VariationsDialog(
    product: ProductEntity,
    root: RootViewModel,
    repo: ProductRepository,
    logger: ScreenLogger,
    onDismiss: () -> Unit
) {
    val variations by repo.listenVariations(product.id).collectAsState(initial = emptyList())
    val session = root.session.collectAsState().value
    var loading by remember { mutableStateOf(false) }
    LaunchedEffect(product.id, session?.token) {
        if (session?.token != null) {
            loading = true
            logger.state("VariationSyncStart", mapOf("productId" to product.id))
            runCatching { repo.syncVariations(session.token, product.id) }
                .onSuccess { logger.state("VariationSyncSuccess", mapOf("productId" to product.id)) }
                .onFailure { logger.error("VariationSyncFailed", it, mapOf("productId" to product.id)) }
            loading = false
        }
    }
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(20.dp), tonalElevation = 3.dp, modifier = Modifier.fillMaxWidth(0.95f)) {
            Column(Modifier.padding(20.dp)) {
                Text(
                    text = product.name,
                    style = MaterialTheme.typography.headlineSmall,
                    color = Color.White,
                    textDecoration = TextDecoration.Underline
                )
                Spacer(Modifier.height(12.dp))
                if (loading && variations.isEmpty()) {
                    Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else {
                    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
                        variations.forEachIndexed { index, v ->
                            VariationRow(root = root, v = v, logger = logger)
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
private fun VariationRow(root: RootViewModel, v: VariationEntity, logger: ScreenLogger) {
    val cart = root.cart.collectAsState().value
    val qty = cart["${v.productId}:${v.id}"]?.qty ?: 0
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Left panel: Image with name below (wrap up to 2 lines) and cost under it
        Column(
            modifier = Modifier
                .weight(1f)
                .widthIn(min = 120.dp)
        ) {
            ProductImage(
                url = v.imageUrl,
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(8.dp)),
                contentScale = ContentScale.Crop
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = v.name,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = "Cost: ${formatMoney(v.cost)}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = Color.White.copy(alpha = 0.95f)
            )
            formatPackageUnits(v.unitsPerPurchasePack)?.let { units ->
                Text(
                    text = "1 ${v.purchasePackUnit.uppercase()} = $units ${v.consumptionUom.uppercase()}",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.85f)
                )
            }
        }

        Spacer(Modifier.width(16.dp))

        // Right: UOM centered above the qty text field, with red outlined -/+ buttons
        VariationQtyControls(
            uom = v.purchasePackUnit,
            qty = qty,
            onDec = {
                logger.event("VariationQtyDecrement", mapOf("productId" to v.productId, "variationId" to v.id))
                root.dec(v.productId, v.id, v.name, v.purchasePackUnit, v.consumptionUom, v.cost, v.unitsPerPurchasePack)
            },
            onInc = {
                logger.event("VariationQtyIncrement", mapOf("productId" to v.productId, "variationId" to v.id))
                root.inc(v.productId, v.id, v.name, v.purchasePackUnit, v.consumptionUom, v.cost, v.unitsPerPurchasePack)
            },
            onChange = { n ->
                logger.event(
                    "VariationQtyChanged",
                    mapOf("productId" to v.productId, "variationId" to v.id, "newQty" to n)
                )
                root.setQty(v.productId, v.id, v.name, v.purchasePackUnit, v.consumptionUom, v.cost, n, v.unitsPerPurchasePack)
            }
        )
    }
}

@Composable
private fun RedOutlinedCircleButton(text: String, onClick: () -> Unit, enabled: Boolean = true) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        // Pill-shaped button
        shape = RoundedCornerShape(50),
        border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.error),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = MaterialTheme.colorScheme.error,
            disabledContentColor = MaterialTheme.colorScheme.error.copy(alpha = 0.5f)
        ),
        contentPadding = PaddingValues(horizontal = 0.dp, vertical = 0.dp),
        modifier = Modifier
            .width(48.dp)
            .height(34.dp)
    ) {
        Text(text)
    }
}

@Composable
private fun VariationQtyControls(
    uom: String,
    qty: Int,
    onDec: () -> Unit,
    onInc: () -> Unit,
    onChange: (Int) -> Unit
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        RedOutlinedCircleButton(text = "-", onClick = onDec, enabled = qty > 0)
        Column(
            modifier = Modifier
                .padding(horizontal = 8.dp)
                .width(56.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = uom,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Medium,
                color = Color.White,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(
                value = qty.toString(),
                onValueChange = { s ->
                    val n = s.filter { it.isDigit() }.toIntOrNull() ?: 0
                    onChange(n.coerceAtLeast(0))
                },
                singleLine = true,
                modifier = Modifier
                    .width(56.dp),
                textStyle = LocalTextStyle.current.copy(textAlign = TextAlign.Center),
                keyboardOptions = KeyboardOptions.Default.copy(keyboardType = KeyboardType.Number),
                colors = TextFieldDefaults.colors(
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    focusedIndicatorColor = MaterialTheme.colorScheme.error,
                    unfocusedIndicatorColor = MaterialTheme.colorScheme.error.copy(alpha = 0.6f),
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent
                )
            )
        }
        RedOutlinedCircleButton(text = "+", onClick = onInc)
    }
}
