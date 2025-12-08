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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel
import com.afterten.orders.util.rememberScreenLogger
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard

@Composable
fun HomeScreen(
    onCreateOrder: () -> Unit,
    onViewOrders: () -> Unit,
    onTransfers: () -> Unit,
    onAdminWarehouses: () -> Unit,
    onOpenWarehouseBackoffice: () -> Unit,
    onLogout: () -> Unit,
    viewModel: RootViewModel
) {
    val session by viewModel.session.collectAsState()
    val hasWarehouseAdmin = session.hasRole(RoleGuards.WarehouseAdmin)
    val hasTransferRole = session.hasRole(RoleGuards.Transfers)
    val hasSupervisorRole = session.hasRole(RoleGuards.Supervisor)
    val hasOutletRole = session.hasRole(RoleGuards.Outlet)
    val canAccessTransfers = hasTransferRole || hasWarehouseAdmin
    val logger = rememberScreenLogger("Home")

    LaunchedEffect(Unit) {
        logger.enter(mapOf("hasSession" to (session != null)))
    }
    LaunchedEffect(session?.outletId, hasWarehouseAdmin, hasTransferRole, hasSupervisorRole, hasOutletRole) {
        logger.state(
            state = "SessionChanged",
            props = mapOf(
                "outletId" to (session?.outletId ?: ""),
                "hasWarehouseAdmin" to hasWarehouseAdmin,
                "hasTransferRole" to hasTransferRole,
                "hasSupervisorRole" to hasSupervisorRole,
                "hasOutletRole" to hasOutletRole
            )
        )
    }

    if (session != null && !hasWarehouseAdmin && !hasTransferRole && !hasSupervisorRole && !hasOutletRole) {
        AccessDeniedCard(
            title = "No roles assigned",
            message = "Your account does not have access to any dashboards. Ask an administrator to assign a role.",
            primaryLabel = "Log out",
            onPrimary = {
                logger.event("LogoutNoRole")
                onLogout()
            }
        )
        return
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
            hasWarehouseAdmin -> {
                // Admin home: offer both native Compose and kiosk web dashboards
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        logger.event("WarehouseAdminHubTapped")
                        onAdminWarehouses()
                    },
                    enabled = session != null
                ) { Text("Warehouse Admin Dashboard") }
                Spacer(Modifier.height(12.dp))
                OutlinedButton(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        logger.event("WarehouseBackofficeTapped")
                        onOpenWarehouseBackoffice()
                    },
                    enabled = session != null
                ) { Text("Warehouse Backoffice (Web)") }
            }
            hasSupervisorRole -> {
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
            hasOutletRole -> {
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
                if (canAccessTransfers) {
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
            hasTransferRole -> {
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
            else -> {
                AccessDeniedCard(
                    title = "No roles assigned",
                    message = "Your account does not have access to any dashboards. Ask an administrator to assign a role.",
                    primaryLabel = "Log out",
                    onPrimary = {
                        logger.event("LogoutNoRole")
                        onLogout()
                    }
                )
            }
        }
    }
}
