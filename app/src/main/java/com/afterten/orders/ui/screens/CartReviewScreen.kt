package com.afterten.orders.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel
import com.afterten.orders.util.formatMoney

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun CartReviewScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onContinue: () -> Unit
) {
    val cart = root.cart.collectAsState().value.values.toList()
    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Review Order") })
        },
        bottomBar = {
            val subtotal = cart.sumOf { it.lineTotal }
            Surface(shadowElevation = 4.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(text = "Items: ${cart.sumOf { it.qty }}")
                        Text(text = "Subtotal: ${formatMoney(subtotal)}", fontWeight = FontWeight.SemiBold)
                    }
                    Button(onClick = onContinue, enabled = cart.isNotEmpty()) { Text("Continue") }
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize(),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(cart, key = { it.key }) { item ->
                Card(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(text = item.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                            Text(text = "${item.uom} • Cost: ${formatMoney(item.unitPrice)}")
                        }
                        QuantityStepper(
                            qty = item.qty,
                            onDec = { root.dec(item.productId, item.variationId, item.name, item.uom, item.unitPrice) },
                            onInc = { root.inc(item.productId, item.variationId, item.name, item.uom, item.unitPrice) }
                        )
                    }
                }
            }
        }
    }
}
