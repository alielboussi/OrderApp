package com.afterten.ordersapp.ui.screens

import com.afterten.ordersapp.RootViewModel
import com.afterten.shared.data.RoleGuards
import com.afterten.shared.data.hasRole
import com.afterten.shared.ui.components.AccessDeniedCard
import com.afterten.shared.ui.components.DashboardShell
import com.afterten.shared.ui.components.PrimaryButton
import com.afterten.shared.util.rememberScreenLogger
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun HomeScreen(
    onCreateOrder: () -> Unit,
    onReceiveOrders: () -> Unit,
    onOutletTransfers: () -> Unit,
    onOutletDamages: () -> Unit,
    onOutletStocktake: () -> Unit,
    onLogout: () -> Unit,
    viewModel: RootViewModel
) {
    val session by viewModel.session.collectAsState()
    val hasBranchRole = session.hasRole(RoleGuards.Branch)
    val logger = rememberScreenLogger("Home")

    LaunchedEffect(Unit) { logger.enter(mapOf("hasSession" to (session != null))) }

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

    DashboardShell(
        outletLabel = session?.outletName,
        onLogout = {
            logger.event("LogoutTapped")
            onLogout()
        }
    ) {
        val enabled = session?.outletId?.isNotEmpty() == true
        PrimaryButton("Create New Order", onClick = {
            logger.event("CreateOrderTapped")
            onCreateOrder()
        }, enabled = enabled)
        PrimaryButton("Receive Orders", onClick = {
            logger.event("ReceiveOrdersTapped")
            onReceiveOrders()
        }, enabled = enabled)
        PrimaryButton("Outlet Transfers", onClick = {
            logger.event("OutletTransfersTapped")
            onOutletTransfers()
        }, enabled = enabled)
        PrimaryButton("Outlet Damages", onClick = {
            logger.event("OutletDamagesTapped")
            onOutletDamages()
        }, enabled = enabled)
        PrimaryButton("Outlet Stocktake", onClick = {
            logger.event("OutletStocktakeTapped")
            onOutletStocktake()
        }, enabled = enabled)
        Spacer(Modifier.height(8.dp))
    }
}
