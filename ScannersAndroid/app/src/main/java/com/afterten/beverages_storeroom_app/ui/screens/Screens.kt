package com.afterten.beverages_storeroom_app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.SyncAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.afterten.beverages_storeroom_app.data.LoginUser
import com.afterten.beverages_storeroom_app.data.PurchaseItemRequest
import com.afterten.beverages_storeroom_app.data.Repository
import com.afterten.beverages_storeroom_app.data.Supplier
import com.afterten.beverages_storeroom_app.data.TransferItemRequest
import com.afterten.beverages_storeroom_app.data.Warehouse
import com.afterten.beverages_storeroom_app.data.WarehouseItem
import com.afterten.beverages_storeroom_app.ui.theme.BluePrimary
import com.afterten.beverages_storeroom_app.ui.theme.GraySurface
import com.afterten.beverages_storeroom_app.ui.theme.GreenPositive
import com.afterten.beverages_storeroom_app.ui.theme.RedNegative
import kotlinx.coroutines.launch

private const val FROM_WAREHOUSE_ID = "f71a25d0-9ec2-454d-a606-93cfaa3c606b"
private const val TO_WAREHOUSE_A = "c4aa315f-2e09-4060-8258-9dab077271ce"
private const val TO_WAREHOUSE_B = "c77376f7-1ede-4518-8180-b3efeecda128"

class TransferState {
  var toWarehouseId: String? = null
  val items = mutableStateListOf<TransferLine>()

  fun reset() {
    toWarehouseId = null
    items.clear()
  }
}

class PurchaseState {
  var supplierId: String? = null
  var invoiceNumber: String = ""
  var warehouseId: String? = null
  val items = mutableStateListOf<PurchaseLine>()

  fun reset() {
    supplierId = null
    invoiceNumber = ""
    warehouseId = null
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

@Composable
fun LoginScreen(repo: Repository, onLogin: (String, LoginUser) -> Unit) {
  val emailState = rememberSaveable { mutableStateOf("") }
  val pinState = rememberSaveable { mutableStateOf("") }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  Scaffold(topBar = {
    TopAppBar(title = { Text("Stockroom Login") })
  }) { padding ->
    Column(
      modifier = Modifier
        .padding(padding)
        .padding(20.dp)
        .fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
      Text("Use your stocktake email and PIN", style = MaterialTheme.typography.bodyLarge)
      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = emailState.value,
        onValueChange = { emailState.value = it },
        label = { Text("Email") }
      )
      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = pinState.value,
        onValueChange = { pinState.value = it },
        label = { Text("PIN") }
      )
      if (errorState.value != null) {
        Text(errorState.value ?: "", color = RedNegative)
      }
      Button(
        modifier = Modifier.fillMaxWidth(),
        enabled = !loadingState.value,
        onClick = {
          errorState.value = null
          loadingState.value = true
          scope.launch {
            runCatching {
              repo.login(emailState.value.trim(), pinState.value.trim())
            }.onSuccess {
              onLogin(it.token, it.user)
            }.onFailure {
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
  onLogout: () -> Unit
) {
  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Afterten Scanner") },
      actions = {
        IconButton(onClick = onLogout) {
          Icon(Icons.Filled.Logout, contentDescription = "Logout")
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
        style = MaterialTheme.typography.titleMedium
      )
      ActionCard(
        title = "Transfers",
        subtitle = "Move stock between warehouses",
        icon = Icons.Filled.SyncAlt,
        onClick = onTransfers
      )
      ActionCard(
        title = "Purchases",
        subtitle = "Record inbound stock receipts",
        icon = Icons.Filled.Receipt,
        onClick = onPurchases
      )
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
      .clickable { onClick() },
    colors = CardDefaults.cardColors(containerColor = GraySurface)
  ) {
    Row(
      modifier = Modifier.padding(18.dp),
      verticalAlignment = Alignment.CenterVertically
    ) {
      Icon(icon, contentDescription = null, tint = BluePrimary)
      Spacer(Modifier.width(12.dp))
      Column {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Color.DarkGray)
      }
    }
  }
}

@Composable
fun TransferItemsScreen(
  repo: Repository,
  token: String?,
  state: TransferState,
  onBack: () -> Unit,
  onNext: () -> Unit
) {
  val itemsState = remember { mutableStateOf<List<WarehouseItem>>(emptyList()) }
  val toWarehouseState = remember { mutableStateOf<Warehouse?>(null) }
  val warehousesState = remember { mutableStateOf<List<Warehouse>>(emptyList()) }
  val queryState = rememberSaveable { mutableStateOf("") }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(token) {
    if (token == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val warehouses = repo.listWarehouses(token)
      val allowed = warehouses.filter { it.id == TO_WAREHOUSE_A || it.id == TO_WAREHOUSE_B }
      warehousesState.value = allowed
      if (state.toWarehouseId == null) {
        val first = allowed.firstOrNull()
        state.toWarehouseId = first?.id
        toWarehouseState.value = first
      } else {
        toWarehouseState.value = allowed.firstOrNull { it.id == state.toWarehouseId }
      }
      itemsState.value = repo.listWarehouseItems(token, FROM_WAREHOUSE_ID)
    }.onFailure {
      errorState.value = it.message ?: "Failed to load transfer data"
    }
    loadingState.value = false
  }

  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Transfer Items") },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
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
      Text("From warehouse", style = MaterialTheme.typography.bodyMedium, color = Color.DarkGray)
      Text("Main stockroom", style = MaterialTheme.typography.titleMedium)

      WarehouseDropdown(
        label = "To warehouse",
        warehouses = warehousesState.value,
        selected = toWarehouseState.value,
        onSelected = {
          toWarehouseState.value = it
          state.toWarehouseId = it.id
        }
      )

      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = queryState.value,
        onValueChange = { queryState.value = it },
        label = { Text("Search or scan") }
      )

      if (errorState.value != null) {
        Text(errorState.value ?: "", color = RedNegative)
      }

      if (loadingState.value) {
        Text("Loading items...")
      }

      val filtered = itemsState.value.filter { item ->
        val q = queryState.value.trim().lowercase()
        if (q.isEmpty()) true else {
          listOfNotNull(item.itemName, item.variantName, item.sku).any { it.lowercase().contains(q) }
        }
      }

      ItemGrid(
        items = filtered,
        onSelect = { item ->
          scope.launch {
            val existing = state.items.firstOrNull { it.item.itemId == item.itemId && it.item.variantId == item.variantId }
            if (existing == null) {
              state.items.add(TransferLine(item, 1.0))
            }
          }
        },
        onEditQuantity = { item, qty ->
          val existing = state.items.firstOrNull { it.item.itemId == item.itemId && it.item.variantId == item.variantId }
          if (existing == null) {
            state.items.add(TransferLine(item, qty))
          } else {
            existing.quantity = qty
          }
        }
      )

      Spacer(Modifier.weight(1f))

      Button(
        modifier = Modifier.fillMaxWidth(),
        enabled = state.toWarehouseId != null && state.items.isNotEmpty(),
        onClick = onNext
      ) {
        Text("Review transfer (${state.items.size})")
      }
    }
  }
}

@Composable
fun TransferSummaryScreen(
  repo: Repository,
  token: String?,
  state: TransferState,
  onBack: () -> Unit,
  onConfirm: () -> Unit
) {
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Transfer Summary") },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
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
      Text("Items", style = MaterialTheme.typography.titleMedium)
      LazyColumn(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.weight(1f)
      ) {
        items(state.items) { line ->
          SummaryRow(line.item, line.quantity)
        }
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
          scope.launch {
            runCatching {
              repo.transferUnits(
                token,
                FROM_WAREHOUSE_ID,
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
        Text(if (loadingState.value) "Submitting..." else "Confirm transfer")
      }
    }
  }
}

@Composable
fun PurchaseSetupScreen(
  repo: Repository,
  token: String?,
  state: PurchaseState,
  onBack: () -> Unit,
  onNext: () -> Unit
) {
  val suppliersState = remember { mutableStateOf<List<Supplier>>(emptyList()) }
  val warehousesState = remember { mutableStateOf<List<Warehouse>>(emptyList()) }
  val selectedSupplier = remember { mutableStateOf<Supplier?>(null) }
  val selectedWarehouse = remember { mutableStateOf<Warehouse?>(null) }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }

  LaunchedEffect(token) {
    if (token == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      val suppliers = repo.listSuppliers(token)
      val warehouses = repo.listWarehouses(token)
      suppliersState.value = suppliers
      warehousesState.value = warehouses
      if (state.supplierId == null) {
        selectedSupplier.value = suppliers.firstOrNull()
        state.supplierId = selectedSupplier.value?.id
      } else {
        selectedSupplier.value = suppliers.firstOrNull { it.id == state.supplierId }
      }

      if (state.warehouseId == null) {
        val defaultWarehouse = warehouses.firstOrNull { it.id == TO_WAREHOUSE_A } ?: warehouses.firstOrNull()
        selectedWarehouse.value = defaultWarehouse
        state.warehouseId = defaultWarehouse?.id
      } else {
        selectedWarehouse.value = warehouses.firstOrNull { it.id == state.warehouseId }
      }
    }.onFailure {
      errorState.value = it.message ?: "Failed to load purchase setup"
    }
    loadingState.value = false
  }

  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Purchase Setup") },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
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
        label = "Supplier",
        warehouses = suppliersState.value.map { Warehouse(it.id, it.name) },
        selected = selectedSupplier.value?.let { Warehouse(it.id, it.name) },
        onSelected = {
          selectedSupplier.value = Supplier(it.id, it.name)
          state.supplierId = it.id
        }
      )

      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = state.invoiceNumber,
        onValueChange = { state.invoiceNumber = it },
        label = { Text("Invoice number") }
      )

      WarehouseDropdown(
        label = "Receiving warehouse",
        warehouses = warehousesState.value,
        selected = selectedWarehouse.value,
        onSelected = {
          selectedWarehouse.value = it
          state.warehouseId = it.id
        }
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
        onClick = onNext
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
  onNext: () -> Unit
) {
  val itemsState = remember { mutableStateOf<List<WarehouseItem>>(emptyList()) }
  val queryState = rememberSaveable { mutableStateOf("") }
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }

  LaunchedEffect(token, state.warehouseId) {
    if (token == null || state.warehouseId == null) return@LaunchedEffect
    loadingState.value = true
    runCatching {
      itemsState.value = repo.listWarehouseItems(token, state.warehouseId!!)
    }.onFailure {
      errorState.value = it.message ?: "Failed to load items"
    }
    loadingState.value = false
  }

  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Purchase Items") },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
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
        label = { Text("Search or scan") }
      )

      if (errorState.value != null) {
        Text(errorState.value ?: "", color = RedNegative)
      }

      val filtered = itemsState.value.filter { item ->
        val q = queryState.value.trim().lowercase()
        if (q.isEmpty()) true else {
          listOfNotNull(item.itemName, item.variantName, item.sku).any { it.lowercase().contains(q) }
        }
      }

      ItemGrid(
        items = filtered,
        onSelect = { item ->
          val existing = state.items.firstOrNull { it.item.itemId == item.itemId && it.item.variantId == item.variantId }
          if (existing == null) {
            state.items.add(PurchaseLine(item, 1.0, null))
          }
        },
        onEditQuantity = { item, qty ->
          val existing = state.items.firstOrNull { it.item.itemId == item.itemId && it.item.variantId == item.variantId }
          if (existing == null) {
            state.items.add(PurchaseLine(item, qty, null))
          } else {
            existing.quantity = qty
          }
        },
        onEditCost = { item, cost ->
          val existing = state.items.firstOrNull { it.item.itemId == item.itemId && it.item.variantId == item.variantId }
          if (existing == null) {
            state.items.add(PurchaseLine(item, 1.0, cost))
          } else {
            existing.unitCost = cost
          }
        }
      )

      Spacer(Modifier.weight(1f))

      Button(
        modifier = Modifier.fillMaxWidth(),
        enabled = state.items.isNotEmpty(),
        onClick = onNext
      ) {
        Text("Review purchase (${state.items.size})")
      }
    }
  }
}

@Composable
fun PurchaseSummaryScreen(
  repo: Repository,
  token: String?,
  state: PurchaseState,
  onBack: () -> Unit,
  onConfirm: () -> Unit
) {
  val errorState = rememberSaveable { mutableStateOf<String?>(null) }
  val loadingState = rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  Scaffold(topBar = {
    TopAppBar(
      title = { Text("Purchase Summary") },
      navigationIcon = {
        IconButton(onClick = onBack) {
          Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
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
      Text("Items", style = MaterialTheme.typography.titleMedium)
      LazyColumn(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.weight(1f)
      ) {
        items(state.items) { line ->
          SummaryRow(line.item, line.quantity)
        }
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
          scope.launch {
            runCatching {
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
        Text(if (loadingState.value) "Submitting..." else "Confirm purchase")
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

@Composable
private fun ItemGrid(
  items: List<WarehouseItem>,
  onSelect: (WarehouseItem) -> Unit,
  onEditQuantity: (WarehouseItem, Double) -> Unit,
  onEditCost: ((WarehouseItem, Double?) -> Unit)? = null
) {
  val dialogState = remember { mutableStateOf<WarehouseItem?>(null) }
  val qtyState = remember { mutableStateOf("1") }
  val costState = remember { mutableStateOf("") }

  if (dialogState.value != null) {
    val item = dialogState.value!!
    AlertDialog(
      onDismissRequest = { dialogState.value = null },
      title = { Text("Quantity") },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Text(item.itemName, style = MaterialTheme.typography.bodyMedium)
          OutlinedTextField(
            value = qtyState.value,
            onValueChange = { qtyState.value = it },
            label = { Text("Qty") }
          )
          if (onEditCost != null) {
            OutlinedTextField(
              value = costState.value,
              onValueChange = { costState.value = it },
              label = { Text("Unit cost") }
            )
          }
        }
      },
      confirmButton = {
        TextButton(onClick = {
          val qty = qtyState.value.toDoubleOrNull() ?: 0.0
          onEditQuantity(item, qty)
          onEditCost?.invoke(item, costState.value.toDoubleOrNull())
          dialogState.value = null
        }) {
          Text("Save")
        }
      },
      dismissButton = {
        TextButton(onClick = { dialogState.value = null }) {
          Text("Cancel")
        }
      }
    )
  }

  LazyVerticalGrid(
    columns = GridCells.Fixed(2),
    verticalArrangement = Arrangement.spacedBy(12.dp),
    horizontalArrangement = Arrangement.spacedBy(12.dp),
    modifier = Modifier.fillMaxSize()
  ) {
    items(items) { item ->
      Card(
        modifier = Modifier
          .fillMaxWidth()
          .clickable {
            qtyState.value = "1"
            costState.value = ""
            dialogState.value = item
            onSelect(item)
          },
        colors = CardDefaults.cardColors(containerColor = GraySurface),
        shape = RoundedCornerShape(12.dp)
      ) {
        Column(
          modifier = Modifier.padding(12.dp),
          verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
          Text(item.itemName, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
          if (!item.variantName.isNullOrBlank()) {
            Text(item.variantName ?: "", style = MaterialTheme.typography.bodyMedium)
          }
          if (!item.sku.isNullOrBlank()) {
            Text("SKU ${item.sku}", style = MaterialTheme.typography.bodyMedium, color = Color.DarkGray)
          }
          if (item.onHand != null) {
            Text("On hand ${item.onHand}", style = MaterialTheme.typography.bodyMedium, color = Color.DarkGray)
          }
        }
      }
    }
  }
}

@Composable
private fun SummaryRow(item: WarehouseItem, quantity: Double) {
  Card(
    colors = CardDefaults.cardColors(containerColor = Color.White),
    shape = RoundedCornerShape(10.dp)
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(12.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Column(modifier = Modifier.weight(1f)) {
        Text(item.itemName, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (!item.variantName.isNullOrBlank()) {
          Text(item.variantName ?: "", style = MaterialTheme.typography.bodyMedium)
        }
      }
      Text("x$quantity", fontWeight = FontWeight.SemiBold)
    }
  }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun WarehouseDropdown(
  label: String,
  warehouses: List<Warehouse>,
  selected: Warehouse?,
  onSelected: (Warehouse) -> Unit
) {
  val expandedState = rememberSaveable { mutableStateOf(false) }

  ExposedDropdownMenuBox(
    expanded = expandedState.value,
    onExpandedChange = { expandedState.value = !expandedState.value }
  ) {
    OutlinedTextField(
      modifier = Modifier
        .fillMaxWidth()
        .menuAnchor(),
      value = selected?.name ?: "",
      onValueChange = {},
      readOnly = true,
      label = { Text(label) },
      trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedState.value) }
    )
    androidx.compose.material3.ExposedDropdownMenu(
      expanded = expandedState.value,
      onDismissRequest = { expandedState.value = false }
    ) {
      warehouses.forEach { warehouse ->
        DropdownMenuItem(
          text = { Text(warehouse.name) },
          onClick = {
            onSelected(warehouse)
            expandedState.value = false
          }
        )
      }
    }
  }
}
