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
    onLogout: () -> Unit,
    viewModel: RootViewModel
) {
    val session by viewModel.session.collectAsState()
    val hasAdministrator = session.hasRole(RoleGuards.Administrator)
    val logger = rememberScreenLogger("Home")

    LaunchedEffect(Unit) {
        logger.enter(mapOf("hasSession" to (session != null)))
    }
    LaunchedEffect(session?.outletId, hasAdministrator) {
        logger.state(
            state = "SessionChanged",
            props = mapOf(
                "outletId" to (session?.outletId ?: ""),
                "hasAdministrator" to hasAdministrator
            )
        )
    }

    if (session != null && !hasAdministrator) {
        AccessDeniedCard(
            title = "Admin access required",
            message = "Backoffice is restricted to Administrators.",
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
        if (hasAdministrator) {
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    logger.event("CreateOrderAdminTapped")
                    onCreateOrder()
                },
                enabled = (session?.outletId?.isNotEmpty() == true)
            ) { Text("Create New Order") }
            Spacer(Modifier.height(12.dp))
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    logger.event("OrdersAdminTapped")
                    onViewOrders()
                },
                enabled = session != null
            ) { Text("Outlet Orders") }
        }
    }
}
