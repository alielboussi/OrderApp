package com.afterten.orders.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.repo.ProductRepository
import com.afterten.orders.db.AppDatabase
import com.afterten.orders.db.ProductEntity
import kotlinx.coroutines.launch

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
                    IconButton(onClick = onBack) { Icon(imageVector = Icons.Filled.ArrowBack, contentDescription = "Back") }
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
            Button(
                onClick = onContinue,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                enabled = products.isNotEmpty()
            ) { Text("Continue") }
        }
    ) { padding ->
        Column(Modifier.padding(padding)) {
            if (error != null) {
                Text(
                    text = error!!,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(16.dp)
                )
            }
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(products, key = { it.id }) { item ->
                    ProductRow(item = item, onOpenVariations = {
                        // For products with variations, we would navigate to a variation list screen
                        // TODO: navigate to variations screen with productId
                    })
                }
            }
        }
    }
}

@Composable
private fun ProductRow(item: ProductEntity, onOpenVariations: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(
                model = item.imageUrl,
                contentDescription = null,
                modifier = Modifier.size(56.dp),
                contentScale = ContentScale.Crop
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(text = item.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                Text(text = "UoM: ${item.uom} • Cost: ${item.cost}", style = MaterialTheme.typography.bodySmall)
            }
            if (item.hasVariations) {
                TextButton(onClick = onOpenVariations) { Text("Variations") }
            } else {
                QuantityStepper()
            }
        }
    }
}

@Composable
private fun QuantityStepper() {
    var qty by remember { mutableStateOf(0) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        OutlinedButton(onClick = { if (qty > 0) qty-- }) { Text("-") }
        Text(text = qty.toString(), modifier = Modifier.padding(horizontal = 8.dp))
        OutlinedButton(onClick = { qty++ }) { Text("+") }
    }
}
