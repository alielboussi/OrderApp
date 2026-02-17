package com.afterten.stocktake

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
import androidx.navigation.NavType
import androidx.navigation.navArgument
import com.afterten.stocktake.ui.screens.LoginScreen
import com.afterten.stocktake.ui.screens.BackofficeHomeScreen
import com.afterten.stocktake.ui.theme.AppTheme
import com.afterten.stocktake.data.RoleGuards
import com.afterten.stocktake.data.hasRole
import com.afterten.stocktake.data.OutletSession
import com.afterten.stocktake.ui.stocktake.StocktakeCountScreen
import com.afterten.stocktake.ui.stocktake.StocktakeDashboardScreen
import com.afterten.stocktake.ui.stocktake.StocktakePeriodsScreen
import com.afterten.stocktake.ui.stocktake.StocktakePeriodCountsScreen
import com.afterten.stocktake.ui.stocktake.StocktakeVarianceScreen

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
    data object BackofficeHome : Routes("backoffice_home")
    data object CatalogManager : Routes("catalog_manager")
    data object StocktakeDashboard : Routes("stocktake_dashboard")
    data object StocktakeCount : Routes("stocktake_count/{periodId}") {
        fun route(periodId: String) = "stocktake_count/$periodId"
    }
    data object StocktakePeriods : Routes("stocktake_periods/{warehouseId}") {
        fun route(warehouseId: String) = "stocktake_periods/$warehouseId"
    }
    data object StocktakePeriodCounts : Routes("stocktake_period_counts/{periodId}") {
        fun route(periodId: String) = "stocktake_period_counts/$periodId"
    }
    data object StocktakeVariance : Routes("stocktake_variance/{periodId}") {
        fun route(periodId: String) = "stocktake_variance/$periodId"
    }
}

@Composable
fun AppNavHost(navController: NavHostController = rememberNavController()) {
    val appViewModel: RootViewModel = viewModel()
    val session by appViewModel.session.collectAsState()

    fun routeFor(session: OutletSession): String = when {
        session.hasRole(RoleGuards.Stocktake) || session.hasRole(RoleGuards.Branch) -> Routes.StocktakeDashboard.route
        session.hasRole(RoleGuards.Backoffice) -> Routes.BackofficeHome.route
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

    NavHost(navController = navController, startDestination = Routes.Login.route) {
        composable(Routes.Login.route) {
            LoginScreen(
                onLoggedIn = { navigateToRoleHome(it) },
                viewModel = appViewModel
            )
        }
        composable(Routes.BackofficeHome.route) {
            BackofficeHomeScreen(
                onOpenCatalog = { navController.navigate(Routes.CatalogManager.route) },
                onOpenStocktake = { navController.navigate(Routes.StocktakeDashboard.route) },
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
            com.afterten.stocktake.ui.screens.CatalogManagementScreen(
                root = appViewModel,
                onBack = { navController.popBackStack() }
            )
        }
        composable(Routes.StocktakeDashboard.route) {
            StocktakeDashboardScreen(
                root = appViewModel,
                onBack = { navController.popBackStack() },
                onOpenCounts = { periodId -> navController.navigate(Routes.StocktakeCount.route(periodId)) },
                onOpenVariance = { periodId -> navController.navigate(Routes.StocktakeVariance.route(periodId)) },
                onOpenPeriods = { warehouseId -> navController.navigate(Routes.StocktakePeriods.route(warehouseId)) }
            )
        }
        composable(
            route = Routes.StocktakePeriods.route,
            arguments = listOf(navArgument("warehouseId") { type = NavType.StringType })
        ) { backStackEntry ->
            val warehouseId = backStackEntry.arguments?.getString("warehouseId") ?: ""
            StocktakePeriodsScreen(
                root = appViewModel,
                warehouseId = warehouseId,
                onBack = { navController.popBackStack() },
                onOpenPeriodDetails = { periodId -> navController.navigate(Routes.StocktakePeriodCounts.route(periodId)) }
            )
        }
        composable(
            route = Routes.StocktakePeriodCounts.route,
            arguments = listOf(navArgument("periodId") { type = NavType.StringType })
        ) { backStackEntry ->
            val periodId = backStackEntry.arguments?.getString("periodId") ?: ""
            StocktakePeriodCountsScreen(
                root = appViewModel,
                periodId = periodId,
                onBack = { navController.popBackStack() }
            )
        }
        composable(
            route = Routes.StocktakeCount.route,
            arguments = listOf(navArgument("periodId") { type = NavType.StringType })
        ) { backStackEntry ->
            val periodId = backStackEntry.arguments?.getString("periodId") ?: ""
            StocktakeCountScreen(
                root = appViewModel,
                periodId = periodId,
                onBack = { navController.popBackStack() }
            )
        }
        composable(
            route = Routes.StocktakeVariance.route,
            arguments = listOf(navArgument("periodId") { type = NavType.StringType })
        ) { backStackEntry ->
            val periodId = backStackEntry.arguments?.getString("periodId") ?: ""
            StocktakeVarianceScreen(
                root = appViewModel,
                periodId = periodId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
