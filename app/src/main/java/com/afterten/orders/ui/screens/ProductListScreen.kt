package com.afterten.orders.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import coil.compose.AsyncImage
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
    var syncing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(session?.token) {
        if (session?.token != null) {
            syncing = true
            error = null
            try {
                repo.syncProducts(session.token)
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
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 8.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (error != null) {
                item(key = "error") {
                    Text(
                        text = error!!,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
            items(products, key = { it.id }) { item ->
                ProductRow(root = root, item = item, onOpenVariations = {
                    showVariationsFor = item
                })
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
private fun ProductRow(root: RootViewModel, item: ProductEntity, onOpenVariations: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(
                model = item.imageUrl,
                contentDescription = null,
                modifier = Modifier.size(56.dp),
                contentScale = ContentScale.Crop
            )
            Spacer(Modifier.width(12.dp))

            // Left: product name
            Column(Modifier.weight(1f)) {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White
                )
            }

            // Middle: UOM (no label) and Cost stacked
            Column(horizontalAlignment = Alignment.End, modifier = Modifier.padding(end = 12.dp)) {
                Text(
                    text = item.uom,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White
                )
                Text(
                    text = "Cost: ${formatMoney(item.cost)}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = Color.White.copy(alpha = 0.95f)
                )
            }

            // Right: quantity stepper or variations button
            if (item.hasVariations) {
                TextButton(onClick = onOpenVariations) { Text("Variations") }
            } else {
                val qty = root.qty(item.id, null)
                QuantityStepper(
                    qty = qty,
                    onDec = { root.dec(item.id, null, item.name, item.uom, item.cost) },
                    onInc = { root.inc(item.id, null, item.name, item.uom, item.cost) }
                )
            }
        }
    }
}

@Composable
fun QuantityStepper(qty: Int, onDec: () -> Unit, onInc: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        OutlinedButton(onClick = onDec, enabled = qty > 0) { Text("-") }
        Text(text = qty.toString(), modifier = Modifier.padding(horizontal = 8.dp))
        OutlinedButton(onClick = onInc) { Text("+") }
    }
}

@Composable
private fun VariationsDialog(product: ProductEntity, root: RootViewModel, repo: ProductRepository, onDismiss: () -> Unit) {
    val variations by repo.listenVariations(product.id).collectAsState(initial = emptyList())
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Done") }
        },
        title = { Text(text = product.name) },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                variations.forEach { v -> VariationRow(root = root, v = v) }
            }
        }
    )
}

@Composable
private fun VariationRow(root: RootViewModel, v: VariationEntity) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        // Left: variation name
        Column(Modifier.weight(1f)) {
            Text(
                text = v.name,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = Color.White
            )
        }

        // Middle: UOM and Cost stacked
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.padding(end = 12.dp)) {
            Text(
                text = v.uom,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White
            )
            Text(
                text = "Cost: ${formatMoney(v.cost)}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = Color.White.copy(alpha = 0.95f)
            )
        }

        // Right: quantity stepper
        val qty = root.qty(v.productId, v.id)
        QuantityStepper(
            qty = qty,
            onDec = { root.dec(v.productId, v.id, v.name, v.uom, v.cost) },
            onInc = { root.inc(v.productId, v.id, v.name, v.uom, v.cost) }
        )
    }
}
