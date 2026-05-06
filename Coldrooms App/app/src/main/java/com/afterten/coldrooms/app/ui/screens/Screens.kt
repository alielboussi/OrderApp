@file:OptIn(ExperimentalMaterial3Api::class)

package com.afterten.coldrooms.app.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ContentValues
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.SyncAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.graphics.scale
import androidx.core.net.toUri
import androidx.lifecycle.LifecycleOwner
import coil.compose.AsyncImage
import com.afterten.coldrooms.app.R
import com.afterten.coldrooms.app.data.DamageItemRequest
import com.afterten.coldrooms.app.data.LoginUser
import com.afterten.coldrooms.app.data.PurchaseItemRequest
import com.afterten.coldrooms.app.data.Repository
import com.afterten.coldrooms.app.data.SessionStore
import com.afterten.coldrooms.app.data.Supplier
import com.afterten.coldrooms.app.data.TransferItemRequest
import com.afterten.coldrooms.app.data.Warehouse
import com.afterten.coldrooms.app.data.WarehouseItem
import com.afterten.coldrooms.app.data.WarehouseStockRow
import com.afterten.coldrooms.app.ui.theme.BluePrimary
import com.afterten.coldrooms.app.ui.theme.GraySurface
import com.afterten.coldrooms.app.ui.theme.GreenPositive
import com.afterten.coldrooms.app.ui.theme.RedNegative
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.io.ByteArrayOutputStream
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private const val LOG_TAG = "ColdroomsDebug"

private fun logDebug(screen: String, message: String) {
  Log.d(LOG_TAG, "[$screen] $message")
}

private fun logItemsSample(screen: String, label: String, items: List<WarehouseItem>) {
  val sample = items.take(10).joinToString { item ->
    val variant = item.variantId ?: "base"
    "${item.itemId}:$variant:${formatQty(item.onHandUnits())}"
  }
  logDebug(screen, "$label count=${items.size} sample=[$sample]")
}

private fun logStockSample(screen: String, label: String, rows: List<WarehouseStockRow>) {
  val sample = rows.take(10).joinToString { row ->
    val variant = row.variantKey ?: "base"
    val qty = row.netUnits ?: 0.0
    "${row.itemId}:$variant:${formatQty(qty)}"
  }
  logDebug(screen, "$label count=${rows.size} sample=[$sample]")
}

val WAREHOUSE_IDS = listOf(
  "d4ad6512-6d0b-448f-b407-e74b0eb80edb",
  "89e4a592-1385-4b40-9685-2178f124a9da",
  "94f86655-bed8-404c-8614-007a846f89f2",
  "647ca589-f688-4c9a-b137-78efedd5dbf5",
  "32ad8045-1526-4aaa-85d9-e762b9ec8bcc",
  "99547ec7-3220-40c8-859b-29d26ca5a4ca",
  "9a55ecbd-aa45-4f02-9e16-f567b8779674",
  "9885ad87-66e0-46ec-8872-ce58c524b739",
  "6c488b69-e793-45e0-a744-441924f5f4bb",
  "d829d739-7311-4647-af91-cad33c21280e",
  "9d0a3a83-1fea-45a8-8771-25cc1db9f07e"
)

private suspend fun listAllowedItemsForWarehouse(
  repo: Repository,
  token: String,
  warehouseId: String
): List<WarehouseItem> {
  val allowedItemIds = ALLOWED_PRODUCT_IDS.toList()
  val (allowedVariantRows, allowedItemRows, stockRows) = coroutineScope {
    val variantsDeferred = async {
      repo
        .listCatalogVariantsByIds(token, ALLOWED_VARIANT_IDS.toList())
        .filter { ALLOWED_PRODUCT_IDS.contains(it.itemId) }
    }
    val itemsDeferred = async { repo.listCatalogItemsByIds(token, allowedItemIds) }
    val stockDeferred = async { repo.listWarehouseStockItems(token, warehouseId, allowedItemIds) }
    Triple(variantsDeferred.await(), itemsDeferred.await(), stockDeferred.await())
  }
  val itemsById = allowedItemRows.associateBy { it.id }
  val variantsByItem = allowedVariantRows.groupBy { it.itemId }
  val stockByKey = stockRows.associateBy { stockKey(it.itemId, it.variantKey) }

  val merged = mutableListOf<WarehouseItem>()
  allowedItemIds.forEach { itemId ->
    val item = itemsById[itemId] ?: return@forEach
    val baseStock = stockByKey[stockKey(item.id, null)]
    merged.add(
      WarehouseItem(
        itemId = item.id,
        variantId = null,
        itemName = item.name,
        variantName = null,
        sku = item.sku,
        onHand = baseStock?.netUnits ?: 0.0,
        imageUrl = item.imageUrl,
        consumptionUom = item.consumptionUom,
        purchasePackUnit = item.purchasePackUnit,
        transferUnit = item.transferUnit,
        transferQuantity = item.transferQuantity
      )
    )

    val variants = variantsByItem[item.id].orEmpty()
    variants.forEach { variant ->
      val stock = stockByKey[stockKey(item.id, variant.id)]
      merged.add(
        WarehouseItem(
          itemId = item.id,
          variantId = variant.id,
          itemName = item.name,
          variantName = variant.name,
          sku = variant.sku,
          onHand = stock?.netUnits ?: 0.0,
          imageUrl = variant.imageUrl ?: item.imageUrl,
          consumptionUom = variant.consumptionUom ?: item.consumptionUom,
          purchasePackUnit = item.purchasePackUnit,
          transferUnit = item.transferUnit,
          transferQuantity = item.transferQuantity
        )
      )
    }
  }

  logStockSample("ColdroomItems", "warehouse stock", stockRows)
  logItemsSample("ColdroomItems", "allowed catalog", merged)
  return merged
}

val PURCHASE_SUPPLIER_IDS = setOf(
  "52d80bde-82e5-4c0c-b65f-38e21f4162fa",
  "6f63a8f4-204c-4e38-a8bb-2bfa73584151",
  "a24fb040-307f-41f5-9751-768daf52e96b",
  "c7fd97d7-ef1a-4cc0-9125-836e15bb4ba4",
  "ec184b19-4810-46e6-966b-3e3b60bfc4ee"
)

val TRANSFER_TO_ONLY_WAREHOUSE_IDS = setOf(
  "0c9ddd9e-d42c-475f-9232-5e9d649b0916"
)

val ALLOWED_PRODUCT_IDS = setOf(
  "4b340326-5f47-492f-924b-4771e434ea60",
  "23c47055-cd8f-430b-83a4-08b97eef1c9d",
  "88bcd552-5560-403a-bd79-f43e374a0755",
  "db361d3b-6e00-435b-b242-d94306b3ba35",
  "84119987-fd59-496e-9140-001860eb10fa",
  "c446a48f-7193-44c8-a828-d6888543de6f"
)

val ALLOWED_VARIANT_IDS = setOf(
  "3b86b0c2-1621-4c69-bdd8-0cb2cd5e30ac",
  "798b89bf-df72-4604-8af0-73b368dc4075",
  "1d7b2532-5ac4-45c4-993e-30c57099ffbc",
  "84a62432-988c-4727-b4e0-40e5862e2a34",
  "4313479e-0f97-4197-a638-bee916bf4a07",
  "741ff69e-78fe-475a-a067-c16d55c49ca4",
  "79f68b7a-b82b-4432-a2b2-00f7ef1b1651",
  "99de4912-8811-4322-a930-2b7769ec0da8",
  "baf373b5-bb2b-4fdf-ac4c-66d707826073",
  "db34ac2f-0ed9-43b9-90d6-a02e287a139c",
  "d550d20b-78f8-434f-a079-b7613cc00512",
  "234b67ec-aa6b-4d59-a3b3-19beecb00d8c",
  "5729f377-6d00-438c-b98c-70708c029567",
  "313da1a5-60c7-4375-adf1-5d6c000d2c69",
  "3747d538-c356-45a2-ad36-1bf11b00dd33",
  "ca6c3236-05e9-42ad-a771-1c03a25dd5f1",
  "296ff0f5-e5bc-4778-97b9-ce5e936ff8b3"
)

private fun WarehouseItem.isColdroomsAllowed(): Boolean {
  if (itemId !in ALLOWED_PRODUCT_IDS) return false
  val variantKey = (variantId ?: "base").lowercase()
  return variantKey == "base" || variantId in ALLOWED_VARIANT_IDS
}

class TransferState {
  var fromWarehouseId: String? = null
  var toWarehouseId: String? = null
  var selectedItemId: String? = null
  var selectedItemName: String? = null
  var availableItems: List<WarehouseItem> = emptyList()
  var pdfFileName: String? = null
  var pdfUploaded: Boolean = false
  val items = mutableStateListOf<TransferLine>()

  fun reset() {
    fromWarehouseId = null
    toWarehouseId = null
    selectedItemId = null
    selectedItemName = null
    availableItems = emptyList()
    pdfFileName = null
    pdfUploaded = false
    items.clear()
  }
}

class DamageState {
  var warehouseId: String? = null
  var selectedItemId: String? = null
  var selectedItemName: String? = null
  var availableItems: List<WarehouseItem> = emptyList()
  var pdfFileName: String? = null
  var pdfUploaded: Boolean = false
  val items = mutableStateListOf<TransferLine>()

  fun reset() {
    warehouseId = null
    selectedItemId = null
    selectedItemName = null
    availableItems = emptyList()
    pdfFileName = null
    pdfUploaded = false
    items.clear()
  }
}

class PurchaseState {
  var supplierId: String? = null
  var invoiceNumber by mutableStateOf("")
  var warehouseId: String? = null
  var selectedItemId: String? = null
  var selectedItemName: String? = null
  var availableItems: List<WarehouseItem> = emptyList()
  val items = mutableStateListOf<PurchaseLine>()

  fun reset() {
    supplierId = null
    invoiceNumber = ""
    warehouseId = null
    selectedItemId = null
    selectedItemName = null
    availableItems = emptyList()
    items.clear()
  }
}

data class TransferLine(
  val item: WarehouseItem,
  var quantity: Double
)

data class PurchaseLine(
  val item: WarehouseItem,
  var quantity: Double,
  var unitCost: Double?
)

data class ItemGroup(
  val itemId: String,
  val itemName: String,
  val variants: List<WarehouseItem>
)

data class TransferSummaryLine(
  val label: String,
  val qtyText: String
)

data class TransferSummaryGroup(
  val baseName: String,
  val lines: List<TransferSummaryLine>
)

@Composable
fun LoginScreen(repo: Repository, onLogin: (String, LoginUser) -> Unit) {
  LaunchedEffect(Unit) {
    logDebug("Login", "screen open")
  }
  val emailState = rememberSaveable { mutableStateOf("") }
  val pinState = rememberSaveable { mutableStateOf("") }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  val isEmailValid = emailState.value.trim().isNotBlank()
  val isPinValid = pinState.value.trim().length == 5

  Scaffold(topBar = {
    TopAppBar(
      title = {
        Text(
          "Coldrooms",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
      }
    )
  }) { padding ->
    Column(
      modifier = Modifier
        .padding(padding)
        .padding(20.dp)
        .fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = emailState.value,
        onValueChange = { emailState.value = it },
        label = { Text("Email") }
      )
      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = pinState.value,
        onValueChange = {
          val digitsOnly = it.filter { ch -> ch.isDigit() }.take(5)
          pinState.value = digitsOnly
        },
        label = { Text("PIN") },
        visualTransformation = PasswordVisualTransformation('*')
      )
      if (errorState.value != null) {
        Text(errorState.value ?: "", color = RedNegative)
      }
      Button(
        modifier = Modifier.fillMaxWidth(),
        enabled = !loadingState.value && isEmailValid && isPinValid,
        onClick = {
          errorState.value = null
          loadingState.value = true
          scope.launch {
            runCatching {
              repo.login(emailState.value.trim(), pinState.value.trim())
            }.onSuccess {
              Log.i("Login", "Success for ${it.user.email}")
              onLogin(it.token, it.user)
            }.onFailure {
              Log.e("Login", "Failed: ${it.message}", it)
              errorState.value = it.message ?: "Login failed"
            }
            loadingState.value = false
          }
        }
      ) {
        Text(if (loadingState.value) "Signing in..." else "Login")
      }
    }
  }
}

@Composable
fun DashboardScreen(
  user: LoginUser?,
  onTransfers: () -> Unit,
  onPurchases: () -> Unit,
  onDamages: () -> Unit,
  onLogout: () -> Unit
) {
  LaunchedEffect(Unit) {
    logDebug("Dashboard", "screen open user=${user?.id ?: ""}")
  }
  Scaffold(topBar = {
    TopAppBar(
      title = {
        Text(
          "Coldrooms App",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
      },
      actions = {
        IconButton(onClick = onLogout) {
          Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Logout")
        }
      }
    )
  }) { padding ->
    Column(
      modifier = Modifier
        .padding(padding)
        .padding(20.dp)
        .fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
      Text(
        text = "Welcome ${user?.displayName ?: user?.email ?: ""}",
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center
      )
      Text(
        text = "V1.1",
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center
      )
      LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxWidth()
      ) {
        item {
          ActionCard(
            title = "Transfers",
            subtitle = "Move stock between warehouses",
            icon = Icons.Filled.SyncAlt,
            onClick = onTransfers
          )
        }
        item {
          ActionCard(
            title = "Purchases",
            subtitle = "Record inbound stock receipts",
            icon = Icons.Filled.Receipt,
            onClick = onPurchases
          )
        }
        item {
          ActionCard(
            title = "Damages",
            subtitle = "Record damaged stock",
            icon = Icons.Filled.Receipt,
            onClick = onDamages
          )
        }
      }
    }
  }
}

@Composable
private fun ActionCard(
  title: String,
  subtitle: String,
  icon: androidx.compose.ui.graphics.vector.ImageVector,
  onClick: () -> Unit
) {
  Card(
    modifier = Modifier
      .fillMaxWidth()
      .aspectRatio(1f)
      .heightIn(min = 120.dp)
      .clickable { onClick() },
    shape = RoundedCornerShape(16.dp),
    colors = CardDefaults.cardColors(containerColor = GraySurface)
  ) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(16.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Icon(
        imageVector = icon,
        contentDescription = null,
        tint = BluePrimary,
        modifier = Modifier.size(32.dp)
      )
      Spacer(Modifier.height(10.dp))
      Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
      Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Color.DarkGray, textAlign = TextAlign.Center)
    }
  }
}

@Composable
fun TransferItemsScreen(
  repo: Repository,
  token: String?,
  sessionStore: SessionStore,
  state: TransferState,
  warehouseIds: List<String>,
  onBack: () -> Unit,
  onShowVariants: () -> Unit,
  onReview: () -> Unit
) {
  val itemsState = remember { mutableStateOf<List<WarehouseItem>>(emptyList()) }
  val fromWarehousesState = remember { mutableStateOf<List<Warehouse>>(emptyList()) }
  val toWarehousesState = remember { mutableStateOf<List<Warehouse>>(emptyList()) }
  val fromWarehouseState = remember { mutableStateOf<Warehouse?>(null) }
  val toWarehouseState = remember { mutableStateOf<Warehouse?>(null) }
  val fromDialogOpen = rememberSaveable { mutableStateOf(false) }
  val toDialogOpen = rememberSaveable { mutableStateOf(false) }
  val fromSelection = remember { mutableStateOf<Warehouse?>(null) }
  val toSelection = remember { mutableStateOf<Warehouse?>(null) }
  val singleItemDialog = remember { mutableStateOf<WarehouseItem?>(null) }
  val queryState = rememberSaveable { mutableStateOf("") }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  val scanOpen = rememberSaveable { mutableStateOf(false) }
  val refreshTick = remember { mutableStateOf(0) }

  LaunchedEffect(Unit) {
    logDebug("TransferItems", "screen open")
  }

  LaunchedEffect(token) {
    if (token == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val fromWarehouses = repo.listWarehousesByIds(token, warehouseIds).sortedBy { it.name }
      val toWarehouses = repo
        .listWarehousesByIds(token, (warehouseIds + TRANSFER_TO_ONLY_WAREHOUSE_IDS).distinct())
        .sortedBy { it.name }
      logDebug(
        "TransferItems",
        "warehouses loaded from=${fromWarehouses.size} to=${toWarehouses.size}"
      )
      fromWarehousesState.value = fromWarehouses
      toWarehousesState.value = toWarehouses
      val storedFrom = sessionStore.getLastTransferFromWarehouseId()
      val storedTo = sessionStore.getLastTransferToWarehouseId()
      if (state.fromWarehouseId == null) state.fromWarehouseId = storedFrom
      if (state.toWarehouseId == null) state.toWarehouseId = storedTo
      logDebug(
        "TransferItems",
        "stored from=${storedFrom ?: ""} to=${storedTo ?: ""}"
      )
      fromSelection.value = fromWarehouses.firstOrNull { it.id == state.fromWarehouseId }
      toSelection.value = toWarehouses.firstOrNull { it.id == state.toWarehouseId }
      if (state.fromWarehouseId != null && fromSelection.value == null) {
        state.fromWarehouseId = null
      }
      if (state.toWarehouseId != null && toSelection.value == null) {
        state.toWarehouseId = null
      }
      fromDialogOpen.value = state.fromWarehouseId == null
      toDialogOpen.value = state.fromWarehouseId != null && state.toWarehouseId == null
    }.onFailure {
      if (it is CancellationException) return@onFailure
      errorState.value = it.message ?: "Failed to load warehouse data"
    }
    loadingState.value = false
  }

  LaunchedEffect(token, state.fromWarehouseId, refreshTick.value) {
    if (token == null || state.fromWarehouseId == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val rawItems = listAllowedItemsForWarehouse(repo, token, state.fromWarehouseId!!)
      val items = rawItems.filter { it.isColdroomsAllowed() }
      logItemsSample("TransferItems", "raw items", rawItems)
      logItemsSample("TransferItems", "allowed items", items)
      itemsState.value = items
      state.availableItems = items
    }.onFailure {
      if (it is CancellationException) return@onFailure
      errorState.value = it.message ?: "Failed to load transfer data"
    }
    loadingState.value = false
  }

  if (scanOpen.value) {
    BarcodeScannerScreen(
      onScanned = { code ->
        queryState.value = code
        scanOpen.value = false
      },
      onClose = { scanOpen.value = false }
    )
    return
  }

  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Transfer Items") },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
        }
      },
      actions = {
        TextButton(onClick = { refreshTick.value += 1 }) {
          Text("Refresh now")
        }
      }
    )
  }) { padding ->
    Column(
      modifier = Modifier
        .padding(padding)
        .padding(16.dp)
        .fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      if (fromDialogOpen.value && fromWarehousesState.value.isNotEmpty()) {
        AlertDialog(
          onDismissRequest = { },
          title = { Text("From warehouse") },
          text = {
            WarehouseButtonGrid(
              label = "From",
              warehouses = fromWarehousesState.value,
              selected = fromSelection.value,
              onSelected = { fromSelection.value = it }
            )
          },
          confirmButton = {
            TextButton(
              enabled = fromSelection.value != null,
              onClick = {
                val selected = fromSelection.value
                if (selected != null) {
                  fromWarehouseState.value = selected
                  state.fromWarehouseId = selected.id
                  state.items.clear()
                  scope.launch {
                    sessionStore.setLastTransferFromWarehouseId(selected.id)
                  }
                  fromDialogOpen.value = false
                  toDialogOpen.value = state.toWarehouseId == null
                }
              }
            ) {
              Text("Continue")
            }
          }
        )
      }

      if (toDialogOpen.value && toWarehousesState.value.isNotEmpty()) {
        AlertDialog(
          onDismissRequest = { },
          title = { Text("To warehouse") },
          text = {
            WarehouseButtonGrid(
              label = "To",
              warehouses = toWarehousesState.value,
              selected = toSelection.value,
              onSelected = { toSelection.value = it }
            )
          },
          confirmButton = {
            TextButton(
              enabled = toSelection.value != null,
              onClick = {
                val selected = toSelection.value
                if (selected != null) {
                  toWarehouseState.value = selected
                  state.toWarehouseId = selected.id
                  scope.launch {
                    sessionStore.setLastTransferToWarehouseId(selected.id)
                  }
                  toDialogOpen.value = false
                }
              }
            ) {
              Text("Continue")
            }
          }
        )
      }

      if (fromDialogOpen.value || toDialogOpen.value) {
        return@Column
      }

      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = queryState.value,
        onValueChange = { queryState.value = it },
        label = { Text("Search or scan") },
        trailingIcon = {
          IconButton(onClick = { scanOpen.value = true }) {
            Icon(Icons.Filled.QrCodeScanner, contentDescription = "Scan")
          }
        }
      )

      if (errorState.value != null) {
        Text(errorState.value ?: "", color = RedNegative)
      }

      if (loadingState.value) {
        Text("Loading items...")
      }

      val query = queryState.value.trim().lowercase()
      val variantMatches = if (query.isBlank()) {
        emptyList()
      } else {
        itemsState.value.filter { item ->
          val isVariant = (item.variantId ?: "base").lowercase() != "base"
          if (!isVariant) return@filter false
          listOfNotNull(item.variantName, item.variantId, item.sku)
            .any { it.lowercase().contains(query) }
        }
      }
      val matchingItemIds = if (query.isBlank()) {
        emptySet()
      } else {
        itemsState.value
          .filter { item ->
            listOfNotNull(item.itemName, item.sku)
              .any { it.lowercase().contains(query) }
          }
          .map { it.itemId }
          .toSet()
      }
      val baseCandidates = if (query.isBlank()) {
        itemsState.value
      } else {
        itemsState.value.filter { it.itemId in matchingItemIds }
      }

      if (query.isNotBlank() && variantMatches.isNotEmpty()) {
        VariantGrid(
          items = variantMatches.sortedBy { variantSortKey(it) },
          modifier = Modifier.weight(1f),
          onItemClick = {
            if (it.onHandUnits() <= 0.0) {
              errorState.value = "No stock available"
            } else {
              singleItemDialog.value = it
            }
          }
        )
      } else {
        val groupedItems = groupItems(baseCandidates)
        BaseItemGrid(
          items = groupedItems,
          modifier = Modifier.weight(1f),
          onItemClick = { group ->
            if (groupHasVariants(group)) {
              state.selectedItemId = group.itemId
              state.selectedItemName = group.itemName
              onShowVariants()
            } else {
              val item = group.variants.firstOrNull()
              if (item != null && item.onHandUnits() <= 0.0) {
                errorState.value = "No stock available"
              } else {
                singleItemDialog.value = item
              }
            }
          }
        )
      }

      Spacer(Modifier.height(8.dp))

      Button(
        modifier = Modifier.fillMaxWidth(),
        enabled = state.items.isNotEmpty(),
        onClick = {
          if (state.fromWarehouseId == null) {
            fromDialogOpen.value = true
          } else if (state.toWarehouseId == null) {
            toDialogOpen.value = true
          } else {
            onReview()
          }
        }
      ) {
        Text("Transfer (${state.items.size})")
      }
    }
  }

  if (singleItemDialog.value != null) {
    QtyEntryDialog(
      item = singleItemDialog.value!!,
      onDismiss = { singleItemDialog.value = null },
      onSave = { qty ->
        val item = singleItemDialog.value!!
        val existing = state.items.firstOrNull { it.item.itemId == item.itemId && it.item.variantId == item.variantId }
        if (existing == null) {
          state.items.add(TransferLine(item, qty))
        } else {
          existing.quantity = qty
        }
        singleItemDialog.value = null
      }
    )
  }
}

@Composable
fun TransferVariantsScreen(
  state: TransferState,
  onBack: () -> Unit
) {
  LaunchedEffect(Unit) {
    logDebug("TransferVariants", "screen open")
  }
  val selectedId = state.selectedItemId
  val title = state.selectedItemName ?: "Variants"
  val queryState = rememberSaveable { mutableStateOf("") }
  val scanOpen = rememberSaveable { mutableStateOf(false) }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val variants = state.availableItems
    .filter { it.itemId == selectedId }
    .filterNot { (it.variantId ?: "base").lowercase() == "base" }
  val filtered = variants.filter { item ->
    val q = queryState.value.trim().lowercase()
    if (q.isEmpty()) true else {
      listOfNotNull(item.variantName, item.variantId, item.sku).any { it.lowercase().contains(q) }
    }
  }.sortedBy { variantSortKey(it) }

  val dialogItem = remember { mutableStateOf<WarehouseItem?>(null) }

  LaunchedEffect(selectedId, state.availableItems.size) {
    logDebug(
      "TransferVariants",
      "selectedId=${selectedId ?: ""} available=${state.availableItems.size}"
    )
  }

  if (scanOpen.value) {
    BarcodeScannerScreen(
      onScanned = { code ->
        queryState.value = code
        scanOpen.value = false
      },
      onClose = { scanOpen.value = false }
    )
    return
  }

  Scaffold(topBar = {
    TopAppBar(
      title = { Text(title) },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
        }
      }
    )
  }) { padding ->
    Column(
      modifier = Modifier
        .padding(padding)
        .padding(16.dp)
        .fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = queryState.value,
        onValueChange = { queryState.value = it },
        label = { Text("Search or scan") },
        trailingIcon = {
          IconButton(onClick = { scanOpen.value = true }) {
            Icon(Icons.Filled.QrCodeScanner, contentDescription = "Scan")
          }
        }
      )

      if (errorState.value != null) {
        Text(errorState.value ?: "", color = RedNegative)
      }

      if (variants.isEmpty()) {
        Text("No variants available.")
      } else {
        VariantGrid(
          items = filtered,
          modifier = Modifier.weight(1f),
          onItemClick = {
            if (it.onHandUnits() <= 0.0) {
              errorState.value = "No stock available"
            } else {
              dialogItem.value = it
            }
          }
        )
      }
    }
  }

  if (dialogItem.value != null) {
    QtyEntryDialog(
      item = dialogItem.value!!,
      onDismiss = { dialogItem.value = null },
      onSave = { qty ->
        val item = dialogItem.value!!
        val existing = state.items.firstOrNull { it.item.itemId == item.itemId && it.item.variantId == item.variantId }
        if (existing == null) {
          state.items.add(TransferLine(item, qty))
        } else {
          existing.quantity = qty
        }
        dialogItem.value = null
      }
    )
  }
}

@Composable
fun DamageItemsScreen(
  repo: Repository,
  token: String?,
  sessionStore: SessionStore,
  state: DamageState,
  warehouseIds: List<String>,
  onBack: () -> Unit,
  onShowVariants: () -> Unit,
  onReview: () -> Unit
) {
  val itemsState = remember { mutableStateOf<List<WarehouseItem>>(emptyList()) }
  val warehousesState = remember { mutableStateOf<List<Warehouse>>(emptyList()) }
  val warehouseSelection = remember { mutableStateOf<Warehouse?>(null) }
  val warehouseDialogOpen = rememberSaveable { mutableStateOf(false) }
  val singleItemDialog = remember { mutableStateOf<WarehouseItem?>(null) }
  val queryState = rememberSaveable { mutableStateOf("") }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val scanOpen = rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  val refreshTick = remember { mutableStateOf(0) }

  LaunchedEffect(Unit) {
    logDebug("DamageItems", "screen open")
  }

  LaunchedEffect(token) {
    if (token == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val warehouses = repo.listWarehousesByIds(token, warehouseIds).sortedBy { it.name }
      logDebug("DamageItems", "warehouses loaded count=${warehouses.size}")
      warehousesState.value = warehouses
      if (state.warehouseId == null) {
        state.warehouseId = sessionStore.getLastDamageWarehouseId()
      }
      warehouseSelection.value = warehouses.firstOrNull { it.id == state.warehouseId }
      if (state.warehouseId != null && warehouseSelection.value == null) {
        state.warehouseId = null
      }
      warehouseDialogOpen.value = state.warehouseId == null
    }.onFailure {
      if (it is CancellationException) return@onFailure
      errorState.value = it.message ?: "Failed to load warehouse data"
    }
    loadingState.value = false
  }

  LaunchedEffect(token, state.warehouseId, refreshTick.value) {
    if (token == null || state.warehouseId == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val rawItems = listAllowedItemsForWarehouse(repo, token, state.warehouseId!!)
      val items = rawItems.filter { it.isColdroomsAllowed() }
      logItemsSample("DamageItems", "raw items", rawItems)
      logItemsSample("DamageItems", "allowed items", items)
      itemsState.value = items
      state.availableItems = items
    }.onFailure {
      if (it is CancellationException) return@onFailure
      errorState.value = it.message ?: "Failed to load items"
    }
    loadingState.value = false
  }

  if (scanOpen.value) {
    BarcodeScannerScreen(
      onScanned = { code ->
        queryState.value = code
        scanOpen.value = false
      },
      onClose = { scanOpen.value = false }
    )
    return
  }

  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Damage Items") },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
        }
      },
      actions = {
        TextButton(onClick = { refreshTick.value += 1 }) {
          Text("Refresh now")
        }
      }
    )
  }) { padding ->
    Column(
      modifier = Modifier
        .padding(padding)
        .padding(16.dp)
        .fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      if (warehouseDialogOpen.value && warehousesState.value.isNotEmpty()) {
        AlertDialog(
          onDismissRequest = { },
          title = { Text("Select warehouse") },
          text = {
            WarehouseButtonGrid(
              label = "Warehouse",
              warehouses = warehousesState.value,
              selected = warehouseSelection.value,
              onSelected = { warehouseSelection.value = it }
            )
          },
          confirmButton = {
            TextButton(
              enabled = warehouseSelection.value != null,
              onClick = {
                val selected = warehouseSelection.value
                if (selected != null) {
                  state.warehouseId = selected.id
                  state.items.clear()
                  scope.launch {
                    sessionStore.setLastDamageWarehouseId(selected.id)
                  }
                  warehouseDialogOpen.value = false
                }
              }
            ) {
              Text("Continue")
            }
          }
        )
      }

      if (warehouseDialogOpen.value) {
        return@Column
      }

      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = queryState.value,
        onValueChange = { queryState.value = it },
        label = { Text("Search or scan") },
        trailingIcon = {
          IconButton(onClick = { scanOpen.value = true }) {
            Icon(Icons.Filled.QrCodeScanner, contentDescription = "Scan")
          }
        }
      )

      if (errorState.value != null) {
        Text(errorState.value ?: "", color = RedNegative)
      }

      if (loadingState.value) {
        Text("Loading items...")
      }

      val query = queryState.value.trim().lowercase()
      val variantMatches = if (query.isBlank()) {
        emptyList()
      } else {
        itemsState.value.filter { item ->
          val isVariant = (item.variantId ?: "base").lowercase() != "base"
          if (!isVariant) return@filter false
          listOfNotNull(item.variantName, item.variantId, item.sku)
            .any { it.lowercase().contains(query) }
        }
      }
      val matchingItemIds = if (query.isBlank()) {
        emptySet()
      } else {
        itemsState.value
          .filter { item ->
            listOfNotNull(item.itemName, item.sku)
              .any { it.lowercase().contains(query) }
          }
          .map { it.itemId }
          .toSet()
      }
      val baseCandidates = if (query.isBlank()) {
        itemsState.value
      } else {
        itemsState.value.filter { it.itemId in matchingItemIds }
      }

      if (query.isNotBlank() && variantMatches.isNotEmpty()) {
        VariantGrid(
          items = variantMatches.sortedBy { variantSortKey(it) },
          modifier = Modifier.weight(1f),
          onItemClick = {
            if (it.onHandUnits() <= 0.0) {
              errorState.value = "No stock available"
            } else {
              singleItemDialog.value = it
            }
          }
        )
      } else {
        val groupedItems = groupItems(baseCandidates)
        BaseItemGrid(
          items = groupedItems,
          modifier = Modifier.weight(1f),
          onItemClick = { group ->
            if (groupHasVariants(group)) {
              state.selectedItemId = group.itemId
              state.selectedItemName = group.itemName
              onShowVariants()
            } else {
              val item = group.variants.firstOrNull()
              if (item != null && item.onHandUnits() <= 0.0) {
                errorState.value = "No stock available"
              } else {
                singleItemDialog.value = item
              }
            }
          }
        )
      }

      Spacer(Modifier.height(8.dp))

      Button(
        modifier = Modifier.fillMaxWidth(),
        enabled = state.items.isNotEmpty(),
        onClick = onReview
      ) {
        Text("Damage (${state.items.size})")
      }
    }
  }

  if (singleItemDialog.value != null) {
    DamageQtyDialog(
      item = singleItemDialog.value!!,
      onDismiss = { singleItemDialog.value = null },
      onSave = { qty ->
        val item = singleItemDialog.value!!
        val existing = state.items.firstOrNull { it.item.itemId == item.itemId && it.item.variantId == item.variantId }
        if (existing == null) {
          state.items.add(TransferLine(item, qty))
        } else {
          existing.quantity = qty
        }
        singleItemDialog.value = null
      }
    )
  }
}

@Composable
fun DamageVariantsScreen(
  repo: Repository,
  token: String?,
  state: DamageState,
  onBack: () -> Unit
) {
  LaunchedEffect(Unit) {
    logDebug("DamageVariants", "screen open")
  }
  val selectedId = state.selectedItemId
  val title = state.selectedItemName ?: "Variants"
  val queryState = rememberSaveable { mutableStateOf("") }
  val scanOpen = rememberSaveable { mutableStateOf(false) }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val refreshTick = remember { mutableStateOf(0) }
  val variants = state.availableItems
    .filter { it.itemId == selectedId }
    .filterNot { (it.variantId ?: "base").lowercase() == "base" }
  val filtered = variants.filter { item ->
    val q = queryState.value.trim().lowercase()
    if (q.isEmpty()) true else {
      listOfNotNull(item.variantName, item.variantId, item.sku).any { it.lowercase().contains(q) }
    }
  }.sortedBy { variantSortKey(it) }

  val dialogItem = remember { mutableStateOf<WarehouseItem?>(null) }

  LaunchedEffect(selectedId, state.availableItems.size) {
    logDebug(
      "DamageVariants",
      "selectedId=${selectedId ?: ""} available=${state.availableItems.size}"
    )
  }

  LaunchedEffect(token, state.warehouseId, refreshTick.value) {
    if (token == null || state.warehouseId == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val rawItems = listAllowedItemsForWarehouse(repo, token, state.warehouseId!!)
      val items = rawItems.filter { it.isColdroomsAllowed() }
      logItemsSample("DamageVariants", "raw items", rawItems)
      logItemsSample("DamageVariants", "allowed items", items)
      state.availableItems = items
    }.onFailure {
      if (it is CancellationException) return@onFailure
      errorState.value = it.message ?: "Failed to load items"
    }
    loadingState.value = false
  }

  if (scanOpen.value) {
    BarcodeScannerScreen(
      onScanned = { code ->
        queryState.value = code
        scanOpen.value = false
      },
      onClose = { scanOpen.value = false }
    )
    return
  }

  Scaffold(topBar = {
    TopAppBar(
      title = { Text(title) },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
        }
      },
      actions = {
        TextButton(onClick = { refreshTick.value += 1 }) {
          Text("Refresh now")
        }
      }
    )
  }) { padding ->
    Column(
      modifier = Modifier
        .padding(padding)
        .padding(16.dp)
        .fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = queryState.value,
        onValueChange = { queryState.value = it },
        label = { Text("Search or scan") },
        trailingIcon = {
          IconButton(onClick = { scanOpen.value = true }) {
            Icon(Icons.Filled.QrCodeScanner, contentDescription = "Scan")
          }
        }
      )

      if (errorState.value != null) {
        Text(errorState.value ?: "", color = RedNegative)
      }

      if (loadingState.value) {
        Text("Loading items...")
      }

      if (variants.isEmpty()) {
        Text("No variants available.")
      } else {
        VariantGrid(
          items = filtered,
          modifier = Modifier.weight(1f),
          onItemClick = {
            if (it.onHandUnits() <= 0.0) {
              errorState.value = "No stock available"
            } else {
              dialogItem.value = it
            }
          }
        )
      }
    }
  }

  if (dialogItem.value != null) {
    DamageQtyDialog(
      item = dialogItem.value!!,
      onDismiss = { dialogItem.value = null },
      onSave = { qty ->
        val item = dialogItem.value!!
        val existing = state.items.firstOrNull { it.item.itemId == item.itemId && it.item.variantId == item.variantId }
        if (existing == null) {
          state.items.add(TransferLine(item, qty))
        } else {
          existing.quantity = qty
        }
        dialogItem.value = null
      }
    )
  }
}

@Composable
fun PurchaseSetupScreen(
  repo: Repository,
  token: String?,
  sessionStore: SessionStore,
  state: PurchaseState,
  warehouseIds: List<String>,
  onBack: () -> Unit,
  onNext: () -> Unit
) {
  val warehousesState = remember { mutableStateOf<List<Warehouse>>(emptyList()) }
  val suppliersState = remember { mutableStateOf<List<Supplier>>(emptyList()) }
  val selectedSupplier = remember { mutableStateOf<Supplier?>(null) }
  val selectedWarehouse = remember { mutableStateOf<Warehouse?>(null) }
  val warehouseDialogOpen = rememberSaveable { mutableStateOf(false) }
  val supplierDialogOpen = rememberSaveable { mutableStateOf(false) }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(Unit) {
    logDebug("PurchaseSetup", "screen open")
  }

  val applyWarehouse: (Warehouse) -> Unit = { warehouse ->
    selectedWarehouse.value = warehouse
    state.warehouseId = warehouse.id
    scope.launch {
      sessionStore.setLastPurchaseWarehouseId(warehouse.id)
    }
  }

  val applySupplier: (Supplier) -> Unit = { supplier ->
    selectedSupplier.value = supplier
    state.supplierId = supplier.id
    scope.launch {
      sessionStore.setLastPurchaseSupplierId(supplier.id)
    }
  }

  LaunchedEffect(token) {
    if (token == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val warehouses = repo.listWarehousesByIds(token, warehouseIds).sortedBy { it.name }
      logDebug("PurchaseSetup", "warehouses loaded count=${warehouses.size}")
      warehousesState.value = warehouses
      val suppliers = repo.listSuppliers(token)
      val filteredSuppliers = if (PURCHASE_SUPPLIER_IDS.isEmpty()) {
        suppliers
      } else {
        suppliers.filter { PURCHASE_SUPPLIER_IDS.contains(it.id) }
      }
      logDebug(
        "PurchaseSetup",
        "suppliers loaded all=${suppliers.size} allowed=${filteredSuppliers.size}"
      )
      suppliersState.value = filteredSuppliers
      if (state.warehouseId == null) {
        state.warehouseId = sessionStore.getLastPurchaseWarehouseId()
      }
      if (state.supplierId == null) {
        state.supplierId = sessionStore.getLastPurchaseSupplierId()
      }
      selectedWarehouse.value = warehouses.firstOrNull { it.id == state.warehouseId }
      selectedSupplier.value = filteredSuppliers.firstOrNull { it.id == state.supplierId }
      if (state.warehouseId != null && selectedWarehouse.value == null) {
        state.warehouseId = null
      }
      if (state.supplierId != null && selectedSupplier.value == null) {
        state.supplierId = null
      }
      warehouseDialogOpen.value = true
      supplierDialogOpen.value = false
    }.onFailure {
      if (it is CancellationException) return@onFailure
      errorState.value = it.message ?: "Failed to load purchase setup"
    }
    loadingState.value = false
  }

  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Purchase Setup") },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
        }
      }
    )
  }) { padding ->
    Column(
      modifier = Modifier
        .padding(padding)
        .padding(16.dp)
        .fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      if (warehouseDialogOpen.value) {
        AlertDialog(
          onDismissRequest = { },
          title = { Text("Select warehouse") },
          text = {
            WarehouseButtonGrid(
              label = "To warehouse",
              warehouses = warehousesState.value,
              selected = selectedWarehouse.value,
              onSelected = { applyWarehouse(it) }
            )
          },
          confirmButton = {
            TextButton(
              enabled = selectedWarehouse.value != null,
              onClick = {
                if (selectedWarehouse.value != null) {
                  warehouseDialogOpen.value = false
                  supplierDialogOpen.value = state.supplierId == null
                }
              }
            ) {
              Text("Continue")
            }
          }
        )
      }

      if (supplierDialogOpen.value && suppliersState.value.isNotEmpty()) {
        AlertDialog(
          onDismissRequest = { },
          title = { Text("Select supplier") },
          text = {
            SupplierButtonGrid(
              label = "Supplier",
              suppliers = suppliersState.value,
              selected = selectedSupplier.value,
              onSelected = { applySupplier(it) }
            )
          },
          confirmButton = {
            TextButton(
              enabled = selectedSupplier.value != null,
              onClick = {
                if (selectedSupplier.value != null) {
                  supplierDialogOpen.value = false
                }
              }
            ) {
              Text("Continue")
            }
          }
        )
      }

      if (warehouseDialogOpen.value || supplierDialogOpen.value) {
        return@Column
      }

      Text(
        text = "To Warehouse: ${selectedWarehouse.value?.name ?: ""}",
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center
      )
      Text(
        text = "Supplier: ${selectedSupplier.value?.name ?: ""}",
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center
      )

      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = state.invoiceNumber,
        onValueChange = { state.invoiceNumber = it.uppercase() },
        label = { Text("Invoice number") },
        keyboardOptions = KeyboardOptions(
          keyboardType = KeyboardType.Text
        )
      )

      if (loadingState.value) {
        Text("Loading...", style = MaterialTheme.typography.bodyMedium)
      }

      if (errorState.value != null) {
        Text(errorState.value ?: "", color = RedNegative)
      }

      Spacer(Modifier.weight(1f))

      Button(
        modifier = Modifier.fillMaxWidth(),
        enabled = state.supplierId != null && state.warehouseId != null && state.invoiceNumber.isNotBlank(),
        onClick = {
          if (state.invoiceNumber.isBlank()) {
            errorState.value = "Invoice number is required"
            return@Button
          }
          onNext()
        }
      ) {
        Text("Select items")
      }
    }
  }
}

@Composable
fun PurchaseItemsScreen(
  repo: Repository,
  token: String?,
  state: PurchaseState,
  onBack: () -> Unit,
  onShowVariants: () -> Unit,
  onNext: () -> Unit
) {
  val itemsState = remember { mutableStateOf<List<WarehouseItem>>(emptyList()) }
  val queryState = rememberSaveable { mutableStateOf("") }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val scanOpen = rememberSaveable { mutableStateOf(false) }
  val singleItemDialog = remember { mutableStateOf<WarehouseItem?>(null) }
  val refreshTick = remember { mutableStateOf(0) }

  LaunchedEffect(Unit) {
    logDebug("PurchaseItems", "screen open")
  }

  if (scanOpen.value) {
    BarcodeScannerScreen(
      onScanned = { code ->
        queryState.value = code
        scanOpen.value = false
      },
      onClose = { scanOpen.value = false }
    )
    return
  }

  LaunchedEffect(token, state.warehouseId, refreshTick.value) {
    if (token == null || state.warehouseId == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val rawItems = listAllowedItemsForWarehouse(repo, token, state.warehouseId!!)
      val items = rawItems.filter { it.isColdroomsAllowed() }
      logItemsSample("PurchaseItems", "raw items", rawItems)
      logItemsSample("PurchaseItems", "allowed items", items)
      itemsState.value = items
      state.availableItems = items
    }.onFailure {
      if (it is CancellationException) return@onFailure
      errorState.value = it.message ?: "Failed to load items"
    }
    loadingState.value = false
  }

  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Purchase Items") },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
        }
      },
      actions = {
        TextButton(onClick = { refreshTick.value += 1 }) {
          Text("Refresh now")
        }
      }
    )
  }) { padding ->
    Column(
      modifier = Modifier
        .padding(padding)
        .padding(16.dp)
        .fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = queryState.value,
        onValueChange = { queryState.value = it },
        label = { Text("Search or scan") },
        trailingIcon = {
          IconButton(onClick = { scanOpen.value = true }) {
            Icon(Icons.Filled.QrCodeScanner, contentDescription = "Scan")
          }
        }
      )

      if (errorState.value != null) {
        Text(errorState.value ?: "", color = RedNegative)
      }

      val query = queryState.value.trim().lowercase()
      val variantMatches = if (query.isBlank()) {
        emptyList()
      } else {
        itemsState.value.filter { item ->
          val isVariant = (item.variantId ?: "base").lowercase() != "base"
          if (!isVariant) return@filter false
          listOfNotNull(item.variantName, item.variantId, item.sku)
            .any { it.lowercase().contains(query) }
        }
      }
      val matchingItemIds = if (query.isBlank()) {
        emptySet()
      } else {
        itemsState.value
          .filter { item ->
            listOfNotNull(item.itemName, item.sku)
              .any { it.lowercase().contains(query) }
          }
          .map { it.itemId }
          .toSet()
      }
      val baseCandidates = if (query.isBlank()) {
        itemsState.value
      } else {
        itemsState.value.filter { it.itemId in matchingItemIds }
      }

      if (query.isNotBlank() && variantMatches.isNotEmpty()) {
        VariantGrid(
          items = variantMatches.sortedBy { variantSortKey(it) },
          modifier = Modifier.weight(1f),
          onItemClick = { singleItemDialog.value = it }
        )
      } else {
        val groupedItems = groupItems(baseCandidates)
        BaseItemGrid(
          items = groupedItems,
          modifier = Modifier.weight(1f),
          onItemClick = { group ->
            if (groupHasVariants(group)) {
              state.selectedItemId = group.itemId
              state.selectedItemName = group.itemName
              onShowVariants()
            } else {
              singleItemDialog.value = group.variants.firstOrNull()
            }
          }
        )
      }

      Spacer(Modifier.height(8.dp))

      Button(
        modifier = Modifier.fillMaxWidth(),
        enabled = state.items.isNotEmpty(),
        onClick = onNext
      ) {
        Text("Review purchase (${state.items.size})")
      }
    }
  }

  if (singleItemDialog.value != null) {
    PurchaseQtyDialog(
      item = singleItemDialog.value!!,
      existingQuantity = state.items.firstOrNull {
        it.item.itemId == singleItemDialog.value!!.itemId && it.item.variantId == singleItemDialog.value!!.variantId
      }?.quantity,
      onDismiss = { singleItemDialog.value = null },
      onSave = { qty ->
        val item = singleItemDialog.value!!
        val existing = state.items.firstOrNull { it.item.itemId == item.itemId && it.item.variantId == item.variantId }
        if (existing == null) {
          state.items.add(PurchaseLine(item, qty, null))
        } else {
          existing.quantity = qty
          existing.unitCost = null
        }
        singleItemDialog.value = null
      }
    )
  }
}

@Composable
fun PurchaseVariantsScreen(
  repo: Repository,
  token: String?,
  state: PurchaseState,
  onBack: () -> Unit
) {
  LaunchedEffect(Unit) {
    logDebug("PurchaseVariants", "screen open")
  }
  val selectedId = state.selectedItemId
  val title = state.selectedItemName ?: "Variants"
  val queryState = rememberSaveable { mutableStateOf("") }
  val scanOpen = rememberSaveable { mutableStateOf(false) }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val refreshTick = remember { mutableStateOf(0) }
  val variants = state.availableItems
    .filter { it.itemId == selectedId }
    .filterNot { (it.variantId ?: "base").lowercase() == "base" }
  val filtered = variants.filter { item ->
    val q = queryState.value.trim().lowercase()
    if (q.isEmpty()) true else {
      listOfNotNull(item.variantName, item.variantId, item.sku).any { it.lowercase().contains(q) }
    }
  }.sortedBy { variantSortKey(it) }

  val dialogItem = remember { mutableStateOf<WarehouseItem?>(null) }

  LaunchedEffect(selectedId, state.availableItems.size) {
    logDebug(
      "PurchaseVariants",
      "selectedId=${selectedId ?: ""} available=${state.availableItems.size}"
    )
  }

  LaunchedEffect(token, state.warehouseId, refreshTick.value) {
    if (token == null || state.warehouseId == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val rawItems = listAllowedItemsForWarehouse(repo, token, state.warehouseId!!)
      val items = rawItems.filter { it.isColdroomsAllowed() }
      logItemsSample("PurchaseVariants", "raw items", rawItems)
      logItemsSample("PurchaseVariants", "allowed items", items)
      state.availableItems = items
    }.onFailure {
      if (it is CancellationException) return@onFailure
      errorState.value = it.message ?: "Failed to load items"
    }
    loadingState.value = false
  }

  if (scanOpen.value) {
    BarcodeScannerScreen(
      onScanned = { code ->
        queryState.value = code
        scanOpen.value = false
      },
      onClose = { scanOpen.value = false }
    )
    return
  }

  Scaffold(topBar = {
    TopAppBar(
      title = { Text(title) },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
        }
      },
      actions = {
        TextButton(onClick = { refreshTick.value += 1 }) {
          Text("Refresh now")
        }
      }
    )
  }) { padding ->
    Column(
      modifier = Modifier
        .padding(padding)
        .padding(16.dp)
        .fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = queryState.value,
        onValueChange = { queryState.value = it },
        label = { Text("Search or scan") },
        trailingIcon = {
          IconButton(onClick = { scanOpen.value = true }) {
            Icon(Icons.Filled.QrCodeScanner, contentDescription = "Scan")
          }
        }
      )

      if (errorState.value != null) {
        Text(errorState.value ?: "", color = RedNegative)
      }

      if (loadingState.value) {
        Text("Loading items...")
      }

      if (variants.isEmpty()) {
        Text("No variants available.")
      } else {
        VariantGrid(
          items = filtered,
          modifier = Modifier.weight(1f),
          onItemClick = { dialogItem.value = it }
        )
      }
    }
  }

  if (dialogItem.value != null) {
    PurchaseQtyDialog(
      item = dialogItem.value!!,
      existingQuantity = state.items.firstOrNull {
        it.item.itemId == dialogItem.value!!.itemId && it.item.variantId == dialogItem.value!!.variantId
      }?.quantity,
      onDismiss = { dialogItem.value = null },
      onSave = { qty ->
        val item = dialogItem.value!!
        val existing = state.items.firstOrNull { it.item.itemId == item.itemId && it.item.variantId == item.variantId }
        if (existing == null) {
          state.items.add(PurchaseLine(item, qty, null))
        } else {
          existing.quantity = qty
          existing.unitCost = null
        }
        dialogItem.value = null
      }
    )
  }
}

@Composable
fun TransferSummaryScreen(
  repo: Repository,
  token: String?,
  user: LoginUser?,
  state: TransferState,
  onBack: () -> Unit,
  onConfirm: () -> Unit
) {
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val infoState = rememberSaveable { mutableStateOf<String?>(null) }
  val fromWarehouseState = remember { mutableStateOf<Warehouse?>(null) }
  val toWarehouseState = remember { mutableStateOf<Warehouse?>(null) }
  val displayNameState = remember { mutableStateOf<String?>(null) }
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val dateTimeText = remember { formatDateTimeLocal() }
  val borderWidth = rememberBorderDp()

  LaunchedEffect(Unit) {
    logDebug("TransferSummary", "screen open items=${state.items.size}")
  }

  LaunchedEffect(token, user?.id) {
    val userId = user?.id
    if (token == null || userId.isNullOrBlank()) return@LaunchedEffect
    runCatching {
      val fetched = repo.getUserDisplayName(token, userId)
      Log.d("TransferSummary", "display_name lookup userId=$userId result=$fetched")
      displayNameState.value = fetched
    }.onFailure {
      Log.w("TransferSummary", "Failed to load display name", it)
    }
  }

  LaunchedEffect(token, state.fromWarehouseId, state.toWarehouseId) {
    if (token == null || state.fromWarehouseId == null || state.toWarehouseId == null) return@LaunchedEffect
    runCatching {
      val warehouses = repo.listWarehousesByIds(token, listOf(state.fromWarehouseId!!, state.toWarehouseId!!))
      fromWarehouseState.value = warehouses.firstOrNull { it.id == state.fromWarehouseId }
      toWarehouseState.value = warehouses.firstOrNull { it.id == state.toWarehouseId }
      if (state.pdfFileName.isNullOrBlank()) {
        val fromName = fromWarehouseState.value?.name ?: "From_Warehouse"
        val toName = toWarehouseState.value?.name ?: "To_Warehouse"
        state.pdfFileName = buildTransferPdfFileName(fromName, toName, dateTimeText)
      }
    }.onFailure {
      if (it is CancellationException) return@onFailure
      errorState.value = it.message ?: "Failed to load warehouse names"
    }
  }

  val groupedLines = remember(state.items) { buildTransferSummaryGroups(state.items) }
  val userEmail = user?.email?.trim().orEmpty()
  val resolvedUserName = if (userEmail.isNotEmpty()) userEmail else "User"
  val resolvedDisplayName = (displayNameState.value ?: user?.displayName)?.trim().orEmpty()

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("Transfer Summary") },
        navigationIcon = {
          IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
          }
        },
        actions = {
          TextButton(
            enabled = !loadingState.value,
            onClick = {
              if (token == null || state.fromWarehouseId == null || state.toWarehouseId == null) {
                errorState.value = "Missing warehouse selection"
                return@TextButton
              }
              loadingState.value = true
              errorState.value = null
              infoState.value = null
              scope.launch {
                var queued = false
                var saved = false
                runCatching {
                  val pdfName = state.pdfFileName ?: buildTransferPdfFileName(
                    fromWarehouseState.value?.name ?: "From_Warehouse",
                    toWarehouseState.value?.name ?: "To_Warehouse",
                    dateTimeText
                  )
                  val pdfBytes = buildTransferPdfBytes(
                    context = context,
                    logoResId = R.drawable.afterten_logo,
                    fromWarehouse = fromWarehouseState.value?.name ?: "",
                    toWarehouse = toWarehouseState.value?.name ?: "",
                    processedBy = resolvedUserName,
                    dateTime = dateTimeText,
                    groupedLines = groupedLines
                  )
                  repo.uploadTransferPdf(token, pdfName, pdfBytes)
                  saved = savePdfToDownloads(context, pdfName, pdfBytes, "Transfers")
                  if (!saved) {
                    val signedUrl = repo.createTransferPdfSignedUrl(token, pdfName)
                    queued = enqueuePdfDownload(context, signedUrl, pdfName, "Transfers")
                  }
                  state.pdfFileName = pdfName
                  state.pdfUploaded = true
                }.onSuccess {
                  infoState.value = when {
                    saved -> "PDF saved to Downloads/Transfers"
                    queued -> "PDF download started"
                    else -> "PDF uploaded, but download failed"
                  }
                }.onFailure {
                  errorState.value = it.message ?: "Failed to download PDF"
                }
                loadingState.value = false
              }
            }
          ) {
            Text("PDF")
          }
        }
      )
    }
  ) { padding ->
    Box(
      modifier = Modifier
        .padding(padding)
        .padding(12.dp)
        .fillMaxSize()
        .border(borderWidth, RedNegative, RoundedCornerShape(8.dp))
        .padding(12.dp)
    ) {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Image(
          painter = painterResource(R.drawable.afterten_logo),
          contentDescription = "After Ten logo",
          modifier = Modifier
            .align(Alignment.CenterHorizontally)
            .height(64.dp)
        )

        Text(
          text = "From Warehouse: ${fromWarehouseState.value?.name ?: ""}",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
        Text(
          text = "To Warehouse: ${toWarehouseState.value?.name ?: ""}",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
        Text(
          text = "Username: ${resolvedDisplayName.ifEmpty { "" }}",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
        Text(
          text = "Date & Time: $dateTimeText",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )

        LazyColumn(
          verticalArrangement = Arrangement.spacedBy(12.dp),
          modifier = Modifier.weight(1f)
        ) {
          items(groupedLines) { group ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
              Text(
                text = group.baseName,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
                color = RedNegative,
                textDecoration = TextDecoration.Underline,
                fontWeight = FontWeight.SemiBold
              )
              group.lines.forEach { line ->
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Text(line.label, modifier = Modifier.weight(1f))
                  Text(line.qtyText, textAlign = TextAlign.End)
                }
                HorizontalDivider(color = Color.LightGray, thickness = 1.dp)
              }
            }
          }
        }

        if (infoState.value != null) {
          Text(infoState.value ?: "", color = Color.DarkGray)
        }

        if (errorState.value != null) {
          Text(errorState.value ?: "", color = RedNegative)
        }

        Button(
          modifier = Modifier.fillMaxWidth(),
          enabled = !loadingState.value,
          onClick = {
            if (token == null || state.fromWarehouseId == null || state.toWarehouseId == null) {
              errorState.value = "Missing warehouse selection"
              return@Button
            }
            loadingState.value = true
            errorState.value = null
            infoState.value = null
            scope.launch {
              runCatching {
                if (!state.pdfUploaded) {
                  val pdfName = state.pdfFileName ?: buildTransferPdfFileName(
                    fromWarehouseState.value?.name ?: "From_Warehouse",
                    toWarehouseState.value?.name ?: "To_Warehouse",
                    dateTimeText
                  )
                  val pdfBytes = buildTransferPdfBytes(
                    context = context,
                    logoResId = R.drawable.afterten_logo,
                    fromWarehouse = fromWarehouseState.value?.name ?: "",
                    toWarehouse = toWarehouseState.value?.name ?: "",
                    processedBy = displayUserName(user),
                    dateTime = dateTimeText,
                    groupedLines = groupedLines
                  )
                  repo.uploadTransferPdf(token, pdfName, pdfBytes)
                  state.pdfFileName = pdfName
                  state.pdfUploaded = true
                }
                val latest = repo.listWarehouseItems(token, state.fromWarehouseId!!)
                val latestByKey = latest.associateBy { it.stockKey() }
                val insufficient = state.items.firstOrNull { line ->
                  val current = latestByKey[stockKey(line.item.itemId, line.item.variantId)]?.onHandUnits() ?: 0.0
                  line.quantity > current
                }
                if (insufficient != null) {
                  val name = insufficient.item.variantName ?: insufficient.item.itemName
                  errorState.value = "Not enough stock for $name"
                  return@runCatching
                }
                repo.transferUnits(
                  token,
                  state.fromWarehouseId!!,
                  state.toWarehouseId!!,
                  state.items.map { TransferItemRequest(it.item.itemId, it.item.variantId, it.quantity) }
                )
              }.onSuccess {
                onConfirm()
              }.onFailure {
                errorState.value = it.message ?: "Transfer failed"
              }
              loadingState.value = false
            }
          }
        ) {
          Text(if (loadingState.value) "Processing..." else "Complete Transfer")
        }
      }
    }
  }
}

@Composable
fun DamageSummaryScreen(
  repo: Repository,
  token: String?,
  user: LoginUser?,
  state: DamageState,
  onBack: () -> Unit,
  onConfirm: () -> Unit
) {
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val infoState = rememberSaveable { mutableStateOf<String?>(null) }
  val warehouseState = remember { mutableStateOf<Warehouse?>(null) }
  val displayNameState = remember { mutableStateOf<String?>(null) }
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val dateTimeText = remember { formatDateTimeLocal() }
  val borderWidth = rememberBorderDp()

  LaunchedEffect(token, user?.id) {
    val userId = user?.id
    if (token == null || userId.isNullOrBlank()) return@LaunchedEffect
    runCatching {
      val fetched = repo.getUserDisplayName(token, userId)
      Log.d("DamageSummary", "display_name lookup userId=$userId result=$fetched")
      displayNameState.value = fetched
    }.onFailure {
      Log.w("DamageSummary", "Failed to load display name", it)
    }
  }

  LaunchedEffect(token, state.warehouseId) {
    if (token == null || state.warehouseId == null) return@LaunchedEffect
    runCatching {
      val warehouses = repo.listWarehousesByIds(token, listOf(state.warehouseId!!))
      warehouseState.value = warehouses.firstOrNull()
      if (state.pdfFileName.isNullOrBlank()) {
        val fromName = warehouseState.value?.name ?: "Warehouse"
        state.pdfFileName = buildDamagePdfFileName(fromName, dateTimeText)
      }
    }.onFailure {
      if (it is CancellationException) return@onFailure
      errorState.value = it.message ?: "Failed to load warehouse"
    }
  }

  val groupedLines = remember(state.items) { buildDamageSummaryGroups(state.items) }
  val resolvedDisplayName = (displayNameState.value ?: user?.displayName)?.trim().orEmpty()

  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Damage Summary") },
      actions = {
        TextButton(
          enabled = !loadingState.value,
          onClick = {
            if (token == null || state.warehouseId == null) {
              errorState.value = "Missing warehouse selection"
              return@TextButton
            }
            loadingState.value = true
            errorState.value = null
            infoState.value = null
            scope.launch {
              var queued = false
              var saved = false
              runCatching {
                val warehouseName = warehouseState.value?.name ?: "Warehouse"
                val pdfName = state.pdfFileName ?: buildDamagePdfFileName(
                  warehouseName,
                  dateTimeText
                )
                val pdfBytes = buildTransferPdfBytes(
                  context = context,
                  logoResId = R.drawable.afterten_logo,
                  fromWarehouse = warehouseName,
                  toWarehouse = "Damages",
                  processedBy = resolvedDisplayName,
                  dateTime = dateTimeText,
                  groupedLines = groupedLines
                )
                repo.uploadDamagePdf(token, pdfName, pdfBytes)
                saved = savePdfToDownloads(context, pdfName, pdfBytes, "Damages")
                if (!saved) {
                  val signedUrl = repo.createDamagePdfSignedUrl(token, pdfName)
                  queued = enqueuePdfDownload(context, signedUrl, pdfName, "Damages")
                }
                state.pdfFileName = pdfName
                state.pdfUploaded = true
              }.onSuccess {
                infoState.value = when {
                  saved -> "PDF saved to Downloads/Damages"
                  queued -> "PDF download started"
                  else -> "PDF uploaded, but download failed"
                }
              }.onFailure {
                errorState.value = it.message ?: "Failed to download PDF"
              }
              loadingState.value = false
            }
          }
        ) {
          Text("PDF")
        }
      },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
        }
      }
    )
  }) { padding ->
    Box(
      modifier = Modifier
        .padding(padding)
        .padding(12.dp)
        .fillMaxSize()
        .border(borderWidth, RedNegative, RoundedCornerShape(8.dp))
        .padding(12.dp)
    ) {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Image(
          painter = painterResource(R.drawable.afterten_logo),
          contentDescription = "After Ten logo",
          modifier = Modifier
            .align(Alignment.CenterHorizontally)
            .height(64.dp)
        )

        Text(
          text = "Warehouse: ${warehouseState.value?.name ?: ""}",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
        Text(
          text = "Username: ${resolvedDisplayName.ifEmpty { "" }}",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
        Text(
          text = "Date & Time: $dateTimeText",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )

        LazyColumn(
          verticalArrangement = Arrangement.spacedBy(12.dp),
          modifier = Modifier.weight(1f)
        ) {
          items(groupedLines) { group ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
              Text(
                text = group.baseName,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
                color = RedNegative,
                textDecoration = TextDecoration.Underline,
                fontWeight = FontWeight.SemiBold
              )
              group.lines.forEach { line ->
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Text(line.label, modifier = Modifier.weight(1f))
                  Text(line.qtyText, textAlign = TextAlign.End)
                }
                HorizontalDivider(color = Color.LightGray, thickness = 1.dp)
              }
            }
          }
        }

        if (infoState.value != null) {
          Text(infoState.value ?: "", color = Color.DarkGray)
        }

        if (errorState.value != null) {
          Text(errorState.value ?: "", color = RedNegative)
        }

        Button(
          modifier = Modifier.fillMaxWidth(),
          enabled = !loadingState.value,
          onClick = {
            if (token == null || state.warehouseId == null) {
              errorState.value = "Missing warehouse selection"
              return@Button
            }
            loadingState.value = true
            errorState.value = null
            infoState.value = null
            scope.launch {
              runCatching {
                if (!state.pdfUploaded) {
                  val warehouseName = warehouseState.value?.name ?: "Warehouse"
                  val pdfName = state.pdfFileName ?: buildDamagePdfFileName(
                    warehouseName,
                    dateTimeText
                  )
                  val pdfBytes = buildTransferPdfBytes(
                    context = context,
                    logoResId = R.drawable.afterten_logo,
                    fromWarehouse = warehouseName,
                    toWarehouse = "Damages",
                    processedBy = resolvedDisplayName,
                    dateTime = dateTimeText,
                    groupedLines = groupedLines
                  )
                  repo.uploadDamagePdf(token, pdfName, pdfBytes)
                  state.pdfFileName = pdfName
                  state.pdfUploaded = true
                }
                val damageItems = state.items.map { line ->
                  DamageItemRequest(
                    itemId = line.item.itemId,
                    variantId = line.item.variantId,
                    quantity = line.quantity
                  )
                }
                repo.recordDamage(
                  token = token,
                  warehouseId = state.warehouseId!!,
                  items = damageItems
                )
              }.onSuccess {
                onConfirm()
              }.onFailure {
                errorState.value = it.message ?: "Damage submit failed"
              }
              loadingState.value = false
            }
          }
        ) {
          Text(if (loadingState.value) "Submitting..." else "Confirm Damage")
        }
      }
    }
  }
}

@Composable
fun PurchaseSummaryScreen(
  repo: Repository,
  token: String?,
  user: LoginUser?,
  state: PurchaseState,
  onBack: () -> Unit,
  onConfirm: () -> Unit
) {
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val infoState = rememberSaveable { mutableStateOf<String?>(null) }
  val supplierState = remember { mutableStateOf<Supplier?>(null) }
  val warehouseState = remember { mutableStateOf<Warehouse?>(null) }
  val displayNameState = remember { mutableStateOf<String?>(null) }
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val groupedLines = remember(state.items) { buildPurchaseSummaryGroups(state.items) }
  val dateTimeText = remember { formatDateTimeLocal() }
  val borderWidth = rememberBorderDp()
  val pdfNameState = rememberSaveable { mutableStateOf<String?>(null) }
  val pdfUploadedState = rememberSaveable { mutableStateOf(false) }

  LaunchedEffect(token, user?.id) {
    val userId = user?.id
    if (token == null || userId.isNullOrBlank()) return@LaunchedEffect
    runCatching {
      val fetched = repo.getUserDisplayName(token, userId)
      Log.d("PurchaseSummary", "display_name lookup userId=$userId result=$fetched")
      displayNameState.value = fetched
    }.onFailure {
      Log.w("PurchaseSummary", "Failed to load display name", it)
    }
  }

  LaunchedEffect(token, state.supplierId, state.warehouseId) {
    if (token == null || state.supplierId.isNullOrBlank() || state.warehouseId.isNullOrBlank()) return@LaunchedEffect
    runCatching {
      val suppliers = repo.listSuppliers(token)
      supplierState.value = suppliers.firstOrNull { it.id == state.supplierId }
      val warehouses = repo.listWarehousesByIds(token, listOf(state.warehouseId!!))
      warehouseState.value = warehouses.firstOrNull()
      if (pdfNameState.value.isNullOrBlank()) {
        val supplierName = supplierState.value?.name ?: "Supplier"
        val warehouseName = warehouseState.value?.name ?: "Warehouse"
        pdfNameState.value = buildPurchasePdfFileName(supplierName, warehouseName, dateTimeText)
      }
    }.onFailure {
      if (it is CancellationException) return@onFailure
      errorState.value = it.message ?: "Failed to load purchase details"
    }
  }

  val userEmail = user?.email?.trim().orEmpty()
  val resolvedUserName = if (userEmail.isNotEmpty()) userEmail else "User"
  val resolvedDisplayName = (displayNameState.value ?: user?.displayName)?.trim().orEmpty()
  val supplierName = supplierState.value?.name ?: ""
  val warehouseName = warehouseState.value?.name ?: ""

  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Purchase Summary") },
      actions = {
        TextButton(
          enabled = !loadingState.value,
          onClick = {
            if (token == null || state.supplierId == null || state.warehouseId == null) {
              errorState.value = "Missing purchase data"
              return@TextButton
            }
            loadingState.value = true
            errorState.value = null
            infoState.value = null
            scope.launch {
              var queued = false
              var saved = false
              runCatching {
                val pdfName = pdfNameState.value ?: buildPurchasePdfFileName(
                  supplierName.ifEmpty { "Supplier" },
                  warehouseName.ifEmpty { "Warehouse" },
                  dateTimeText
                )
                val pdfBytes = buildPurchasePdfBytes(
                  context = context,
                  logoResId = R.drawable.afterten_logo,
                  supplierName = supplierName,
                  toWarehouse = warehouseName,
                  processedBy = resolvedUserName,
                  dateTime = dateTimeText,
                  groupedLines = groupedLines
                )
                repo.uploadPurchasePdf(token, pdfName, pdfBytes)
                saved = savePdfToDownloads(context, pdfName, pdfBytes, "Purchases")
                if (!saved) {
                  val signedUrl = repo.createPurchasePdfSignedUrl(token, pdfName)
                  queued = enqueuePdfDownload(context, signedUrl, pdfName, "Purchases")
                }
                pdfNameState.value = pdfName
                pdfUploadedState.value = true
              }.onSuccess {
                infoState.value = when {
                  saved -> "PDF saved to Downloads/Purchases"
                  queued -> "PDF download started"
                  else -> "PDF uploaded, but download failed"
                }
              }.onFailure {
                errorState.value = it.message ?: "Failed to download PDF"
              }
              loadingState.value = false
            }
          }
        ) {
          Text("PDF")
        }
      },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
        }
      }
    )
  }) { padding ->
    Box(
      modifier = Modifier
        .padding(padding)
        .padding(12.dp)
        .fillMaxSize()
        .border(borderWidth, RedNegative, RoundedCornerShape(8.dp))
        .padding(12.dp)
    ) {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Image(
          painter = painterResource(R.drawable.afterten_logo),
          contentDescription = "After Ten logo",
          modifier = Modifier
            .align(Alignment.CenterHorizontally)
            .height(64.dp)
        )

        Text(
          text = "Supplier: $supplierName",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
        Text(
          text = "To Warehouse: $warehouseName",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
        Text(
          text = "Username: ${resolvedDisplayName.ifEmpty { "" }}",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
        Text(
          text = "Date & Time: $dateTimeText",
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )

        LazyColumn(
          verticalArrangement = Arrangement.spacedBy(12.dp),
          modifier = Modifier.weight(1f)
        ) {
          items(groupedLines) { group ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
              Text(
                text = group.baseName,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
                color = RedNegative,
                textDecoration = TextDecoration.Underline,
                fontWeight = FontWeight.SemiBold
              )
              group.lines.forEach { line ->
                Row(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalArrangement = Arrangement.SpaceBetween,
                  verticalAlignment = Alignment.CenterVertically
                ) {
                  Text(line.label, modifier = Modifier.weight(1f))
                  Text(line.qtyText, textAlign = TextAlign.End)
                }
                HorizontalDivider(color = Color.LightGray, thickness = 1.dp)
              }
            }
          }
        }

        if (infoState.value != null) {
          Text(infoState.value ?: "", color = Color.DarkGray)
        }

        if (errorState.value != null) {
          Text(errorState.value ?: "", color = RedNegative)
        }

        Button(
          modifier = Modifier.fillMaxWidth(),
          enabled = !loadingState.value,
          onClick = {
            if (token == null || state.supplierId == null || state.warehouseId == null) {
              errorState.value = "Missing purchase data"
              return@Button
            }
            loadingState.value = true
            errorState.value = null
            infoState.value = null
            scope.launch {
              runCatching {
                if (!pdfUploadedState.value) {
                  val pdfName = pdfNameState.value ?: buildPurchasePdfFileName(
                    supplierName.ifEmpty { "Supplier" },
                    warehouseName.ifEmpty { "Warehouse" },
                    dateTimeText
                  )
                  val pdfBytes = buildPurchasePdfBytes(
                    context = context,
                    logoResId = R.drawable.afterten_logo,
                    supplierName = supplierName,
                    toWarehouse = warehouseName,
                    processedBy = resolvedUserName,
                    dateTime = dateTimeText,
                    groupedLines = groupedLines
                  )
                  repo.uploadPurchasePdf(token, pdfName, pdfBytes)
                  pdfNameState.value = pdfName
                  pdfUploadedState.value = true
                }
                repo.recordPurchaseReceipt(
                  token,
                  state.supplierId!!,
                  state.invoiceNumber,
                  state.warehouseId!!,
                  state.items.map { PurchaseItemRequest(it.item.itemId, it.item.variantId, it.quantity, it.unitCost) }
                )
              }.onSuccess {
                onConfirm()
              }.onFailure {
                errorState.value = it.message ?: "Purchase failed"
              }
              loadingState.value = false
            }
          }
        ) {
          Text(if (loadingState.value) "Submitting..." else "Process Purchase")
        }
      }
    }
  }
}

@Composable
fun SuccessScreen(
  title: String,
  subtitle: String,
  buttonLabel: String,
  onAction: () -> Unit
) {
  Scaffold { padding ->
    Column(
      modifier = Modifier
        .padding(padding)
        .padding(24.dp)
        .fillMaxSize(),
      verticalArrangement = Arrangement.Center,
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = GreenPositive)
      Spacer(Modifier.height(12.dp))
      Text(title, style = MaterialTheme.typography.titleLarge)
      Text(subtitle, style = MaterialTheme.typography.bodyMedium)
      Spacer(Modifier.height(20.dp))
      Button(onClick = onAction) {
        Text(buttonLabel)
      }
    }
  }
}

@SuppressLint("UnsafeOptInUsageError")
@Composable
private fun BarcodeScannerScreen(
  onScanned: (String) -> Unit,
  onClose: () -> Unit
) {
  val context = LocalContext.current
  val lifecycleOwner = remember(context) { context as? LifecycleOwner }
  val hasPermission = remember {
    mutableStateOf(
      ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    )
  }
  val permissionLauncher = rememberLauncherForActivityResult(
    ActivityResultContracts.RequestPermission()
  ) { granted ->
    hasPermission.value = granted
  }
  val hasScanned = remember { mutableStateOf(false) }
  val previewView = remember { PreviewView(context) }
  val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
  val scanner = remember {
    val options = BarcodeScannerOptions.Builder()
      .setBarcodeFormats(Barcode.FORMAT_QR_CODE, Barcode.FORMAT_CODE_128)
      .build()
    BarcodeScanning.getClient(options)
  }

  LaunchedEffect(Unit) {
    if (!hasPermission.value) {
      permissionLauncher.launch(Manifest.permission.CAMERA)
    }
  }

  DisposableEffect(hasPermission.value, lifecycleOwner) {
    if (!hasPermission.value || lifecycleOwner == null) {
      if (lifecycleOwner == null) {
        Log.e("BarcodeScanner", "Missing LifecycleOwner; camera cannot start")
      }
      return@DisposableEffect onDispose { }
    }
    val executor = ContextCompat.getMainExecutor(context)
    val listener = Runnable {
      runCatching {
        val cameraProvider = cameraProviderFuture.get()
        Log.d("BarcodeScanner", "Camera provider acquired")
        val preview = Preview.Builder().build().also {
          it.setSurfaceProvider(previewView.surfaceProvider)
        }
        val analysis = ImageAnalysis.Builder()
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .build()

        analysis.setAnalyzer(executor) { imageProxy ->
          try {
            val mediaImage = imageProxy.image
            if (mediaImage == null || hasScanned.value) {
              return@setAnalyzer
            }
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            scanner.process(image)
              .addOnSuccessListener { barcodes ->
                val raw = barcodes.firstOrNull { !it.rawValue.isNullOrBlank() }?.rawValue
                if (!raw.isNullOrBlank() && !hasScanned.value) {
                  Log.d("BarcodeScanner", "Barcode scanned: $raw")
                  hasScanned.value = true
                  onScanned(raw)
                }
              }
              .addOnFailureListener { error ->
                Log.e("BarcodeScanner", "Barcode scan failed", error)
              }
              .addOnCompleteListener { imageProxy.close() }
          } catch (error: Exception) {
            Log.e("BarcodeScanner", "Analyzer crashed", error)
            imageProxy.close()
          }
        }

        cameraProvider.unbindAll()
        cameraProvider.bindToLifecycle(
          lifecycleOwner,
          CameraSelector.DEFAULT_BACK_CAMERA,
          preview,
          analysis
        )
        Log.d("BarcodeScanner", "Camera bound to lifecycle")
      }.onFailure { error ->
        Log.e("BarcodeScanner", "Camera setup failed", error)
      }
    }

    cameraProviderFuture.addListener(listener, executor)
    onDispose {
      runCatching { cameraProviderFuture.get().unbindAll() }
    }
  }

  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Scan barcode") },
      navigationIcon = {
        IconButton(onClick = onClose) {
          Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
        }
      }
    )
  }) { padding ->
    if (!hasPermission.value) {
      Column(
        modifier = Modifier
          .padding(padding)
          .padding(16.dp)
          .fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
      ) {
        Text("Camera permission is required to scan barcodes.")
        Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) {
          Text("Allow camera")
        }
      }
    } else {
      Box(
        modifier = Modifier
          .padding(padding)
          .fillMaxSize()
      ) {
        AndroidView(
          factory = { previewView },
          modifier = Modifier.fillMaxSize()
        )
        Box(
          modifier = Modifier
            .align(Alignment.Center)
            .size(240.dp)
            .border(2.dp, Color.White, RoundedCornerShape(12.dp))
        )
      }
    }
  }
}

private fun groupItems(items: List<WarehouseItem>): List<ItemGroup> {
  return items
    .groupBy { it.itemId to it.itemName }
    .map { (key, variants) ->
      ItemGroup(
        itemId = key.first,
        itemName = key.second,
        variants = variants.sortedBy { variantSortKey(it) }
      )
    }
    .sortedBy { it.itemName.lowercase() }
}

private fun groupHasVariants(group: ItemGroup): Boolean {
  return group.variants.any { (it.variantId ?: "base").lowercase() != "base" }
}

@Composable
private fun BaseItemGrid(
  items: List<ItemGroup>,
  modifier: Modifier = Modifier,
  onItemClick: (ItemGroup) -> Unit
) {
  val gridState = rememberLazyGridState()
  LazyVerticalGrid(
    columns = GridCells.Fixed(2),
    verticalArrangement = Arrangement.spacedBy(12.dp),
    horizontalArrangement = Arrangement.spacedBy(12.dp),
    state = gridState,
    modifier = modifier.fillMaxWidth()
  ) {
    items(items) { group ->
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
          text = group.itemName,
          modifier = Modifier.fillMaxWidth(),
          fontWeight = FontWeight.SemiBold,
          maxLines = 2,
          overflow = TextOverflow.Ellipsis,
          textAlign = TextAlign.Center
        )
        Card(
          modifier = Modifier
            .fillMaxWidth()
            .clickable { onItemClick(group) },
          colors = CardDefaults.cardColors(containerColor = GraySurface),
          shape = RoundedCornerShape(12.dp)
        ) {
          val imageUrl = baseImageUrlForGroup(group)
          ProductImageCard(imageUrl = imageUrl)
        }
      }
    }
  }
}

@Composable
private fun VariantGrid(
  items: List<WarehouseItem>,
  modifier: Modifier = Modifier,
  onItemClick: (WarehouseItem) -> Unit
) {
  val gridState = rememberLazyGridState()
  LazyVerticalGrid(
    columns = GridCells.Fixed(2),
    verticalArrangement = Arrangement.spacedBy(12.dp),
    horizontalArrangement = Arrangement.spacedBy(12.dp),
    state = gridState,
    modifier = modifier.fillMaxWidth()
  ) {
    items(items) { item ->
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
          text = item.variantName ?: item.variantId ?: "Variant",
          modifier = Modifier.fillMaxWidth(),
          fontWeight = FontWeight.SemiBold,
          maxLines = 2,
          overflow = TextOverflow.Ellipsis,
          textAlign = TextAlign.Center
        )
        Card(
          modifier = Modifier
            .fillMaxWidth()
            .clickable { onItemClick(item) },
          colors = CardDefaults.cardColors(containerColor = GraySurface),
          shape = RoundedCornerShape(12.dp)
        ) {
          ProductImageCard(imageUrl = item.imageUrl)
        }
      }
    }
  }
}

private fun formatUomLabel(uom: String): String {
  val cleaned = uom.trim()
  if (cleaned.isEmpty()) return "Each(s)"
  val title = cleaned
    .lowercase()
    .split(Regex("\\s+"))
    .joinToString(" ") { word ->
      word.replaceFirstChar { ch -> ch.uppercaseChar() }
    }
  return "${title}(s)"
}

private fun formatQty(value: Double?): String {
  val numeric = value ?: 0.0
  val rounded = kotlin.math.round(numeric * 100.0) / 100.0
  return if (rounded % 1.0 == 0.0) {
    rounded.toInt().toString()
  } else {
    rounded.toString()
  }
}

private fun buildTransferSummaryGroups(items: List<TransferLine>): List<TransferSummaryGroup> {
  val grouped = items.groupBy { it.item.itemId to it.item.itemName }
  return grouped
    .map { (_, lines) ->
      val baseName = lines.firstOrNull()?.item?.itemName ?: ""
      val bullets = lines.map { line ->
        val item = line.item
        val label = item.variantName?.takeIf { it.isNotBlank() }
          ?: item.variantId?.takeIf { it.isNotBlank() && it.lowercase() != "base" }
          ?: "Base"
        val transferQty = line.quantity
        val multiplier = item.transferQuantity ?: 1.0
        val sentQty = if (multiplier > 0) transferQty / multiplier else transferQty
        val uom = formatUomLabel(item.transferUnit ?: "each")
        TransferSummaryLine(
          label = "- $label",
          qtyText = "${formatQty(sentQty)} $uom"
        )
      }
      TransferSummaryGroup(baseName = baseName, lines = bullets)
    }
    .sortedBy { it.baseName.lowercase() }
}

private fun buildPurchaseSummaryGroups(items: List<PurchaseLine>): List<TransferSummaryGroup> {
  val grouped = items.groupBy { it.item.itemId to it.item.itemName }
  return grouped
    .map { (_, lines) ->
      val baseName = lines.firstOrNull()?.item?.itemName ?: ""
      val bullets = lines.map { line ->
        val item = line.item
        val label = item.variantName?.takeIf { it.isNotBlank() }
          ?: item.variantId?.takeIf { it.isNotBlank() && it.lowercase() != "base" }
          ?: "Base"
        val qty = line.quantity
        val multiplier = item.transferQuantity ?: 1.0
        val shownQty = if (multiplier > 0) qty / multiplier else qty
        val uom = formatUomLabel(item.purchasePackUnit ?: "each")
        TransferSummaryLine(
          label = "- $label",
          qtyText = "${formatQty(shownQty)} $uom"
        )
      }
      TransferSummaryGroup(baseName = baseName, lines = bullets)
    }
    .sortedBy { it.baseName.lowercase() }
}

private fun buildDamageSummaryGroups(items: List<TransferLine>): List<TransferSummaryGroup> {
  val grouped = items.groupBy { it.item.itemId to it.item.itemName }
  return grouped
    .map { (_, lines) ->
      val baseName = lines.firstOrNull()?.item?.itemName ?: ""
      val bullets = lines.map { line ->
        val item = line.item
        val label = item.variantName?.takeIf { it.isNotBlank() }
          ?: item.variantId?.takeIf { it.isNotBlank() && it.lowercase() != "base" }
          ?: "Base"
        val qty = line.quantity
        val uom = formatUomLabel(item.consumptionUom ?: "each")
        TransferSummaryLine(
          label = "- $label",
          qtyText = "${formatQty(qty)} $uom"
        )
      }
      TransferSummaryGroup(baseName = baseName, lines = bullets)
    }
    .sortedBy { it.baseName.lowercase() }
}

private fun buildTransferPdfFileName(fromName: String, toName: String, dateTime: String): String {
  val safeFrom = fromName.trim().replace("\\s+".toRegex(), "_")
  val safeTo = toName.trim().replace("\\s+".toRegex(), "_")
  val safeDate = dateTime.replace("/", "-").replace(":", "-").replace(" ", "_")
  return "${safeFrom}_${safeTo}_${safeDate}.pdf"
}

private fun buildPurchasePdfFileName(supplierName: String, toName: String, dateTime: String): String {
  val safeSupplier = supplierName.trim().replace("\\s+".toRegex(), "_")
  val safeTo = toName.trim().replace("\\s+".toRegex(), "_")
  val safeDate = dateTime.replace("/", "-").replace(":", "-").replace(" ", "_")
  return "${safeSupplier}_To_${safeTo}_${safeDate}.pdf"
}

private fun buildDamagePdfFileName(fromName: String, dateTime: String): String {
  val safeFrom = fromName.trim().replace("\\s+".toRegex(), "_")
  val safeDate = dateTime.replace("/", "-").replace(":", "-").replace(" ", "_")
  return "${safeFrom}_Damages_${safeDate}.pdf"
}

private fun formatDateTimeLocal(): String {
  val formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm 'UTC +2;00'")
  return ZonedDateTime.now(ZoneOffset.ofHours(2)).format(formatter)
}

private fun buildTransferPdfBytes(
  context: android.content.Context,
  logoResId: Int,
  fromWarehouse: String,
  toWarehouse: String,
  processedBy: String,
  dateTime: String,
  groupedLines: List<TransferSummaryGroup>
): ByteArray {
  val pageWidth = 595
  val pageHeight = 842
  val document = PdfDocument()
  val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create()
  val page = document.startPage(pageInfo)
  val canvas = page.canvas

  val borderMm = 2.0
  val borderPoints = (borderMm / 25.4 * 72.0).toFloat()
  val borderPaint = Paint().apply {
    style = Paint.Style.STROKE
    color = android.graphics.Color.RED
    strokeWidth = borderPoints
  }
  val half = borderPoints / 2f
  canvas.drawRect(half, half, pageWidth - half, pageHeight - half, borderPaint)

  val logoBitmap = BitmapFactory.decodeResource(context.resources, logoResId)
  val maxLogoWidth = 140
  val scale = maxLogoWidth / logoBitmap.width.toFloat()
  val logoHeight = (logoBitmap.height * scale).toInt()
  val scaledLogo = logoBitmap.scale(maxLogoWidth, logoHeight, true)
  val logoX = (pageWidth - maxLogoWidth) / 2f
  canvas.drawBitmap(scaledLogo, logoX, 20f, null)

  val centerX = pageWidth / 2f
  var y = 20f + logoHeight + 24f
  val textPaint = Paint().apply {
    color = android.graphics.Color.BLACK
    textSize = 14f
    textAlign = Paint.Align.CENTER
  }
  canvas.drawText("From Warehouse: $fromWarehouse", centerX, y, textPaint)
  y += 18f
  canvas.drawText("To Warehouse: $toWarehouse", centerX, y, textPaint)
  y += 18f
  canvas.drawText("User: $processedBy", centerX, y, textPaint)
  y += 18f
  canvas.drawText("Date & Time: $dateTime", centerX, y, textPaint)
  y += 24f

  val headerPaint = Paint().apply {
    color = android.graphics.Color.RED
    textSize = 14f
    textAlign = Paint.Align.CENTER
    isUnderlineText = true
  }
  val linePaint = Paint().apply {
    color = android.graphics.Color.BLACK
    textSize = 12f
    textAlign = Paint.Align.LEFT
  }
  val qtyPaint = Paint().apply {
    color = android.graphics.Color.BLACK
    textSize = 12f
    textAlign = Paint.Align.RIGHT
  }
  val dividerPaint = Paint().apply {
    color = android.graphics.Color.LTGRAY
    strokeWidth = 1f
  }

  groupedLines.forEach { group ->
    canvas.drawText(group.baseName, centerX, y, headerPaint)
    y += 18f
    group.lines.forEach { line ->
      canvas.drawText(line.label, 40f, y, linePaint)
      canvas.drawText(line.qtyText, pageWidth - 40f, y, qtyPaint)
      y += 10f
      canvas.drawLine(40f, y, pageWidth - 40f, y, dividerPaint)
      y += 10f
    }
    y += 8f
  }

  document.finishPage(page)
  val output = ByteArrayOutputStream()
  document.writeTo(output)
  document.close()
  return output.toByteArray()
}

private fun buildPurchasePdfBytes(
  context: android.content.Context,
  logoResId: Int,
  supplierName: String,
  toWarehouse: String,
  processedBy: String,
  dateTime: String,
  groupedLines: List<TransferSummaryGroup>
): ByteArray {
  val pageWidth = 595
  val pageHeight = 842
  val document = PdfDocument()
  val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create()
  val page = document.startPage(pageInfo)
  val canvas = page.canvas

  val borderMm = 2.0
  val borderPoints = (borderMm / 25.4 * 72.0).toFloat()
  val borderPaint = Paint().apply {
    style = Paint.Style.STROKE
    color = android.graphics.Color.RED
    strokeWidth = borderPoints
  }
  val half = borderPoints / 2f
  canvas.drawRect(half, half, pageWidth - half, pageHeight - half, borderPaint)

  val logoBitmap = BitmapFactory.decodeResource(context.resources, logoResId)
  val maxLogoWidth = 140
  val scale = maxLogoWidth / logoBitmap.width.toFloat()
  val logoHeight = (logoBitmap.height * scale).toInt()
  val scaledLogo = logoBitmap.scale(maxLogoWidth, logoHeight, true)
  val logoX = (pageWidth - maxLogoWidth) / 2f
  canvas.drawBitmap(scaledLogo, logoX, 20f, null)

  val centerX = pageWidth / 2f
  var y = 20f + logoHeight + 24f
  val textPaint = Paint().apply {
    color = android.graphics.Color.BLACK
    textSize = 14f
    textAlign = Paint.Align.CENTER
  }
  canvas.drawText("Supplier: $supplierName", centerX, y, textPaint)
  y += 18f
  canvas.drawText("To Warehouse: $toWarehouse", centerX, y, textPaint)
  y += 18f
  canvas.drawText("User: $processedBy", centerX, y, textPaint)
  y += 18f
  canvas.drawText("Date & Time: $dateTime", centerX, y, textPaint)
  y += 24f

  val headerPaint = Paint().apply {
    color = android.graphics.Color.RED
    textSize = 14f
    textAlign = Paint.Align.CENTER
    isUnderlineText = true
  }
  val linePaint = Paint().apply {
    color = android.graphics.Color.BLACK
    textSize = 12f
    textAlign = Paint.Align.LEFT
  }
  val qtyPaint = Paint().apply {
    color = android.graphics.Color.BLACK
    textSize = 12f
    textAlign = Paint.Align.RIGHT
  }
  val dividerPaint = Paint().apply {
    color = android.graphics.Color.LTGRAY
    strokeWidth = 1f
  }

  groupedLines.forEach { group ->
    canvas.drawText(group.baseName, centerX, y, headerPaint)
    y += 18f
    group.lines.forEach { line ->
      canvas.drawText(line.label, 40f, y, linePaint)
      canvas.drawText(line.qtyText, pageWidth - 40f, y, qtyPaint)
      y += 10f
      canvas.drawLine(40f, y, pageWidth - 40f, y, dividerPaint)
      y += 10f
    }
    y += 8f
  }

  document.finishPage(page)
  val output = ByteArrayOutputStream()
  document.writeTo(output)
  document.close()
  return output.toByteArray()
}

private fun savePdfToDownloads(
  context: android.content.Context,
  fileName: String,
  bytes: ByteArray,
  folderName: String
): Boolean {
  val resolver = context.contentResolver
  return try {
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
      val values = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, fileName)
        put(MediaStore.Downloads.MIME_TYPE, "application/pdf")
        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + folderName)
        put(MediaStore.Downloads.IS_PENDING, 1)
      }
      val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
      resolver.openOutputStream(uri)?.use { stream ->
        stream.write(bytes)
      } ?: return false
      val completed = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
      resolver.update(uri, completed, null, null)
      true
    } else {
      val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
      val folder = java.io.File(downloads, folderName)
      if (!folder.exists()) folder.mkdirs()
      val file = java.io.File(folder, fileName)
      file.outputStream().use { it.write(bytes) }
      true
    }
  } catch (_: Exception) {
    false
  }
}

private fun enqueuePdfDownload(
  context: android.content.Context,
  url: String,
  fileName: String,
  folderName: String
): Boolean {
  return try {
    val request = DownloadManager.Request(url.toUri())
      .setTitle(fileName)
      .setDescription("Downloading PDF")
      .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
      .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "$folderName/$fileName")
    val manager = context.getSystemService(android.content.Context.DOWNLOAD_SERVICE) as DownloadManager
    manager.enqueue(request)
    true
  } catch (_: Exception) {
    false
  }
}

private fun displayUserName(user: LoginUser?): String {
  val name = user?.displayName?.trim().orEmpty()
  if (name.isNotEmpty()) return name
  return user?.email?.trim().orEmpty()
}

@Composable
private fun rememberBorderDp(): Dp {
  val density = LocalDensity.current
  return remember(density) {
    val dpValue = 1.3f / 25.4f * 160f
    dpValue.dp
  }
}

private fun variantSortKey(item: WarehouseItem): String {
  val label = item.variantName ?: item.variantId ?: ""
  return label.lowercase()
}

private fun stockKey(itemId: String, variantId: String?): String {
  val variant = (variantId ?: "base").lowercase()
  return "$itemId::$variant"
}

private fun WarehouseItem.stockKey(): String = stockKey(itemId, variantId)

private fun WarehouseItem.onHandUnits(): Double = onHand ?: 0.0

private fun formatQty(value: Double): String {
  if (!value.isFinite()) return "0"
  val rounded = kotlin.math.round(value * 100) / 100
  return if (rounded % 1.0 == 0.0) rounded.toInt().toString() else rounded.toString()
}

@Composable
private fun LiveQtyBadge(item: WarehouseItem) {
  val qtyText = formatQty(item.onHandUnits())
  val uom = formatUomLabel(item.purchasePackUnit ?: "each")
  Text(
    text = "($qtyText $uom)",
    style = MaterialTheme.typography.labelMedium,
    color = Color.DarkGray,
    modifier = Modifier.fillMaxWidth(),
    textAlign = TextAlign.End
  )
}

private fun baseImageUrlForGroup(group: ItemGroup): String? {
  return group.variants
    .firstOrNull { (it.variantId ?: "base").lowercase() == "base" }
    ?.imageUrl
    ?.takeIf { it.isNotBlank() }
}

@Composable
private fun ProductImageCard(imageUrl: String?) {
  Box(
    modifier = Modifier
      .fillMaxWidth()
      .height(110.dp)
      .padding(8.dp)
      .clip(RoundedCornerShape(10.dp))
  ) {
    AsyncImage(
      model = imageUrl,
      contentDescription = null,
      modifier = Modifier.fillMaxSize(),
      contentScale = ContentScale.Crop
    )
  }
}

@Composable
private fun QtyEntryDialog(
  item: WarehouseItem,
  onDismiss: () -> Unit,
  onSave: (Double) -> Unit
) {
  val qtyState = remember { mutableStateOf("") }
  val validationState = remember { mutableStateOf<String?>(null) }
  val availableQty = item.onHandUnits()
  AlertDialog(
    onDismissRequest = onDismiss,
    title = {
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
          text = item.variantName ?: item.itemName,
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
        LiveQtyBadge(item)
      }
    },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
          "How its transferred",
          modifier = Modifier.fillMaxWidth(),
          style = MaterialTheme.typography.titleMedium,
          color = RedNegative,
          textAlign = TextAlign.Center
        )
        Text(
          formatUomLabel(item.transferUnit ?: item.purchasePackUnit ?: "each"),
          modifier = Modifier.fillMaxWidth(),
          style = MaterialTheme.typography.titleMedium,
          color = RedNegative,
          textAlign = TextAlign.Center
        )
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
          OutlinedTextField(
            modifier = Modifier.width(180.dp),
            value = qtyState.value,
            onValueChange = { qtyState.value = it.filter { ch -> ch.isDigit() } },
            placeholder = { Text("Enter Qty") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
          )
        }
        if (validationState.value != null) {
          Text(validationState.value ?: "", color = RedNegative)
        }
      }
    },
    confirmButton = {
      TextButton(onClick = {
        val qty = qtyState.value.trim().toIntOrNull()
        if (qty == null || qty <= 0) {
          validationState.value = "Enter a quantity greater than 0"
          return@TextButton
        }
        val requested = qty.toDouble()
        if (availableQty <= 0.0) {
          validationState.value = "No stock available"
          return@TextButton
        }
        if (requested > availableQty) {
          validationState.value = "Not enough stock available"
          return@TextButton
        }
        validationState.value = null
        onSave(requested)
      }) {
        Text("OK")
      }
    },
    dismissButton = {
      TextButton(onClick = onDismiss) {
        Text("Cancel")
      }
    }
  )
}

@Composable
private fun DamageQtyDialog(
  item: WarehouseItem,
  onDismiss: () -> Unit,
  onSave: (Double) -> Unit
) {
  val qtyState = remember { mutableStateOf("") }
  val validationState = remember { mutableStateOf<String?>(null) }
  val availableQty = item.onHandUnits()

  AlertDialog(
    onDismissRequest = onDismiss,
    title = {
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
          text = item.variantName ?: item.itemName,
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
        LiveQtyBadge(item)
      }
    },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
          "How its consumed",
          modifier = Modifier.fillMaxWidth(),
          style = MaterialTheme.typography.titleMedium,
          color = RedNegative,
          textAlign = TextAlign.Center
        )
        Text(
          formatUomLabel(item.consumptionUom ?: "each"),
          modifier = Modifier.fillMaxWidth(),
          style = MaterialTheme.typography.titleMedium,
          color = RedNegative,
          textAlign = TextAlign.Center
        )
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
          OutlinedTextField(
            modifier = Modifier.width(180.dp),
            value = qtyState.value,
            onValueChange = { qtyState.value = it.filter { ch -> ch.isDigit() } },
            placeholder = { Text("Enter Qty") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
          )
        }
        if (validationState.value != null) {
          Text(validationState.value ?: "", color = RedNegative)
        }
      }
    },
    confirmButton = {
      TextButton(onClick = {
        val qty = qtyState.value.trim().toIntOrNull()
        if (qty == null || qty <= 0) {
          validationState.value = "Enter a quantity greater than 0"
          return@TextButton
        }
        val requested = qty.toDouble()
        if (availableQty <= 0.0) {
          validationState.value = "No stock available"
          return@TextButton
        }
        if (requested > availableQty) {
          validationState.value = "Not enough stock available"
          return@TextButton
        }
        validationState.value = null
        onSave(requested)
      }) {
        Text("OK")
      }
    },
    dismissButton = {
      TextButton(onClick = onDismiss) {
        Text("Cancel")
      }
    }
  )
}

@Composable
private fun PurchaseQtyDialog(
  item: WarehouseItem,
  existingQuantity: Double? = null,
  onDismiss: () -> Unit,
  onSave: (Double) -> Unit
) {
  val qtyState = remember(existingQuantity) {
    mutableStateOf(existingQuantity?.toInt()?.toString() ?: "")
  }
  val validationState = remember { mutableStateOf<String?>(null) }

  AlertDialog(
    onDismissRequest = onDismiss,
    title = {
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
          text = item.variantName ?: item.itemName,
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )
        LiveQtyBadge(item)
      }
    },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
          "How its purchased",
          modifier = Modifier.fillMaxWidth(),
          style = MaterialTheme.typography.titleMedium,
          color = RedNegative,
          textAlign = TextAlign.Center
        )
        Text(
          formatUomLabel(item.purchasePackUnit ?: "each"),
          modifier = Modifier.fillMaxWidth(),
          style = MaterialTheme.typography.titleMedium,
          color = RedNegative,
          textAlign = TextAlign.Center
        )
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
          OutlinedTextField(
            modifier = Modifier.width(180.dp),
            value = qtyState.value,
            onValueChange = { qtyState.value = it.filter { ch -> ch.isDigit() } },
            placeholder = { Text("Enter Qty") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
          )
        }
        if (validationState.value != null) {
          Text(validationState.value ?: "", color = RedNegative)
        }
      }
    },
    confirmButton = {
      TextButton(onClick = {
        val qty = qtyState.value.trim().toIntOrNull()
        if (qty == null || qty <= 0) {
          validationState.value = "Enter a quantity greater than 0"
          return@TextButton
        }
        validationState.value = null
        onSave(qty.toDouble())
      }) {
        Text("OK")
      }
    },
    dismissButton = {
      TextButton(onClick = onDismiss) {
        Text("Cancel")
      }
    }
  )
}

@Composable
private fun WarehouseButtonGrid(
  label: String,
  warehouses: List<Warehouse>,
  selected: Warehouse?,
  onSelected: (Warehouse) -> Unit
) {
  Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Text(label, style = MaterialTheme.typography.titleMedium)
    LazyVerticalGrid(
      columns = GridCells.Fixed(2),
      verticalArrangement = Arrangement.spacedBy(10.dp),
      horizontalArrangement = Arrangement.spacedBy(10.dp),
      modifier = Modifier
        .fillMaxWidth()
        .heightIn(max = 360.dp)
    ) {
      items(warehouses) { warehouse ->
        val isSelected = selected?.id == warehouse.id
        Button(
          modifier = Modifier
            .fillMaxWidth()
            .height(48.dp),
          colors = ButtonDefaults.buttonColors(
            containerColor = if (isSelected) BluePrimary else GraySurface,
            contentColor = if (isSelected) Color.White else Color.Black
          ),
          onClick = { onSelected(warehouse) }
        ) {
          Text(
            text = warehouse.name.ifEmpty { warehouse.id },
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
          )
        }
      }
    }
  }
}

@Composable
private fun SupplierButtonGrid(
  label: String,
  suppliers: List<Supplier>,
  selected: Supplier?,
  onSelected: (Supplier) -> Unit
) {
  Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Text(label, style = MaterialTheme.typography.titleMedium)
    LazyVerticalGrid(
      columns = GridCells.Fixed(2),
      verticalArrangement = Arrangement.spacedBy(10.dp),
      horizontalArrangement = Arrangement.spacedBy(10.dp),
      modifier = Modifier
        .fillMaxWidth()
        .heightIn(max = 360.dp)
    ) {
      items(suppliers) { supplier ->
        val isSelected = selected?.id == supplier.id
        Button(
          modifier = Modifier
            .fillMaxWidth()
            .height(48.dp),
          colors = ButtonDefaults.buttonColors(
            containerColor = if (isSelected) BluePrimary else GraySurface,
            contentColor = if (isSelected) Color.White else Color.Black
          ),
          onClick = { onSelected(supplier) }
        ) {
          Text(
            text = supplier.name.ifEmpty { supplier.id },
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
          )
        }
      }
    }
  }
}
