package com.afterten.livestock

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
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.OutletSession
import com.afterten.orders.ui.screens.LoginScreen
import com.afterten.orders.ui.theme.AppTheme
import com.afterten.orders.ui.balances.OutletWarehouseBalancesScreen

class LiveStockMainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AppTheme {
                Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
                    LiveStockNavHost()
                }
            }
        }
    }
}

private sealed class LiveStockRoutes(val route: String) {
    data object Login : LiveStockRoutes("login")
    data object Balances : LiveStockRoutes("balances")
}

@Composable
private fun LiveStockNavHost(navController: NavHostController = rememberNavController()) {
    val appViewModel: RootViewModel = viewModel()
    val session by appViewModel.session.collectAsState()

    fun navigateToBalances(session: OutletSession) {
        val current = navController.currentBackStackEntry?.destination?.route
        if (current == LiveStockRoutes.Balances.route) return
        navController.navigate(LiveStockRoutes.Balances.route) {
            popUpTo(LiveStockRoutes.Login.route) { inclusive = true }
        }
    }

    NavHost(navController = navController, startDestination = LiveStockRoutes.Login.route) {
        composable(LiveStockRoutes.Login.route) {
            LoginScreen(
                onLoggedIn = { navigateToBalances(it) },
                viewModel = appViewModel
            )
        }
        composable(LiveStockRoutes.Balances.route) {
            OutletWarehouseBalancesScreen(
                root = appViewModel,
                onLogout = {
                    appViewModel.setSession(null)
                    navController.navigate(LiveStockRoutes.Login.route) {
                        popUpTo(LiveStockRoutes.Balances.route) { inclusive = true }
                    }
                }
            )
        }
    }
}
