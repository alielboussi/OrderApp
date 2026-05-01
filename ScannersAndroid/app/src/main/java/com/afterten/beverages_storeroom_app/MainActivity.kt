package com.afterten.beverages_storeroom_app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.afterten.beverages_storeroom_app.ui.screens.AppNav
import com.afterten.beverages_storeroom_app.ui.theme.AftertenTheme

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
