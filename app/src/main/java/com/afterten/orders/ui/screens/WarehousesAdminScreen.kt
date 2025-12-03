package com.afterten.orders.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.OutletSession
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.ui.components.AccessDeniedCard
import com.afterten.orders.util.rememberScreenLogger

@Composable
fun WarehousesAdminScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    val session = root.session.collectAsState().value
    val logger = rememberScreenLogger("WarehousesAdmin")

    LaunchedEffect(Unit) {
        logger.enter(mapOf("hasWarehouseAdminRole" to session.hasRequiredWarehouseAdminRole()))
    }

    if (!session.hasRequiredWarehouseAdminRole()) {
        AccessDeniedCard(
            title = "Warehouse admin role required",
            message = "Only authorized warehouse admins can access this workspace.",
            primaryLabel = "Back",
            onPrimary = onBack,
            secondaryLabel = "Log out",
            onSecondary = onLogout
        )
        return
    }

    Box(modifier = Modifier.fillMaxSize())
}

private fun OutletSession?.hasRequiredWarehouseAdminRole(): Boolean =
    this.hasRole(RoleGuards.WarehouseAdmin)
