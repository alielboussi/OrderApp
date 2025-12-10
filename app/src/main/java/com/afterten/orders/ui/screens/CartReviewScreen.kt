package com.afterten.orders.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import com.afterten.orders.data.repo.ProductRepository
import com.afterten.orders.db.AppDatabase
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import com.afterten.orders.RootViewModel
import com.afterten.orders.util.formatMoney
import com.afterten.orders.util.formatPackageUnits
import com.afterten.orders.util.rememberScreenLogger
import androidx.compose.material3.HorizontalDivider
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun CartReviewScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onContinue: () -> Unit
) {
    val session by root.session.collectAsState()
    val cart = root.cart.collectAsState().value.values.toList()
    val ctx = LocalContext.current
    val repo = remember { ProductRepository(root.supabaseProvider, AppDatabase.get(ctx)) }
    val products by repo.listenProducts().collectAsState(initial = emptyList())
    val logger = rememberScreenLogger("CartReview")

    if (!session.hasRole(RoleGuards.Outlet)) {
        AccessDeniedCard(
            title = "Outlet access required",
            message = "Only outlet operators can review carts and submit orders.",
            primaryLabel = "Back to Home",
            onPrimary = onBack
        )
        return
    }

    LaunchedEffect(Unit) { logger.enter(mapOf("initialItems" to cart.size)) }
    LaunchedEffect(cart) {
        logger.state(
            "CartChanged",
            mapOf(
                "lines" to cart.size,
                "totalQty" to cart.sumOf { it.qty },
                "subtotal" to cart.sumOf { it.lineTotal }
            )
        )
    }
    LaunchedEffect(products.size) {
        logger.state("ProductsLoaded", mapOf("count" to products.size))
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Review Order") },
                navigationIcon = {
                    IconButton(onClick = {
                        logger.event("BackTapped")
                        onBack()
                    }) {
                        Icon(imageVector = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        },
        bottomBar = {
            val subtotal = cart.sumOf { it.lineTotal }
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
                        Text(text = "Items: ${cart.sumOf { it.qty }}", color = Color.White)
                        Text(text = "Subtotal: ${formatMoney(subtotal)}", fontWeight = FontWeight.SemiBold, color = Color.White)
                    }
                    Button(
                        onClick = {
                            logger.event("ContinueTapped", mapOf("hasItems" to cart.isNotEmpty()))
                            onContinue()
                        },
                        enabled = cart.isNotEmpty()
                    ) { Text("Continue") }
                }
            }
        },
        contentWindowInsets = WindowInsets.safeDrawing
    ) { padding ->
        // Group items by product so all variations for a product stay together,
        // then render a red divider between product groups
        val nameByProduct = products.associateBy({ it.id }, { it.name })
        val groups = cart.groupBy { it.productId }.entries
            .sortedBy { it.value.firstOrNull()?.name ?: "" }

        LazyColumn(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize(),
            contentPadding = PaddingValues(start = 12.dp, top = 12.dp, end = 12.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item(key = "package_contains_note") {
                    Text(
                        text = "Quantities below are in purchase pack units. Each pack deducts the listed consumption UOM count.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.85f),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                )
            }
            groups.forEachIndexed { gIndex, entry ->
                val items = entry.value
                item(key = "group_${entry.key}") {
                    Column(Modifier.fillMaxWidth()) {
                        // Group header: big centered product name, underlined
                        val header = nameByProduct[entry.key] ?: (items.firstOrNull()?.name ?: "")
                        Text(
                            text = header,
                            style = MaterialTheme.typography.titleLarge.copy(fontSize = 48.sp),
                            color = Color.White,
                            textDecoration = TextDecoration.Underline,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                        )
                        items.forEach { item ->
                            // Divider before each variance/item
                            HorizontalDivider(color = MaterialTheme.colorScheme.error.copy(alpha = 0.5f))
                            Card(Modifier.fillMaxWidth()) {
                                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(
                                            text = item.name,
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color.White,
                                            maxLines = 3,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Spacer(Modifier.height(4.dp))
                                        Text(
                                            text = "Cost: ${formatMoney(item.unitPrice)}  •  Amount: ${formatMoney(item.lineTotal)}",
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = Color.White.copy(alpha = 0.9f)
                                        )
                                        formatPackageUnits(item.unitsPerPurchasePack)?.let { units ->
                                            Text(
                                                text = "1 ${item.purchasePackUnit.uppercase()} = $units ${item.consumptionUom.uppercase()}",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = Color.White.copy(alpha = 0.85f)
                                            )
                                        }
                                    }

                                    ReviewQtyControls(
                                        uom = item.purchasePackUnit,
                                        qty = item.qty,
                                        onDec = {
                                            logger.event("QtyDecrement", mapOf("productId" to item.productId, "variationId" to (item.variationId ?: "")))
                                            root.dec(item.productId, item.variationId, item.name, item.purchasePackUnit, item.consumptionUom, item.unitPrice, item.unitsPerPurchasePack)
                                        },
                                        onInc = {
                                            logger.event("QtyIncrement", mapOf("productId" to item.productId, "variationId" to (item.variationId ?: "")))
                                            root.inc(item.productId, item.variationId, item.name, item.purchasePackUnit, item.consumptionUom, item.unitPrice, item.unitsPerPurchasePack)
                                        },
                                        onChange = { n ->
                                            logger.event(
                                                "QtyChanged",
                                                mapOf(
                                                    "productId" to item.productId,
                                                    "variationId" to (item.variationId ?: ""),
                                                    "newQty" to n
                                                )
                                            )
                                            root.setQty(item.productId, item.variationId, item.name, item.purchasePackUnit, item.consumptionUom, item.unitPrice, n, item.unitsPerPurchasePack)
                                        }
                                    )
                                }
                            }
                            Spacer(Modifier.height(6.dp))
                            // Divider after each variance/item
                            HorizontalDivider(color = MaterialTheme.colorScheme.error.copy(alpha = 0.5f))
                        }
                        if (gIndex < groups.lastIndex) {
                            HorizontalDivider(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 8.dp),
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RedOutlinedPillButton(text: String, onClick: () -> Unit, enabled: Boolean = true) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(50),
        border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.error),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = MaterialTheme.colorScheme.error,
            disabledContentColor = MaterialTheme.colorScheme.error.copy(alpha = 0.5f)
        ),
        contentPadding = PaddingValues(0.dp),
        modifier = Modifier
            .width(48.dp)
            .height(34.dp)
    ) { Text(text) }
}

@Composable
private fun ReviewQtyControls(
    uom: String,
    qty: Int,
    onDec: () -> Unit,
    onInc: () -> Unit,
    onChange: (Int) -> Unit
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        RedOutlinedPillButton(text = "-", onClick = onDec, enabled = qty > 0)
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
                modifier = Modifier.width(56.dp),
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
        RedOutlinedPillButton(text = "+", onClick = onInc)
    }
}
