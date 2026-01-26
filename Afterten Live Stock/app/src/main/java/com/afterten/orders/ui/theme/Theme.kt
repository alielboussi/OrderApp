package com.afterten.orders.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Warehouse backoffice-inspired palette: deep navy surfaces with cyan-blue highlights
private val Navy = Color(0xFF0B1220)
private val NavySurface = Color(0xFF0F1B2F)
private val PrimaryBlue = Color(0xFF4DB7FF)
private val AccentGreen = Color(0xFF5CF0C1)
private val AccentAmber = Color(0xFFF4C05E)
private val TextOnDark = Color(0xFFE6F1FF)

private val BrandDarkColors: ColorScheme = darkColorScheme(
    primary = PrimaryBlue,
    onPrimary = Navy,
    primaryContainer = NavySurface,
    onPrimaryContainer = TextOnDark,

    secondary = AccentGreen,
    onSecondary = Navy,
    secondaryContainer = NavySurface,
    onSecondaryContainer = TextOnDark,

    tertiary = AccentAmber,
    onTertiary = Navy,
    tertiaryContainer = NavySurface,
    onTertiaryContainer = TextOnDark,

    background = Navy,
    onBackground = TextOnDark,
    surface = NavySurface,
    onSurface = TextOnDark,
    surfaceVariant = NavySurface,
    onSurfaceVariant = TextOnDark.copy(alpha = 0.8f),

    outline = PrimaryBlue.copy(alpha = 0.5f),
    outlineVariant = PrimaryBlue.copy(alpha = 0.3f),

    error = Color(0xFFFF6B6B),
    onError = Navy,
    errorContainer = NavySurface,
    onErrorContainer = Color(0xFFFF6B6B),

    inverseSurface = TextOnDark,
    inverseOnSurface = Navy,
    inversePrimary = TextOnDark
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = BrandDarkColors,
        content = content
    )
}
