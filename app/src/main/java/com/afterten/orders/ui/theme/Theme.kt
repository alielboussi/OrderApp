package com.afterten.orders.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Brand palette: Black backgrounds, Red text, White accents where applicable
private val Black = Color(0xFF000000)
private val Red = Color(0xFFD32F2F)      // Primary red
private val White = Color(0xFFFFFFFF)

private val BrandDarkColors: ColorScheme = darkColorScheme(
    primary = Red,
    onPrimary = White,
    primaryContainer = Black,
    onPrimaryContainer = Red,

    secondary = Red,
    onSecondary = White,
    secondaryContainer = Black,
    onSecondaryContainer = Red,

    tertiary = Red,
    onTertiary = White,
    tertiaryContainer = Black,
    onTertiaryContainer = Red,

    background = Black,
    onBackground = Red,
    surface = Black,
    onSurface = Red,
    surfaceVariant = Black,
    onSurfaceVariant = Red,

    outline = Red,
    outlineVariant = Red,

    error = Red,
    onError = White,
    errorContainer = Black,
    onErrorContainer = Red,

    inverseSurface = Red,
    inverseOnSurface = Black,
    inversePrimary = White,
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = BrandDarkColors,
        content = content
    )
}
