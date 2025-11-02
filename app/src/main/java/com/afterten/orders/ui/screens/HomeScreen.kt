package com.afterten.orders.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel

@Composable
fun HomeScreen(
    onCreateOrder: () -> Unit,
    onViewOrders: () -> Unit,
    onTransfers: () -> Unit,
    onAdmin: () -> Unit,
    viewModel: RootViewModel
) {
    val session by viewModel.session.collectAsState()
    val isAdmin = session?.isAdmin == true
    val canTransfer = session?.canTransfer == true
    val isTransferManager = session?.isTransferManager == true

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = session?.outletName ?: "",
            style = MaterialTheme.typography.headlineMedium
        )
        Spacer(Modifier.height(16.dp))
        if (!isTransferManager) {
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { onCreateOrder() },
                enabled = (session?.outletId?.isNotEmpty() == true)
            ) {
                Text("Create New Order")
            }
            Spacer(Modifier.height(12.dp))
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { onViewOrders() },
                enabled = (session?.outletId?.isNotEmpty() == true)
            ) {
                Text("Orders")
            }
        }
        if (canTransfer) {
            Spacer(Modifier.height(12.dp))
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { onTransfers() },
                enabled = session != null
            ) {
                Text("Stock Transfers")
            }
        }
        if (isAdmin) {
            Spacer(Modifier.height(12.dp))
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { onAdmin() },
                enabled = session != null
            ) {
                Text("Admin")
            }
        }
    }
}
