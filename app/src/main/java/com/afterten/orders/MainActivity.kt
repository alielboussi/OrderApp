package com.afterten.orders

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.afterten.orders.ui.screens.HomeScreen
import com.afterten.orders.ui.screens.LoginScreen
import com.afterten.orders.ui.screens.BackofficeHomeScreen
import com.afterten.orders.ui.theme.AppTheme
import com.afterten.orders.data.RoleGuards
import com.afterten.orders.data.hasRole
import com.afterten.orders.data.OutletSession

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AppTheme {
                Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
                    AppNavHost()
                }
            }
        }
    }
}

sealed class Routes(val route: String) {
    data object Login : Routes("login")
    data object Home : Routes("home")
    data object ProductList : Routes("product_list")
    data object CartReview : Routes("cart_review")
    data object Summary : Routes("summary")
    data object Orders : Routes("orders")
    data object BackofficeHome : Routes("backoffice_home")
    data object CatalogManager : Routes("catalog_manager")
    data object SupervisorOrders : Routes("supervisor_orders")
    data object SupervisorOrderDetail : Routes("supervisor_order_detail/{orderId}") {
        fun route(orderId: String) = "supervisor_order_detail/$orderId"
    }
}

@Composable
fun AppNavHost(navController: NavHostController = rememberNavController()) {
    val appViewModel: RootViewModel = viewModel()
    val session by appViewModel.session.collectAsState()

    fun routeFor(session: OutletSession): String = when {
        session.hasRole(RoleGuards.Backoffice) -> Routes.BackofficeHome.route
        session.hasRole(RoleGuards.Supervisor) -> Routes.SupervisorOrders.route
        session.hasRole(RoleGuards.Branch) -> Routes.Home.route
        else -> Routes.Login.route
    }

    fun navigateToRoleHome(session: OutletSession) {
        val target = routeFor(session)
        val current = navController.currentBackStackEntry?.destination?.route
        if (current == target) return
        navController.navigate(target) {
            popUpTo(Routes.Login.route) { inclusive = true }
        }
    }

    LaunchedEffect(session) {
        val s = session ?: return@LaunchedEffect
        navigateToRoleHome(s)
    }

    NavHost(navController = navController, startDestination = Routes.Login.route) {
        composable(Routes.Login.route) {
            LoginScreen(
                onLoggedIn = { navigateToRoleHome(it) },
                viewModel = appViewModel
            )
        }
        composable(Routes.Home.route) {
            HomeScreen(
                onCreateOrder = { navController.navigate(Routes.ProductList.route) },
                onViewOrders = { navController.navigate(Routes.Orders.route) },
                onLogout = {
                    appViewModel.setSession(null)
                    navController.navigate(Routes.Login.route) {
                        popUpTo(Routes.Home.route) { inclusive = true }
                    }
                },
                viewModel = appViewModel
            )
        }
        composable(Routes.ProductList.route) {
            com.afterten.orders.ui.screens.ProductListScreen(
                root = appViewModel,
                onBack = { navController.popBackStack() },
                onContinue = { navController.navigate(Routes.CartReview.route) }
            )
        }
        composable(Routes.CartReview.route) {
            com.afterten.orders.ui.screens.CartReviewScreen(
                root = appViewModel,
                onBack = { navController.popBackStack() },
                onContinue = { navController.navigate(Routes.Summary.route) }
            )
        }
        composable(Routes.Summary.route) {
            com.afterten.orders.ui.screens.OrderSummaryScreen(
                root = appViewModel,
                onBack = { navController.popBackStack() },
                onFinished = { navController.navigate(Routes.Home.route) { popUpTo(Routes.Home.route) { inclusive = true } } }
            )
        }
        composable(Routes.Orders.route) {
            com.afterten.orders.ui.screens.OrdersScreen(
                root = appViewModel,
                onBack = { navController.popBackStack() }
            )
        }
        composable(Routes.BackofficeHome.route) {
            BackofficeHomeScreen(
                onOpenCatalog = { navController.navigate(Routes.CatalogManager.route) },
                onLogout = {
                    appViewModel.setSession(null)
                    navController.navigate(Routes.Login.route) {
                        popUpTo(Routes.BackofficeHome.route) { inclusive = true }
                    }
                },
                viewModel = appViewModel
            )
        }
        composable(Routes.CatalogManager.route) {
            com.afterten.orders.ui.screens.CatalogManagementScreen(
                root = appViewModel,
                onBack = { navController.popBackStack() }
            )
        }
        composable(Routes.SupervisorOrders.route) {
            com.afterten.orders.ui.screens.SupervisorOrdersScreen(
                root = appViewModel,
                onBack = { navController.popBackStack() },
                onOpenOrder = { id -> navController.navigate(Routes.SupervisorOrderDetail.route(id)) }
            )
        }
        composable(Routes.SupervisorOrderDetail.route) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
            com.afterten.orders.ui.screens.SupervisorOrderDetailScreen(
                root = appViewModel,
                orderId = orderId,
                onBack = { navController.popBackStack() },
                onSaved = { navController.popBackStack() }
            )
        }
    }
}
