package com.afterten.drinks_transfers.ui.screens

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.afterten.drinks_transfers.data.LoginUser
import com.afterten.drinks_transfers.data.Repository
import com.afterten.drinks_transfers.data.SessionStore
import com.afterten.drinks_transfers.data.SupabaseClient
import kotlinx.coroutines.launch

private const val ROUTE_LOGIN = "login"
private const val ROUTE_DASHBOARD = "dashboard"
private const val ROUTE_TRANSFER_ITEMS = "transfer_items"
private const val ROUTE_TRANSFER_VARIANTS = "transfer_variants"
private const val ROUTE_TRANSFER_SUMMARY = "transfer_summary"
private const val ROUTE_TRANSFER_DONE = "transfer_done"
private const val ROUTE_PURCHASE_SETUP = "purchase_setup"
private const val ROUTE_PURCHASE_ITEMS = "purchase_items"
private const val ROUTE_PURCHASE_SUMMARY = "purchase_summary"
private const val ROUTE_PURCHASE_DONE = "purchase_done"
private const val SESSION_TIMEOUT_MS = 15 * 60 * 1000L

@Composable
fun AppNav() {
  val navController = rememberNavController()
  val repo = remember { Repository(SupabaseClient()) }
  val context = LocalContext.current
  val sessionStore = remember { SessionStore(context) }
  val scope = rememberCoroutineScope()

  val tokenState = rememberSaveable { mutableStateOf<String?>(null) }
  val userState = remember { mutableStateOf<LoginUser?>(null) }

  val transferState = remember { TransferState() }
  val purchaseState = remember { PurchaseState() }

  val performLogout = {
    tokenState.value = null
    userState.value = null
    scope.launch {
      sessionStore.clearSession()
    }
    navController.navigate(ROUTE_LOGIN) {
      popUpTo(ROUTE_DASHBOARD) { inclusive = true }
    }
  }

  LaunchedEffect(Unit) {
    val stored = sessionStore.readSession()
    if (stored != null) {
      val now = System.currentTimeMillis()
      if (now - stored.loginAtMs > SESSION_TIMEOUT_MS) {
        performLogout()
        return@LaunchedEffect
      }
      tokenState.value = stored.token
      userState.value = LoginUser(id = stored.userId, email = stored.email)
      navController.navigate(ROUTE_DASHBOARD) {
        popUpTo(ROUTE_LOGIN) { inclusive = true }
      }
    }
  }

  NavHost(navController, startDestination = ROUTE_LOGIN) {
    composable(ROUTE_LOGIN) {
      LoginScreen(
        repo = repo,
        onLogin = { token, user ->
          tokenState.value = token
          userState.value = user
          scope.launch {
            sessionStore.saveSession(token, user.id, user.email, System.currentTimeMillis())
          }
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
          performLogout()
        }
      )
    }

    composable(ROUTE_TRANSFER_ITEMS) {
      TransferItemsScreen(
        repo = repo,
        token = tokenState.value,
        sessionStore = sessionStore,
        state = transferState,
        onBack = { navController.popBackStack() },
        onShowVariants = { navController.navigate(ROUTE_TRANSFER_VARIANTS) },
        onReview = { navController.navigate(ROUTE_TRANSFER_SUMMARY) }
      )
    }

    composable(ROUTE_TRANSFER_VARIANTS) {
      TransferVariantsScreen(
        state = transferState,
        onBack = { navController.popBackStack() }
      )
    }

    composable(ROUTE_TRANSFER_SUMMARY) {
      TransferSummaryScreen(
        repo = repo,
        token = tokenState.value,
        user = userState.value,
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
        sessionStore = sessionStore,
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
