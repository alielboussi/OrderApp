package com.afterten.orders.warehouse_backoffice_mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.afterten.orders.RootViewModel
import com.afterten.orders.ui.screens.LoginScreen
import com.afterten.orders.ui.theme.AppTheme

class WarehouseBackofficeMobileActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AppTheme {
                Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
                    WarehouseBackofficeNavHost()
                }
            }
        }
    }
}

private sealed class WarehouseRoutes(val route: String) {
    data object Login : WarehouseRoutes("wb_login")
    data object Inventory : WarehouseRoutes("wb_inventory")
    data object Hub : WarehouseRoutes("wb_hub")
    data object Transfers : WarehouseRoutes("wb_transfers")
    data object Purchases : WarehouseRoutes("wb_purchases")
    data object Damages : WarehouseRoutes("wb_damages")
}

@Composable
private fun WarehouseBackofficeNavHost(navController: NavHostController = rememberNavController()) {
    val root: RootViewModel = viewModel()

    NavHost(navController = navController, startDestination = WarehouseRoutes.Login.route) {
        composable(WarehouseRoutes.Login.route) {
            LoginScreen(
                onLoggedIn = {
                    navController.navigate(WarehouseRoutes.Inventory.route) {
                        popUpTo(WarehouseRoutes.Login.route) { inclusive = true }
                    }
                },
                viewModel = root
            )
        }
        composable(WarehouseRoutes.Inventory.route) {
            InventoryLandingScreen(
                sessionFlow = root.session,
                onOpenInventory = { navController.navigate(WarehouseRoutes.Hub.route) },
                onLogout = {
                    root.setSession(null)
                    navController.navigate(WarehouseRoutes.Login.route) {
                        popUpTo(WarehouseRoutes.Inventory.route) { inclusive = true }
                    }
                }
            )
        }
        composable(WarehouseRoutes.Hub.route) {
            WarehouseBackofficeHomeScreen(
                sessionFlow = root.session,
                onOpenTransfers = { navController.navigate(WarehouseRoutes.Transfers.route) },
                onOpenPurchases = { navController.navigate(WarehouseRoutes.Purchases.route) },
                onOpenDamages = { navController.navigate(WarehouseRoutes.Damages.route) },
                onBack = { navController.popBackStack(WarehouseRoutes.Inventory.route, inclusive = false) },
                onLogout = {
                    root.setSession(null)
                    navController.navigate(WarehouseRoutes.Login.route) {
                        popUpTo(WarehouseRoutes.Inventory.route) { inclusive = true }
                    }
                }
            )
        }
        composable(WarehouseRoutes.Transfers.route) {
            WarehouseDocumentListScreen(
                title = "Transfers",
                path = "api/warehouse-transfers",
                sessionFlow = root.session,
                onBack = { navController.popBackStack() },
                onLogout = {
                    root.setSession(null)
                    navController.navigate(WarehouseRoutes.Login.route) {
                        popUpTo(WarehouseRoutes.Hub.route) { inclusive = true }
                    }
                }
            )
        }
        composable(WarehouseRoutes.Purchases.route) {
            WarehouseDocumentListScreen(
                title = "Purchases",
                path = "api/warehouse-purchases",
                sessionFlow = root.session,
                onBack = { navController.popBackStack() },
                onLogout = {
                    root.setSession(null)
                    navController.navigate(WarehouseRoutes.Login.route) {
                        popUpTo(WarehouseRoutes.Hub.route) { inclusive = true }
                    }
                }
            )
        }
        composable(WarehouseRoutes.Damages.route) {
            WarehouseDocumentListScreen(
                title = "Damages",
                path = "api/warehouse-damages",
                sessionFlow = root.session,
                onBack = { navController.popBackStack() },
                onLogout = {
                    root.setSession(null)
                    navController.navigate(WarehouseRoutes.Login.route) {
                        popUpTo(WarehouseRoutes.Hub.route) { inclusive = true }
                    }
                }
            )
        }
    }
}
