package com.afterten.stocktakeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
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
import com.afterten.shared.data.SupabaseProvider
import com.afterten.shared.ui.theme.StocktakeTheme
import com.afterten.stocktakeapp.ui.screens.LoginScreen
import com.afterten.stocktakeapp.ui.screens.OutletPickerScreen
import com.afterten.stocktakeapp.ui.screens.StocktakeGridScreen
import com.afterten.stocktakeapp.ui.screens.WelcomeScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            StocktakeTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    StocktakeNavHost()
                }
            }
        }
    }
}

private sealed class Routes(val route: String) {
    data object Login : Routes("login")
    data object Welcome : Routes("welcome")
    data object OutletPicker : Routes("outlet_picker")
    data object Stocktake : Routes("stocktake")
}

@Composable
private fun StocktakeNavHost() {
    val navController = rememberNavController()
    val viewModel: RootViewModel = viewModel()
    val session by viewModel.session.collectAsState()
    var selectedOutlet by androidx.compose.runtime.remember {
        androidx.compose.runtime.mutableStateOf<SupabaseProvider.OutletWarehouseOption?>(null)
    }

    val start = Routes.Login.route

    androidx.compose.runtime.LaunchedEffect(session?.token) {
        if (session != null) {
            navController.navigate(Routes.Welcome.route) {
                popUpTo(Routes.Login.route) { inclusive = true }
            }
        }
    }

    fun onLoggedIn(s: OutletSession) {
        navController.navigate(Routes.Welcome.route) {
            popUpTo(Routes.Login.route) { inclusive = true }
        }
    }

    NavHost(navController = navController, startDestination = start) {
        composable(Routes.Login.route) {
            LoginScreen(onLoggedIn = ::onLoggedIn, viewModel = viewModel)
        }
        composable(Routes.Welcome.route) {
            WelcomeScreen(
                onSelectOutlet = { navController.navigate(Routes.OutletPicker.route) },
                onLogout = {
                    viewModel.setSession(null)
                    navController.navigate(Routes.Login.route) {
                        popUpTo(Routes.Welcome.route) { inclusive = true }
                    }
                }
            )
        }
        composable(Routes.OutletPicker.route) {
            OutletPickerScreen(
                viewModel = viewModel,
                onSelected = { option ->
                    selectedOutlet = option
                    navController.navigate(Routes.Stocktake.route)
                },
                onBack = { navController.popBackStack() }
            )
        }
        composable(Routes.Stocktake.route) {
            val outlet = selectedOutlet
            if (outlet == null) {
                navController.popBackStack()
            } else {
                StocktakeGridScreen(
                    viewModel = viewModel,
                    selection = outlet,
                    onBack = { navController.popBackStack() }
                )
            }
        }
    }
}
