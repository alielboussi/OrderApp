package com.afterten.shared.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val BrandLightColors: ColorScheme = lightColorScheme(
    primary = BrandColors.Red,
    onPrimary = BrandColors.OnRed,
    primaryContainer = Color(0xFFFFEBEE),
    onPrimaryContainer = BrandColors.RedDark,

    secondary = BrandColors.RedDark,
    onSecondary = BrandColors.OnRed,
    secondaryContainer = Color(0xFFFFCDD2),
    onSecondaryContainer = BrandColors.RedDark,

    tertiary = Color(0xFF424242),
    onTertiary = Color.White,

    background = BrandColors.Background,
    onBackground = BrandColors.TextPrimary,
    surface = BrandColors.Background,
    onSurface = BrandColors.TextPrimary,
    surfaceVariant = BrandColors.Surface,
    onSurfaceVariant = BrandColors.TextSecondary,

    outline = BrandColors.Border,
    outlineVariant = Color(0xFFEEEEEE),

    error = BrandColors.Red,
    onError = BrandColors.OnRed,
    errorContainer = Color(0xFFFFEBEE),
    onErrorContainer = BrandColors.RedDark,

    inverseSurface = BrandColors.TextPrimary,
    inverseOnSurface = BrandColors.Background,
    inversePrimary = BrandColors.RedLight
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = BrandLightColors,
        content = content
    )
}
