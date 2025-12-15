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
import androidx.navigation.navArgument
import androidx.navigation.NavType
import android.net.Uri
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
    data object Catalog : WarehouseRoutes("wb_catalog")
    data object CatalogProducts : WarehouseRoutes("wb_catalog_products")
    data object CatalogProductForm : WarehouseRoutes("wb_catalog_product_form")
    data object CatalogVariants : WarehouseRoutes("wb_catalog_variants")
    data object CatalogVariantForm : WarehouseRoutes("wb_catalog_variant_form")
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
                onOpenCatalog = { navController.navigate(WarehouseRoutes.Catalog.route) },
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
                onOpenCatalog = { navController.navigate(WarehouseRoutes.Catalog.route) },
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
        composable(WarehouseRoutes.Catalog.route) {
            CatalogLandingScreen(
                sessionFlow = root.session,
                onOpenNewProduct = { navController.navigate(WarehouseRoutes.CatalogProductForm.route) },
                onOpenProducts = { navController.navigate(WarehouseRoutes.CatalogProducts.route) },
                onBack = { navController.popBackStack(WarehouseRoutes.Inventory.route, inclusive = false) },
                onLogout = {
                    root.setSession(null)
                    navController.navigate(WarehouseRoutes.Login.route) {
                        popUpTo(WarehouseRoutes.Inventory.route) { inclusive = true }
                    }
                }
            )
        }
        composable(WarehouseRoutes.CatalogProducts.route) {
            CatalogProductListScreen(
                sessionFlow = root.session,
                onBack = { navController.popBackStack(WarehouseRoutes.Catalog.route, inclusive = false) },
                onLogout = {
                    root.setSession(null)
                    navController.navigate(WarehouseRoutes.Login.route) {
                        popUpTo(WarehouseRoutes.Inventory.route) { inclusive = true }
                    }
                },
                onOpenProductForm = { itemId ->
                    val route = if (itemId.isNullOrBlank()) {
                        WarehouseRoutes.CatalogProductForm.route
                    } else {
                        "${WarehouseRoutes.CatalogProductForm.route}?itemId=$itemId"
                    }
                    navController.navigate(route)
                },
                onOpenVariants = { itemId, itemName ->
                    val encodedName = Uri.encode(itemName ?: "")
                    navController.navigate("${WarehouseRoutes.CatalogVariants.route}?itemId=$itemId&itemName=$encodedName")
                }
            )
        }
        composable(
            route = "${WarehouseRoutes.CatalogProductForm.route}?itemId={itemId}",
            arguments = listOf(navArgument("itemId") { type = NavType.StringType; nullable = true; defaultValue = null })
        ) { backStackEntry ->
            val itemId = backStackEntry.arguments?.getString("itemId")
            CatalogProductFormScreen(
                sessionFlow = root.session,
                itemId = itemId,
                onBack = {
                    if (!navController.popBackStack()) navController.navigate(WarehouseRoutes.CatalogProducts.route)
                },
                onLogout = {
                    root.setSession(null)
                    navController.navigate(WarehouseRoutes.Login.route) {
                        popUpTo(WarehouseRoutes.Inventory.route) { inclusive = true }
                    }
                },
                onOpenVariants = { id, name ->
                    val encodedName = Uri.encode(name ?: "")
                    navController.navigate("${WarehouseRoutes.CatalogVariants.route}?itemId=$id&itemName=$encodedName")
                }
            )
        }
        composable(
            route = "${WarehouseRoutes.CatalogVariants.route}?itemId={itemId}&itemName={itemName}",
            arguments = listOf(
                navArgument("itemId") { type = NavType.StringType; nullable = false },
                navArgument("itemName") { type = NavType.StringType; nullable = true; defaultValue = "" }
            )
        ) { backStackEntry ->
            val itemId = backStackEntry.arguments?.getString("itemId") ?: ""
            val itemName = backStackEntry.arguments?.getString("itemName")
            CatalogVariantListScreen(
                sessionFlow = root.session,
                itemId = itemId,
                itemName = itemName,
                onBack = { navController.popBackStack() },
                onLogout = {
                    root.setSession(null)
                    navController.navigate(WarehouseRoutes.Login.route) {
                        popUpTo(WarehouseRoutes.Inventory.route) { inclusive = true }
                    }
                },
                onOpenVariantForm = { variantId ->
                    val encodedName = Uri.encode(itemName ?: "")
                    val route = if (variantId.isNullOrBlank()) {
                        "${WarehouseRoutes.CatalogVariantForm.route}?itemId=$itemId&itemName=$encodedName"
                    } else {
                        "${WarehouseRoutes.CatalogVariantForm.route}?itemId=$itemId&variantId=$variantId&itemName=$encodedName"
                    }
                    navController.navigate(route)
                }
            )
        }
        composable(
            route = "${WarehouseRoutes.CatalogVariantForm.route}?itemId={itemId}&variantId={variantId}&itemName={itemName}",
            arguments = listOf(
                navArgument("itemId") { type = NavType.StringType; nullable = false },
                navArgument("variantId") { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument("itemName") { type = NavType.StringType; nullable = true; defaultValue = "" }
            )
        ) { backStackEntry ->
            val itemId = backStackEntry.arguments?.getString("itemId") ?: ""
            val variantId = backStackEntry.arguments?.getString("variantId")
            val itemName = backStackEntry.arguments?.getString("itemName")
            CatalogVariantFormScreen(
                sessionFlow = root.session,
                itemId = itemId,
                itemName = itemName,
                variantId = variantId,
                onBack = { navController.popBackStack() },
                onLogout = {
                    root.setSession(null)
                    navController.navigate(WarehouseRoutes.Login.route) {
                        popUpTo(WarehouseRoutes.Inventory.route) { inclusive = true }
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
