package com.afterten.beverages_storeroom_app.ui.screens

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.afterten.beverages_storeroom_app.data.Repository
import com.afterten.beverages_storeroom_app.data.SupabaseClient
import com.afterten.beverages_storeroom_app.data.LoginUser

private const val ROUTE_LOGIN = "login"
private const val ROUTE_DASHBOARD = "dashboard"
private const val ROUTE_TRANSFER_ITEMS = "transfer_items"
private const val ROUTE_TRANSFER_SUMMARY = "transfer_summary"
private const val ROUTE_TRANSFER_DONE = "transfer_done"
private const val ROUTE_PURCHASE_SETUP = "purchase_setup"
private const val ROUTE_PURCHASE_ITEMS = "purchase_items"
private const val ROUTE_PURCHASE_SUMMARY = "purchase_summary"
private const val ROUTE_PURCHASE_DONE = "purchase_done"

@Composable
fun AppNav() {
  val navController = rememberNavController()
  val repo = remember { Repository(SupabaseClient()) }

  val tokenState = rememberSaveable { mutableStateOf<String?>(null) }
  val userState = rememberSaveable { mutableStateOf<LoginUser?>(null) }

  val transferState = remember { TransferState() }
  val purchaseState = remember { PurchaseState() }

  NavHost(navController, startDestination = ROUTE_LOGIN) {
    composable(ROUTE_LOGIN) {
      LoginScreen(
        repo = repo,
        onLogin = { token, user ->
          tokenState.value = token
          userState.value = user
          navController.navigate(ROUTE_DASHBOARD) {
            popUpTo(ROUTE_LOGIN) { inclusive = true }
          }
        }
      )
    }

    composable(ROUTE_DASHBOARD) {
      DashboardScreen(
        user = userState.value,
        onTransfers = {
          transferState.reset()
          navController.navigate(ROUTE_TRANSFER_ITEMS)
        },
        onPurchases = {
          purchaseState.reset()
          navController.navigate(ROUTE_PURCHASE_SETUP)
        },
        onLogout = {
          tokenState.value = null
          userState.value = null
          navController.navigate(ROUTE_LOGIN) {
            popUpTo(ROUTE_DASHBOARD) { inclusive = true }
          }
        }
      )
    }

    composable(ROUTE_TRANSFER_ITEMS) {
      TransferItemsScreen(
        repo = repo,
        token = tokenState.value,
        state = transferState,
        onBack = { navController.popBackStack() },
        onNext = { navController.navigate(ROUTE_TRANSFER_SUMMARY) }
      )
    }

    composable(ROUTE_TRANSFER_SUMMARY) {
      TransferSummaryScreen(
        repo = repo,
        token = tokenState.value,
        state = transferState,
        onBack = { navController.popBackStack() },
        onConfirm = { navController.navigate(ROUTE_TRANSFER_DONE) }
      )
    }

    composable(ROUTE_TRANSFER_DONE) {
      SuccessScreen(
        title = "Transfer complete",
        subtitle = "Stock transfer recorded",
        buttonLabel = "Back to dashboard",
        onAction = {
          navController.navigate(ROUTE_DASHBOARD) {
            popUpTo(ROUTE_DASHBOARD) { inclusive = false }
          }
        }
      )
    }

    composable(ROUTE_PURCHASE_SETUP) {
      PurchaseSetupScreen(
        repo = repo,
        token = tokenState.value,
        state = purchaseState,
        onBack = { navController.popBackStack() },
        onNext = { navController.navigate(ROUTE_PURCHASE_ITEMS) }
      )
    }

    composable(ROUTE_PURCHASE_ITEMS) {
      PurchaseItemsScreen(
        repo = repo,
        token = tokenState.value,
        state = purchaseState,
        onBack = { navController.popBackStack() },
        onNext = { navController.navigate(ROUTE_PURCHASE_SUMMARY) }
      )
    }

    composable(ROUTE_PURCHASE_SUMMARY) {
      PurchaseSummaryScreen(
        repo = repo,
        token = tokenState.value,
        state = purchaseState,
        onBack = { navController.popBackStack() },
        onConfirm = { navController.navigate(ROUTE_PURCHASE_DONE) }
      )
    }

    composable(ROUTE_PURCHASE_DONE) {
      SuccessScreen(
        title = "Purchase recorded",
        subtitle = "Receipt saved",
        buttonLabel = "Back to dashboard",
        onAction = {
          navController.navigate(ROUTE_DASHBOARD) {
            popUpTo(ROUTE_DASHBOARD) { inclusive = false }
          }
        }
      )
    }
  }
}
