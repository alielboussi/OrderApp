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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel
import com.afterten.orders.util.rememberScreenLogger

@Composable
fun HomeScreen(
    onCreateOrder: () -> Unit,
    onViewOrders: () -> Unit,
    onTransfers: () -> Unit,
    onAdminWarehouses: () -> Unit,
    onStockDashboard: () -> Unit,
    onStockLog: () -> Unit,
    onLogout: () -> Unit,
    viewModel: RootViewModel
) {
    val session by viewModel.session.collectAsState()
    val isAdmin = session?.isAdmin == true
    val canTransfer = session?.canTransfer == true
    val isTransferManager = session?.isTransferManager == true
    val isSupervisor = session?.isSupervisor == true
    val logger = rememberScreenLogger("Home")

    LaunchedEffect(Unit) {
        logger.enter(mapOf("hasSession" to (session != null)))
    }
    LaunchedEffect(session?.outletId, isAdmin, canTransfer, isTransferManager, isSupervisor) {
        logger.state(
            state = "SessionChanged",
            props = mapOf(
                "outletId" to (session?.outletId ?: ""),
                "isAdmin" to isAdmin,
                "canTransfer" to canTransfer,
                "isTransferManager" to isTransferManager,
                "isSupervisor" to isSupervisor
            )
        )
    }

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
                onClick = {
                    logger.event("LogoutTapped")
                    onLogout()
                },
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
                // Admin home: expose stock tools and warehouse admin panel
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        logger.event("StockDashboardTapped")
                        onStockDashboard()
                    },
                    enabled = session != null
                ) { Text("Stock Dashboard") }
                Spacer(Modifier.height(12.dp))
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        logger.event("StockLogTapped")
                        onStockLog()
                    },
                    enabled = session != null
                ) { Text("Stock Injection Log") }
                Spacer(Modifier.height(12.dp))
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        logger.event("WarehousesAdminTapped")
                        onAdminWarehouses()
                    },
                    enabled = session != null
                ) { Text("Warehouses Admin") }
            }
            isTransferManager -> {
                // TM home: only Transfers
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        logger.event("TransfersTapped")
                        onTransfers()
                    },
                    enabled = session != null
                ) { Text("Stock Transfers") }
            }
            isSupervisor -> {
                // Supervisor home: go to Outlet Orders (multi-outlet)
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        logger.event("SupervisorOrdersTapped")
                        onViewOrders()
                    },
                    enabled = session != null
                ) { Text("Outlet Orders") }
            }
            else -> {
                // Regular outlet user: Create and Orders
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        logger.event("CreateOrderTapped")
                        onCreateOrder()
                    },
                    enabled = (session?.outletId?.isNotEmpty() == true)
                ) { Text("Create New Order") }
                Spacer(Modifier.height(12.dp))
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        logger.event("OrdersTapped")
                        onViewOrders()
                    },
                    enabled = (session?.outletId?.isNotEmpty() == true)
                ) { Text("Orders") }
                if (canTransfer) {
                    Spacer(Modifier.height(12.dp))
                        Button(
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                logger.event("TransfersTapped")
                                onTransfers()
                            },
                            enabled = session != null
                        ) { Text("Stock Transfers") }
                }
            }
        }
    }
}
