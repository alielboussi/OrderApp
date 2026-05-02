@file:OptIn(ExperimentalMaterial3Api::class)

package com.afterten.drinks_transfers.ui.screens

import android.util.Log
import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.content.ContentValues
import android.graphics.BitmapFactory
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.os.Environment
import android.provider.MediaStore
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import android.graphics.Color as AndroidColor
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import android.app.DownloadManager
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
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
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import coil.compose.AsyncImage
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.afterten.drinks_transfers.data.DamageItemRequest
import com.afterten.drinks_transfers.data.LoginUser
import com.afterten.drinks_transfers.data.PurchaseItemRequest
import com.afterten.drinks_transfers.data.Repository
import com.afterten.drinks_transfers.data.SessionStore
import com.afterten.drinks_transfers.data.Supplier
import com.afterten.drinks_transfers.data.TelegramNotifyRequest
import com.afterten.drinks_transfers.data.TelegramSummary
import com.afterten.drinks_transfers.data.TransferItemRequest
import com.afterten.drinks_transfers.data.Warehouse
import com.afterten.drinks_transfers.data.WarehouseItem
import com.afterten.drinks_transfers.R
import com.afterten.drinks_transfers.ui.theme.BluePrimary
import com.afterten.drinks_transfers.ui.theme.GraySurface
import com.afterten.drinks_transfers.ui.theme.GreenPositive
import com.afterten.drinks_transfers.ui.theme.RedNegative
import java.io.ByteArrayOutputStream
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.async
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private const val FROM_WAREHOUSE_ID = "f71a25d0-9ec2-454d-a606-93cfaa3c606b"

val TRANSFER_WAREHOUSE_IDS = listOf(
  "c4aa315f-2e09-4060-8258-9dab077271ce",
  "c77376f7-1ede-4518-8180-b3efeecda128"
)

val HOME_WAREHOUSE_IDS = listOf(
  "21e1b353-9f6a-4cea-8998-128f4328b79d",
  "251a87ae-3ff6-4d26-918a-0f7c1fc45d4d",
  "29f617c5-9c76-4131-aebf-4be4544924db",
  "38bfcdb0-fec1-4b91-be05-d8990bf357a8",
  "4631b410-fc81-4f16-a74c-7e4de3c1f576",
  "732d83ba-48f6-481a-bedf-291b5f158552",
  "ac0bb46a-879b-4166-a10e-b31b688ee7c7",
  "d4252cfd-03c0-4187-9267-18ec79a00814"
)

val DAMAGE_WAREHOUSE_IDS = listOf(FROM_WAREHOUSE_ID)

val HIDDEN_TRANSFER_VARIANT_IDS = setOf(
  "3f8bb7e2-e848-48de-9936-e94bafed2b92",
  "ce5fcf2c-d35f-44b6-9f36-91333007cf42"
)

val PURCHASE_SUPPLIER_IDS = emptySet<String>()

class TransferState {
  var toWarehouseId: String? = null
  var selectedItemId: String? = null
  var selectedItemName: String? = null
  var availableItems: List<WarehouseItem> = emptyList()
  var pdfFileName: String? = null
  var pdfUploaded: Boolean = false
  val items = mutableStateListOf<TransferLine>()

  fun reset() {
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
          "Beverages Storeroom Login",
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
  onHomes: () -> Unit,
  onDamages: () -> Unit,
  onLogout: () -> Unit
) {
  Scaffold(topBar = {
    TopAppBar(
      title = {
        Text(
          "Beverages Storeroom App",
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
            title = "Homes",
            subtitle = "Send stock to home warehouses",
            icon = Icons.Filled.SyncAlt,
            onClick = onHomes
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
  icon: ImageVector,
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
  destinationWarehouseIds: List<String>,
  screenTitle: String,
  actionLabel: String,
  onBack: () -> Unit,
  onShowVariants: () -> Unit,
  onReview: () -> Unit
) {
  val itemsState = remember { mutableStateOf<List<WarehouseItem>>(emptyList()) }
  val toWarehouseState = remember { mutableStateOf<Warehouse?>(null) }
  val warehousesState = remember { mutableStateOf<List<Warehouse>>(emptyList()) }
  val transferDialogOpen = rememberSaveable { mutableStateOf(false) }
  val destinationSelection = remember { mutableStateOf<Warehouse?>(null) }
  val singleItemDialog = remember { mutableStateOf<WarehouseItem?>(null) }
  val queryState = rememberSaveable { mutableStateOf("") }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  val scanOpen = rememberSaveable { mutableStateOf(false) }

  LaunchedEffect(token) {
    if (token == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      coroutineScope {
        val warehousesDeferred = async { repo.listWarehousesByIds(token, destinationWarehouseIds) }
        val itemsDeferred = async { repo.listWarehouseItems(token, FROM_WAREHOUSE_ID) }
        val warehouses = warehousesDeferred.await()
        val items = itemsDeferred.await()
        Log.i("Transfers", "Items fetched for warehouse $FROM_WAREHOUSE_ID: ${items.size}")
        items.take(5).forEach { item ->
          Log.i(
            "Transfers",
            "Item: ${item.itemId} ${item.itemName} variant=${item.variantId ?: "base"}"
          )
        }
        Log.i("Transfers", "Destination warehouses fetched: ${warehouses.size}")
        warehouses.forEach { warehouse ->
          Log.i("Transfers", "Warehouse option: ${warehouse.id} ${warehouse.name}")
        }
        val sortedWarehouses = warehouses.sortedBy { it.name }
        warehousesState.value = sortedWarehouses
        val selectedWarehouse = sortedWarehouses.firstOrNull { it.id == state.toWarehouseId }
        destinationSelection.value = selectedWarehouse
        toWarehouseState.value = selectedWarehouse
        transferDialogOpen.value = state.toWarehouseId == null
        itemsState.value = items
        state.availableItems = items
      }
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
      title = { Text(screenTitle) },
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
      if (transferDialogOpen.value && warehousesState.value.isNotEmpty()) {
        AlertDialog(
          onDismissRequest = { },
          title = { Text("Send to warehouse") },
          text = {
            WarehouseButtonGrid(
              label = "Destination",
              warehouses = warehousesState.value,
              selected = destinationSelection.value,
              onSelected = { destinationSelection.value = it }
            )
          },
          confirmButton = {
            TextButton(
              enabled = destinationSelection.value != null,
              onClick = {
                val selected = destinationSelection.value
                if (selected != null) {
                  toWarehouseState.value = selected
                  state.toWarehouseId = selected.id
                  scope.launch {
                    sessionStore.setLastTransferWarehouseId(selected.id)
                  }
                  transferDialogOpen.value = false
                }
              }
            ) {
              Text("Continue")
            }
          }
        )
      }

      if (transferDialogOpen.value) {
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
          items = variantMatches
            .filterNot { it.variantId in HIDDEN_TRANSFER_VARIANT_IDS }
            .sortedBy { variantSortKey(it) },
          modifier = Modifier.weight(1f),
          onItemClick = { singleItemDialog.value = it }
        )
      } else {
        val groupedItems = groupItems(
          baseCandidates.filterNot { it.variantId in HIDDEN_TRANSFER_VARIANT_IDS }
        )
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
        onClick = {
          if (state.toWarehouseId == null) {
            transferDialogOpen.value = true
          } else {
            onReview()
          }
        }
      ) {
        Text("$actionLabel (${state.items.size})")
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
  val selectedId = state.selectedItemId
  val title = state.selectedItemName ?: "Variants"
  val queryState = rememberSaveable { mutableStateOf("") }
  val scanOpen = rememberSaveable { mutableStateOf(false) }
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
  state: DamageState,
  warehouseIds: List<String>,
  onBack: () -> Unit,
  onShowVariants: () -> Unit,
  onReview: () -> Unit
) {
  val itemsState = remember { mutableStateOf<List<WarehouseItem>>(emptyList()) }
  val singleItemDialog = remember { mutableStateOf<WarehouseItem?>(null) }
  val queryState = rememberSaveable { mutableStateOf("") }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val scanOpen = rememberSaveable { mutableStateOf(false) }

  LaunchedEffect(token) {
    if (token == null) return@LaunchedEffect
    val damageWarehouseId = warehouseIds.firstOrNull { it == FROM_WAREHOUSE_ID } ?: FROM_WAREHOUSE_ID
    if (state.warehouseId != damageWarehouseId) {
      state.warehouseId = damageWarehouseId
      state.items.clear()
    }
  }

  LaunchedEffect(token, state.warehouseId) {
    if (token == null || state.warehouseId == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val items = repo.listWarehouseItems(token, state.warehouseId!!)
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
        onClick = {
          onReview()
        }
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
  state: DamageState,
  onBack: () -> Unit
) {
  val selectedId = state.selectedItemId
  val title = state.selectedItemName ?: "Variants"
  val queryState = rememberSaveable { mutableStateOf("") }
  val scanOpen = rememberSaveable { mutableStateOf(false) }
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
fun PurchaseVariantsScreen(
  state: PurchaseState,
  onBack: () -> Unit
) {
  val selectedId = state.selectedItemId
  val title = state.selectedItemName ?: "Variants"
  val queryState = rememberSaveable { mutableStateOf("") }
  val scanOpen = rememberSaveable { mutableStateOf(false) }
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

  LaunchedEffect(token, state.toWarehouseId) {
    if (token == null || state.toWarehouseId == null) return@LaunchedEffect
    runCatching {
      val warehouses = repo.listWarehousesByIds(token, listOf(FROM_WAREHOUSE_ID, state.toWarehouseId!!))
      fromWarehouseState.value = warehouses.firstOrNull { it.id == FROM_WAREHOUSE_ID }
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
              if (token == null || state.toWarehouseId == null) {
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
          if (token == null || state.toWarehouseId == null) {
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
              repo.transferUnits(
                token,
                FROM_WAREHOUSE_ID,
                state.toWarehouseId!!,
                state.items.map { TransferItemRequest(it.item.itemId, it.item.variantId, it.quantity) }
              )
              val hasOpenPeriod = repo.hasOpenWarehousePeriod(token, state.toWarehouseId!!)
              val currentQtyByKey = if (hasOpenPeriod) {
                val liveItems = repo.listWarehouseItems(token, state.toWarehouseId!!)
                liveItems.associateBy(
                  { buildItemKey(it.itemId, it.variantId) },
                  { it.onHand }
                )
              } else {
                emptyMap()
              }
              val telegramItemsBlock = buildTelegramItemsBlock(
                items = state.items,
                currentQtyByKey = currentQtyByKey
              )
              val summary = TelegramSummary(
                processedBy = resolvedUserName,
                sourceLabel = fromWarehouseState.value?.name ?: "",
                destLabel = toWarehouseState.value?.name ?: "",
                itemsBlock = telegramItemsBlock,
                dateTime = dateTimeText,
                warehouseId = state.toWarehouseId
              )
              runCatching {
                repo.notifyTelegram(
                  TelegramNotifyRequest(
                    context = "transfer",
                    scanner = "beverages",
                    summary = summary
                  )
                )
              }.onFailure {
                infoState.value = "Transfer done, but Telegram notification failed"
              }
            }.onSuccess {
              onConfirm()
            }.onFailure {
              errorState.value = it.message ?: "Transfer failed"
            }
            loadingState.value = false
          }
        }
      ) {
        Text(if (loadingState.value) "Processing..." else "Process transfer")
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
  val telegramItemsBlock = buildTelegramItemsBlockFromGroups(groupedLines)
  val operatorName = displayUserName(user).ifEmpty { resolvedDisplayName }

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
                runCatching {
                  val summary = TelegramSummary(
                    processedBy = operatorName,
                    sourceLabel = warehouseState.value?.name ?: "",
                    destLabel = "Damages",
                    itemsBlock = telegramItemsBlock,
                    dateTime = dateTimeText,
                    warehouseId = state.warehouseId
                  )
                  repo.notifyTelegram(
                    TelegramNotifyRequest(
                      context = "damage",
                      scanner = "beverages",
                      summary = summary
                    )
                  )
                }.onFailure {
                  infoState.value = "Damage saved, but Telegram notification failed"
                }
              }.onSuccess {
                onConfirm()
              }.onFailure {
                errorState.value = it.message ?: "Damage submit failed"
              }
              loadingState.value = false
            }
          }
        ) {
          Text(if (loadingState.value) "Submitting..." else "Confirm damage")
        }
      }
    }
  }
}

@Composable
fun PurchaseSetupScreen(
  repo: Repository,
  token: String?,
  sessionStore: SessionStore,
  state: PurchaseState,
  onBack: () -> Unit,
  onNext: () -> Unit
) {
  val suppliersState = remember { mutableStateOf<List<Supplier>>(emptyList()) }
  val selectedSupplier = remember { mutableStateOf<Supplier?>(null) }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(token) {
    if (token == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val suppliers = repo.listSuppliers(token)
      val filteredSuppliers = if (PURCHASE_SUPPLIER_IDS.isEmpty()) {
        suppliers
      } else {
        suppliers.filter { PURCHASE_SUPPLIER_IDS.contains(it.id) }
      }
      suppliersState.value = filteredSuppliers
      val storedSupplierId = sessionStore.getLastPurchaseSupplierId()
      if (state.supplierId == null) {
        state.supplierId = storedSupplierId
      }
      selectedSupplier.value = filteredSuppliers.firstOrNull { it.id == state.supplierId }
        ?: filteredSuppliers.firstOrNull()
      state.supplierId = selectedSupplier.value?.id
      state.warehouseId = FROM_WAREHOUSE_ID
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
      WarehouseDropdown(
        warehouses = suppliersState.value.map { Warehouse(it.id, it.name) },
        selected = selectedSupplier.value?.let { Warehouse(it.id, it.name) },
        onSelected = {
          selectedSupplier.value = Supplier(it.id, it.name)
          state.supplierId = it.id
          scope.launch {
            sessionStore.setLastPurchaseSupplierId(it.id)
          }
        }
      )

      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = state.invoiceNumber,
        onValueChange = { state.invoiceNumber = it.uppercase() },
        label = { Text("Invoice number") },
        keyboardOptions = KeyboardOptions(
          capitalization = KeyboardCapitalization.Characters,
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

  LaunchedEffect(token, state.warehouseId) {
    if (token == null || state.warehouseId == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val items = repo.listWarehouseItems(token, state.warehouseId!!)
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
  val telegramItemsBlock = buildTelegramItemsBlockFromGroups(groupedLines)

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
                runCatching {
                  val summary = TelegramSummary(
                    processedBy = resolvedUserName,
                    sourceLabel = supplierName,
                    destLabel = warehouseName,
                    itemsBlock = telegramItemsBlock,
                    reference = state.invoiceNumber.takeIf { it.isNotBlank() },
                    dateTime = dateTimeText,
                    warehouseId = state.warehouseId
                  )
                  repo.notifyTelegram(
                    TelegramNotifyRequest(
                      context = "purchase",
                      scanner = "beverages",
                      summary = summary
                    )
                  )
                }.onFailure {
                  infoState.value = "Purchase saved, but Telegram notification failed"
                }
              }.onSuccess {
                onConfirm()
              }.onFailure {
                errorState.value = it.message ?: "Purchase failed"
              }
              loadingState.value = false
            }
          }
        ) {
          Text(if (loadingState.value) "Submitting..." else "Confirm purchase")
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
  LazyVerticalGrid(
    columns = GridCells.Fixed(2),
    verticalArrangement = Arrangement.spacedBy(12.dp),
    horizontalArrangement = Arrangement.spacedBy(12.dp),
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
  LazyVerticalGrid(
    columns = GridCells.Fixed(2),
    verticalArrangement = Arrangement.spacedBy(12.dp),
    horizontalArrangement = Arrangement.spacedBy(12.dp),
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
  val formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
  return ZonedDateTime.now().format(formatter)
}

private fun buildItemKey(itemId: String, variantId: String?): String {
  val normalized = (variantId ?: "base").trim().lowercase().ifEmpty { "base" }
  return "$itemId::$normalized"
}

private fun buildTelegramItemsBlock(
  items: List<TransferLine>,
  currentQtyByKey: Map<String, Double?>
): String {
  val grouped = items.groupBy { it.item.itemId to it.item.itemName }
  val lines = mutableListOf<String>()
  grouped.forEach { (_, groupLines) ->
    val baseName = groupLines.firstOrNull()?.item?.itemName ?: ""
    lines.add(baseName)
    groupLines.forEach { line ->
      val item = line.item
      val label = item.variantName?.takeIf { it.isNotBlank() }
        ?: item.variantId?.takeIf { it.isNotBlank() && it.lowercase() != "base" }
        ?: "Base"
      val transferQty = line.quantity
      val multiplier = item.transferQuantity ?: 1.0
      val sentQty = if (multiplier > 0) transferQty / multiplier else transferQty
      val uom = formatUomLabel(item.transferUnit ?: "each")
      lines.add("- $label ${formatQty(sentQty)} $uom")
      val key = buildItemKey(item.itemId, item.variantId)
      val currentQty = currentQtyByKey[key]
      val currentText = currentQty?.let { formatQty(it) } ?: "Null"
      lines.add("Current Qty: $currentText")
    }
  }
  return lines.joinToString("\n")
}

private fun buildTelegramItemsBlockFromGroups(groups: List<TransferSummaryGroup>): String {
  val lines = mutableListOf<String>()
  groups.forEach { group ->
    if (group.baseName.isNotBlank()) {
      lines.add(group.baseName)
    }
    group.lines.forEach { line ->
      val label = line.label.trim()
      val qtyText = line.qtyText.trim()
      lines.add("$label $qtyText".trim())
    }
  }
  return lines.joinToString("\n")
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
    color = AndroidColor.RED
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
    color = AndroidColor.BLACK
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
    color = AndroidColor.RED
    textSize = 14f
    textAlign = Paint.Align.CENTER
    isUnderlineText = true
  }
  val linePaint = Paint().apply {
    color = AndroidColor.BLACK
    textSize = 12f
    textAlign = Paint.Align.LEFT
  }
  val qtyPaint = Paint().apply {
    color = AndroidColor.BLACK
    textSize = 12f
    textAlign = Paint.Align.RIGHT
  }
  val dividerPaint = Paint().apply {
    color = AndroidColor.LTGRAY
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
    color = AndroidColor.RED
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
    color = AndroidColor.BLACK
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
    color = AndroidColor.RED
    textSize = 14f
    textAlign = Paint.Align.CENTER
    isUnderlineText = true
  }
  val linePaint = Paint().apply {
    color = AndroidColor.BLACK
    textSize = 12f
    textAlign = Paint.Align.LEFT
  }
  val qtyPaint = Paint().apply {
    color = AndroidColor.BLACK
    textSize = 12f
    textAlign = Paint.Align.RIGHT
  }
  val dividerPaint = Paint().apply {
    color = AndroidColor.LTGRAY
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
  AlertDialog(
    onDismissRequest = onDismiss,
    title = {
      Text(
        text = item.variantName ?: item.itemName,
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center
      )
    },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
          formatUomLabel(item.transferUnit ?: "each"),
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
        val multiplier = item.transferQuantity ?: 1.0
        onSave(qty.toDouble() * multiplier)
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

  AlertDialog(
    onDismissRequest = onDismiss,
    title = {
      Text(
        text = item.variantName ?: item.itemName,
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center
      )
    },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
          formatUomLabel(item.transferUnit ?: "each"),
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
        val multiplier = item.transferQuantity ?: 1.0
        onSave(qty.toDouble() * multiplier)
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
      Text(
        text = item.variantName ?: item.itemName,
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center
      )
    },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
        val multiplier = item.transferQuantity ?: 1.0
        onSave(qty.toDouble() * multiplier)
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
private fun WarehouseDropdown(
  warehouses: List<Warehouse>,
  selected: Warehouse?,
  onSelected: (Warehouse) -> Unit
) {
  val expandedState = rememberSaveable { mutableStateOf(false) }
  ExposedDropdownMenuBox(
    expanded = expandedState.value,
    onExpandedChange = { expandedState.value = !expandedState.value }
  ) {
    TextField(
      modifier = Modifier
        .fillMaxWidth()
        .menuAnchor(),
      value = selected?.name ?: "",
      onValueChange = {},
      readOnly = true,
      label = { Text("Supplier") },
      trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedState.value) }
    )
    DropdownMenu(
      expanded = expandedState.value,
      onDismissRequest = { expandedState.value = false }
    ) {
      warehouses.forEach { warehouse ->
        DropdownMenuItem(
          text = { Text(warehouse.name.ifEmpty { warehouse.id }) },
          onClick = {
            onSelected(warehouse)
            expandedState.value = false
          }
        )
      }
    }
  }
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
        .heightIn(max = 240.dp)
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
