package com.afterten.orders.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel

@Composable
fun HomeScreen(
    onCreateOrder: () -> Unit,
    onViewOrders: () -> Unit,
    onTransfers: () -> Unit,
    onAdminWarehouses: () -> Unit,
    onLogout: () -> Unit,
    viewModel: RootViewModel
) {
    val session by viewModel.session.collectAsState()
    val isAdmin = session?.isAdmin == true
    val canTransfer = session?.canTransfer == true
    val isTransferManager = session?.isTransferManager == true
    val isSupervisor = session?.isSupervisor == true

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Top-right logout pill
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Button(
                onClick = onLogout,
                shape = RoundedCornerShape(50),
                colors = ButtonDefaults.buttonColors()
            ) {
                Text("Log out")
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(text = session?.outletName ?: "", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(16.dp))
        when {
            isAdmin -> {
                // Admin home: only Warehouses Admin
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onAdminWarehouses() },
                    enabled = session != null
                ) { Text("Warehouses Admin") }
            }
            isTransferManager -> {
                // TM home: only Transfers
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onTransfers() },
                    enabled = session != null
                ) { Text("Stock Transfers") }
            }
            isSupervisor -> {
                // Supervisor home: only Orders
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onViewOrders() },
                    enabled = (session?.outletId?.isNotEmpty() == true)
                ) { Text("Orders") }
            }
            else -> {
                // Regular outlet user: Create and Orders
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onCreateOrder() },
                    enabled = (session?.outletId?.isNotEmpty() == true)
                ) { Text("Create New Order") }
                Spacer(Modifier.height(12.dp))
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onViewOrders() },
                    enabled = (session?.outletId?.isNotEmpty() == true)
                ) { Text("Orders") }
                if (canTransfer) {
                    Spacer(Modifier.height(12.dp))
                    Button(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { onTransfers() },
                        enabled = session != null
                    ) { Text("Stock Transfers") }
                }
            }
        }
    }
}
