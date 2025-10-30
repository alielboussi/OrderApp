package com.afterten.orders

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.afterten.orders.ui.screens.HomeScreen
import com.afterten.orders.ui.screens.LoginScreen
import com.afterten.orders.ui.theme.AppTheme

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
}

@Composable
fun AppNavHost(navController: NavHostController = rememberNavController()) {
    val appViewModel: RootViewModel = viewModel()

    NavHost(navController = navController, startDestination = Routes.Login.route) {
        composable(Routes.Login.route) {
            LoginScreen(
                onLoggedIn = { navController.navigate(Routes.Home.route) { popUpTo(Routes.Login.route) { inclusive = true } } },
                viewModel = appViewModel
            )
        }
        composable(Routes.Home.route) {
            HomeScreen(
                onCreateOrder = { navController.navigate(Routes.ProductList.route) },
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
                onFinished = { /* pdfPath -> TODO: upload + navigate home */ }
            )
        }
    }
}
