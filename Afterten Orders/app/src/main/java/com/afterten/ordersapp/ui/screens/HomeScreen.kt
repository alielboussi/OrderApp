package com.afterten.ordersapp.ui.screens

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import com.afterten.ordersapp.RootViewModel
import com.afterten.ordersapp.util.rememberScreenLogger
import com.afterten.ordersapp.data.RoleGuards
import com.afterten.ordersapp.data.hasRole
import com.afterten.ordersapp.ui.components.AccessDeniedCard

@Composable
fun HomeScreen(
    onCreateOrder: () -> Unit,
    onViewOrders: () -> Unit,
    onReceiveOrders: () -> Unit,
    onLogout: () -> Unit,
    viewModel: RootViewModel
) {
    val session by viewModel.session.collectAsState()
    val hasBranchRole = session.hasRole(RoleGuards.Branch)
    val logger = rememberScreenLogger("Home")

    LaunchedEffect(Unit) {
        logger.enter(mapOf("hasSession" to (session != null)))
    }
    LaunchedEffect(session?.outletId, hasBranchRole) {
        logger.state(
            state = "SessionChanged",
            props = mapOf(
                "outletId" to (session?.outletId ?: ""),
                "hasBranchRole" to hasBranchRole
            )
        )
    }

    if (session != null && !hasBranchRole) {
        AccessDeniedCard(
            title = "Outlet access required",
            message = "This dashboard is only available to outlet users.",
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
        val primaryRed = androidx.compose.ui.graphics.Color(0xFFD50000)
        val contentWhite = androidx.compose.ui.graphics.Color.White
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Button(
                onClick = {
                    logger.event("LogoutTapped")
                    onLogout()
                },
                shape = RoundedCornerShape(50),
                colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = contentWhite)
            ) {
                Text("Log out")
            }
        }

        Spacer(Modifier.height(8.dp))
        Text(
            text = session?.outletName ?: "",
            style = MaterialTheme.typography.headlineMedium
        )
        Spacer(Modifier.height(16.dp))
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                logger.event("CreateOrderTapped")
                onCreateOrder()
            },
            enabled = (session?.outletId?.isNotEmpty() == true),
            colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = contentWhite)
        ) { Text("Create New Order") }
        Spacer(Modifier.height(12.dp))
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                logger.event("ReceiveOrdersTapped")
                onReceiveOrders()
            },
            enabled = (session?.outletId?.isNotEmpty() == true),
            colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = contentWhite)
        ) { Text("Receive Orders") }
        Spacer(Modifier.height(12.dp))
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                logger.event("OrdersTapped")
                onViewOrders()
            },
            enabled = (session?.outletId?.isNotEmpty() == true),
            colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = contentWhite)
        ) { Text("Orders") }
    }
}
