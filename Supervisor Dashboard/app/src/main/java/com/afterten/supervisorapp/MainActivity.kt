package com.afterten.supervisorapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.afterten.supervisorapp.ui.screens.LoginScreen
import com.afterten.shared.ui.theme.AppTheme
import com.afterten.shared.data.OutletSession

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
    data object SupervisorOrders : Routes("supervisor_orders")
    data object SupervisorOffloadedOrders : Routes("supervisor_offloaded_orders")
    data object SupervisorOrderDetail : Routes("supervisor_order_detail/{orderId}") {
        fun route(orderId: String) = "supervisor_order_detail/$orderId"
    }
}

@Composable
fun AppNavHost(navController: NavHostController = rememberNavController()) {
    val appViewModel: RootViewModel = viewModel()
    val session by appViewModel.session.collectAsState()

    fun routeFor(@Suppress("UNUSED_PARAMETER") session: OutletSession): String = Routes.SupervisorOrders.route

    fun navigateToRoleHome(session: OutletSession) {
        val target = routeFor(session)
        val current = navController.currentBackStackEntry?.destination?.route
        if (current == target) return
        navController.navigate(target) {
            popUpTo(Routes.Login.route) { inclusive = true }
        }
    }

    NavHost(navController = navController, startDestination = Routes.Login.route) {
        composable(Routes.Login.route) {
            LoginScreen(
                onLoggedIn = { navigateToRoleHome(it) },
                viewModel = appViewModel
            )
        }
        composable(Routes.SupervisorOrders.route) {
            com.afterten.supervisorapp.ui.screens.SupervisorOrdersScreen(
                root = appViewModel,
                onBack = { navController.popBackStack() },
                onOpenOrder = { id -> navController.navigate(Routes.SupervisorOrderDetail.route(id)) },
                onOpenOffloaded = { navController.navigate(Routes.SupervisorOffloadedOrders.route) }
            )
        }
        composable(Routes.SupervisorOffloadedOrders.route) {
            com.afterten.supervisorapp.ui.screens.SupervisorOffloadedOrdersScreen(
                root = appViewModel,
                onBack = { navController.popBackStack() }
            )
        }
        composable(Routes.SupervisorOrderDetail.route) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
            com.afterten.supervisorapp.ui.screens.SupervisorOrderDetailScreen(
                root = appViewModel,
                orderId = orderId,
                onBack = { navController.popBackStack() },
                onSaved = { navController.popBackStack() }
            )
        }
    }
}
