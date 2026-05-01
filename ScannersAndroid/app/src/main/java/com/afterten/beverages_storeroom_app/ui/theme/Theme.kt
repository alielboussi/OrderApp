package com.afterten.beverages_storeroom_app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
  primary = BluePrimary,
  secondary = GreenPositive,
  error = RedNegative,
  background = Color.White,
  surface = Color.White,
  onPrimary = Color.White,
  onSecondary = Color.White,
  onBackground = Color.Black,
  onSurface = Color.Black,
  onError = Color.White
)

@Composable
fun AftertenTheme(content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = LightColors,
    typography = AppTypography,
    content = content
  )
}
