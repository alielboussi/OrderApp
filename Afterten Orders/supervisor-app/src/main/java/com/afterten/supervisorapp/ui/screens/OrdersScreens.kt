package com.afterten.supervisorapp.ui.screens

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.afterten.shared.data.repo.OrderRepository
import com.afterten.shared.ui.components.AppOutlinedTextField
import com.afterten.shared.ui.components.AppScreenScaffold
import com.afterten.shared.ui.components.PrimaryButton
import com.afterten.shared.ui.components.SignaturePad
import com.afterten.shared.ui.components.rememberSignatureState
import com.afterten.shared.util.PdfSignatureBlock
import com.afterten.shared.util.generateOrderPdfDetailed
import com.afterten.shared.util.toBlackInk
import com.afterten.shared.util.toPdfGroups
import com.afterten.supervisorapp.RootViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun OrdersListScreen(
    title: String,
    statuses: List<String>,
    onBack: () -> Unit,
    onOpenOrder: (String) -> Unit,
    viewModel: RootViewModel
) {
    val session by viewModel.session.collectAsState()
    val repo = remember { OrderRepository(viewModel.supabaseProvider) }
    var orders by remember { mutableStateOf<List<OrderRepository.OrderRow>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(session?.token, statuses) {
        val jwt = session?.token ?: return@LaunchedEffect
        loading = true
        error = null
        runCatching {
            orders = repo.listWarehouseOrdersByStatus(jwt, statuses)
        }.onFailure { error = it.message }
        loading = false
    }

    AppScreenScaffold(title = title, onBack = onBack) {
        when {
            loading -> CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            error != null -> Text(error ?: "", color = MaterialTheme.colorScheme.error)
            orders.isEmpty() -> Text("No orders in this list.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> orders.forEach { order ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenOrder(order.id) },
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(order.orderNumber, fontWeight = FontWeight.SemiBold)
                        Text(order.outlet?.name ?: "Outlet", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            "Status: ${order.status}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(order.createdAt.take(19).replace('T', ' '), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
fun OrderDetailScreen(orderId: String, onBack: () -> Unit, viewModel: RootViewModel) {
    val session by viewModel.session.collectAsState()
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = remember { OrderRepository(viewModel.supabaseProvider) }
    var detail by remember { mutableStateOf<OrderRepository.OrderDetail?>(null) }
    var items by remember { mutableStateOf<List<OrderRepository.OrderItemRow>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var acting by remember { mutableStateOf(false) }
    var signerName by remember { mutableStateOf("") }
    val sigState = rememberSignatureState()

    LaunchedEffect(session?.token, orderId) {
        val jwt = session?.token ?: return@LaunchedEffect
        loading = true
        runCatching {
            detail = repo.fetchOrder(jwt, orderId)
            items = repo.listOrderItems(jwt, orderId)
        }.onFailure { error = it.message }
        loading = false
    }

    val status = detail?.status?.lowercase().orEmpty()
    val actionLabel = when (status) {
        "placed", "ordered" -> "Accept Order"
        "accepted" -> "Dispatch (Handoff)"
        else -> null
    }

    AppScreenScaffold(title = detail?.orderNumber ?: "Order", onBack = onBack) {
        when {
            loading -> CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            error != null -> Text(error ?: "", color = MaterialTheme.colorScheme.error)
            detail == null -> Text("Order not found.")
            else -> {
                val d = detail!!
                Text("Outlet: ${d.outlet?.name ?: "—"}", fontWeight = FontWeight.Medium)
                Text("Status: ${d.status}", color = MaterialTheme.colorScheme.primary)
                Text("Created: ${d.createdAt.take(19).replace('T', ' ')}")
                Text("Items", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
                items.forEach { line ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(line.name, modifier = Modifier.weight(1f))
                        Text("${line.qty} ${line.uom}")
                    }
                }
                if (actionLabel != null) {
                    AppOutlinedTextField(
                        value = signerName,
                        onValueChange = { signerName = it },
                        label = if (status == "accepted") "Driver name" else "Supervisor name",
                        modifier = Modifier.fillMaxWidth(),
                        borderColor = MaterialTheme.colorScheme.primary,
                        borderThickness = 1.5.dp
                    )
                    Text("Signature", style = MaterialTheme.typography.titleSmall)
                    SignaturePad(
                        state = sigState,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                            .padding(vertical = 8.dp)
                    )
                    PrimaryButton(
                        text = if (acting) "Submitting…" else actionLabel,
                        enabled = !acting && signerName.isNotBlank() && sigState.isMeaningful(),
                        onClick = {
                            val jwt = session?.token ?: return@PrimaryButton
                            acting = true
                            scope.launch {
                                runCatching {
                                    withContext(Dispatchers.IO) {
                                        val sigBmp = sigState.toBitmap(500, 160, colorOverride = Color.BLACK).toBlackInk()
                                        val baos = ByteArrayOutputStream()
                                        sigBmp.compress(Bitmap.CompressFormat.PNG, 100, baos)
                                        val outletId = d.outletId ?: "warehouse"
                                        val sigPath = "$outletId/supervisor-${d.orderNumber}.png"
                                        viewModel.supabaseProvider.uploadToStorage(
                                            jwt = jwt,
                                            bucket = "signatures",
                                            path = sigPath,
                                            bytes = baos.toByteArray(),
                                            contentType = "image/png",
                                            upsert = true
                                        )

                                        val created = runCatching {
                                            OffsetDateTime.parse(d.createdAt)
                                        }.getOrElse { OffsetDateTime.now(ZoneId.of("Africa/Johannesburg")) }
                                        val sigLabel = if (status == "accepted") "Handoff driver" else "Supervisor"
                                        val pdf = generateOrderPdfDetailed(
                                            cacheDir = ctx.cacheDir,
                                            context = ctx,
                                            outletName = d.outlet?.name ?: "Outlet",
                                            orderNo = d.orderNumber,
                                            orderId = d.id,
                                            status = d.status,
                                            createdAt = created,
                                            groups = items.toPdfGroups(),
                                            signatures = listOf(
                                                PdfSignatureBlock(
                                                    label = sigLabel,
                                                    name = signerName,
                                                    bitmap = sigBmp
                                                )
                                            )
                                        )
                                        val pdfPath = "$outletId/${d.orderNumber}_${DateTimeFormatter.ofPattern("yyyyMMdd").format(created)}.pdf"
                                        viewModel.supabaseProvider.uploadToStorage(
                                            jwt = jwt,
                                            bucket = "orders",
                                            path = pdfPath,
                                            bytes = pdf.readBytes(),
                                            contentType = "application/pdf",
                                            upsert = true
                                        )
                                        if (status == "accepted") {
                                            viewModel.supabaseProvider.markOrderLoaded(jwt, d.id, signerName, sigPath, pdfPath)
                                        } else {
                                            viewModel.supabaseProvider.supervisorApproveOrder(jwt, d.id, signerName, sigPath, pdfPath)
                                        }
                                    }
                                    onBack()
                                }.onFailure { e -> error = e.message }
                                acting = false
                            }
                        }
                    )
                }
            }
        }
    }
}
