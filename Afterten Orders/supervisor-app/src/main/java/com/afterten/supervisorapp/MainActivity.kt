package com.afterten.supervisorapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.afterten.shared.data.OutletSession
import com.afterten.shared.data.RoleGuards
import com.afterten.shared.data.hasRole
import com.afterten.shared.ui.theme.AppTheme
import com.afterten.supervisorapp.ui.screens.HomeScreen
import com.afterten.supervisorapp.ui.screens.LoginScreen
import com.afterten.supervisorapp.ui.screens.OrderDetailScreen
import com.afterten.supervisorapp.ui.screens.OrdersListScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AppTheme {
                Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
                    SupervisorNavHost()
                }
            }
        }
    }
}

private sealed class Routes(val route: String) {
    data object Login : Routes("login")
    data object Home : Routes("home")
    data object Pending : Routes("pending")
    data object Handoffs : Routes("handoffs")
    data object Completed : Routes("completed")
    data object OrderDetail : Routes("order/{orderId}") {
        fun create(orderId: String) = "order/$orderId"
    }
}

@Composable
private fun SupervisorNavHost() {
    val navController = rememberNavController()
    val viewModel: RootViewModel = viewModel()
    val session by viewModel.session.collectAsState()

    fun navigateHome(s: OutletSession) {
        if (s.hasRole(RoleGuards.Supervisor) || s.isAdmin) {
            navController.navigate(Routes.Home.route) {
                popUpTo(Routes.Login.route) { inclusive = true }
            }
        }
    }

    NavHost(navController = navController, startDestination = Routes.Login.route) {
        composable(Routes.Login.route) {
            LoginScreen(
                onLoggedIn = { navigateHome(it) },
                viewModel = viewModel
            )
        }
        composable(Routes.Home.route) {
            HomeScreen(
                onPending = { navController.navigate(Routes.Pending.route) },
                onHandoffs = { navController.navigate(Routes.Handoffs.route) },
                onCompleted = { navController.navigate(Routes.Completed.route) },
                onLogout = {
                    viewModel.setSession(null)
                    navController.navigate(Routes.Login.route) {
                        popUpTo(Routes.Home.route) { inclusive = true }
                    }
                },
                viewModel = viewModel
            )
        }
        composable(Routes.Pending.route) {
            OrdersListScreen(
                title = "Pending Orders",
                statuses = listOf("placed"),
                onBack = { navController.popBackStack() },
                onOpenOrder = { navController.navigate(Routes.OrderDetail.create(it)) },
                viewModel = viewModel
            )
        }
        composable(Routes.Handoffs.route) {
            OrdersListScreen(
                title = "Handoffs",
                statuses = listOf("accepted"),
                onBack = { navController.popBackStack() },
                onOpenOrder = { navController.navigate(Routes.OrderDetail.create(it)) },
                viewModel = viewModel
            )
        }
        composable(Routes.Completed.route) {
            OrdersListScreen(
                title = "Completed Orders",
                statuses = listOf("completed", "offloaded", "delivered"),
                onBack = { navController.popBackStack() },
                onOpenOrder = { navController.navigate(Routes.OrderDetail.create(it)) },
                viewModel = viewModel
            )
        }
        composable(Routes.OrderDetail.route) { entry ->
            val orderId = entry.arguments?.getString("orderId").orEmpty()
            OrderDetailScreen(
                orderId = orderId,
                onBack = { navController.popBackStack() },
                viewModel = viewModel
            )
        }
    }

    if (session != null && (session!!.hasRole(RoleGuards.Supervisor) || session!!.isAdmin)) {
        val current = navController.currentBackStackEntry?.destination?.route
        if (current == Routes.Login.route) {
            navigateHome(session!!)
        }
    }
}
