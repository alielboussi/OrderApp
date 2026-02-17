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
import androidx.compose.foundation.background
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
    onReceiveOrders: () -> Unit,
    onOpenStocktake: () -> Unit,
    onOpenStocktakePeriods: () -> Unit,
    onLogout: () -> Unit,
    viewModel: RootViewModel
) {
    val session by viewModel.session.collectAsState()
    val hasBranchRole = session.hasRole(RoleGuards.Branch)
    val hasStocktakeRole = session.hasRole(RoleGuards.Stocktake)
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

    if (session != null && !(hasBranchRole || hasStocktakeRole)) {
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

    val primaryRed = androidx.compose.ui.graphics.Color(0xFFD50000)
    val backgroundBlack = androidx.compose.ui.graphics.Color.Black
    val contentWhite = androidx.compose.ui.graphics.Color.White

    Column(
        modifier = Modifier
            .fillMaxSize()
            .let { base ->
                if (hasStocktakeRole) base.background(backgroundBlack) else base
            }
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Button(
                onClick = {
                    logger.event("LogoutTapped")
                    onLogout()
                },
                shape = RoundedCornerShape(50),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (hasStocktakeRole) primaryRed else ButtonDefaults.buttonColors().containerColor,
                    contentColor = if (hasStocktakeRole) contentWhite else ButtonDefaults.buttonColors().contentColor
                )
            ) {
                Text("Log out")
            }
        }

        Spacer(Modifier.height(8.dp))
        Text(
            text = session?.outletName ?: "",
            style = MaterialTheme.typography.headlineMedium,
            color = if (hasStocktakeRole) contentWhite else MaterialTheme.colorScheme.onBackground
        )
        Spacer(Modifier.height(16.dp))

        if (hasStocktakeRole) {
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    logger.event("OutletStocktakeTapped")
                    onOpenStocktake()
                },
                enabled = true,
                colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = contentWhite)
            ) { Text("Outlet Stocktake") }
            Spacer(Modifier.height(12.dp))
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    logger.event("StocktakePeriodsTapped")
                    onOpenStocktakePeriods()
                },
                enabled = true,
                colors = ButtonDefaults.buttonColors(containerColor = primaryRed, contentColor = contentWhite)
            ) { Text("Stocktake Periods") }
        } else {
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
            Spacer(Modifier.height(12.dp))
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    logger.event("ReceiveOrdersTapped")
                    onReceiveOrders()
                },
                enabled = (session?.outletId?.isNotEmpty() == true)
            ) { Text("Receive Orders") }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    logger.event("OutletStocktakeTapped")
                    onOpenStocktake()
                },
                enabled = (session?.outletId?.isNotEmpty() == true) && hasStocktakeRole
            ) { Text("Outlet Stocktake") }
        }
    }
}
