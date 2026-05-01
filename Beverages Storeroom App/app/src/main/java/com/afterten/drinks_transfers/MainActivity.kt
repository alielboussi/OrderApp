package com.afterten.drinks_transfers

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.afterten.drinks_transfers.ui.screens.AppNav
import com.afterten.drinks_transfers.ui.theme.AftertenTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      AftertenTheme {
        AppNav()
      }
    }
  }
}
