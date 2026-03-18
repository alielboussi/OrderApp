package com.afterten.stocktake.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.material3.Typography
import com.afterten.stocktake.R

// Stocktake web UI palette (Warehouse_Backoffice/stocktakes).
object StocktakePalette {
    val Background = Color(0xFF050811)
    val Panel = Color(0xFF0A101E)
    val PanelStrong = Color(0xFF0C1324)
    val Border = Color(0x24FFFFFF)
    val Text = Color(0xFFEEF2FF)
    val Muted = Color(0xFF97A7C6)
    val Accent = Color(0xFFB91C1C)
    val AccentSoft = Color(0x39B91C1C)
    val AccentBlue = Color(0xFF38BDF8)
    val AccentGreen = Color(0xFF22C55E)
    val AccentAmber = Color(0xFFF59E0B)
    val Error = Color(0xFFF87171)
}

private val BrandDarkColors = darkColorScheme(
    primary = StocktakePalette.Accent,
    onPrimary = Color(0xFFFFF1F2),
    primaryContainer = StocktakePalette.AccentSoft,
    onPrimaryContainer = StocktakePalette.Text,

    secondary = StocktakePalette.AccentBlue,
    onSecondary = StocktakePalette.Panel,
    secondaryContainer = StocktakePalette.PanelStrong,
    onSecondaryContainer = StocktakePalette.Text,

    tertiary = StocktakePalette.AccentAmber,
    onTertiary = StocktakePalette.Panel,
    tertiaryContainer = StocktakePalette.PanelStrong,
    onTertiaryContainer = StocktakePalette.Text,

    background = StocktakePalette.Background,
    onBackground = StocktakePalette.Text,
    surface = StocktakePalette.Panel,
    onSurface = StocktakePalette.Text,
    surfaceVariant = StocktakePalette.PanelStrong,
    onSurfaceVariant = StocktakePalette.Muted,

    outline = StocktakePalette.Border,
    outlineVariant = StocktakePalette.Border,

    error = StocktakePalette.Error,
    onError = StocktakePalette.Background,
    errorContainer = StocktakePalette.PanelStrong,
    onErrorContainer = StocktakePalette.Error,

    inverseSurface = StocktakePalette.Text,
    inverseOnSurface = StocktakePalette.Background,
    inversePrimary = StocktakePalette.Text
)

private val fontProvider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = R.array.com_google_android_gms_fonts_certs
)

private val spaceGrotesk = GoogleFont("Space Grotesk")

private val BrandTypography = Typography(
    defaultFontFamily = FontFamily(
        Font(spaceGrotesk, fontProvider, FontWeight.Normal, FontStyle.Normal),
        Font(spaceGrotesk, fontProvider, FontWeight.Medium, FontStyle.Normal),
        Font(spaceGrotesk, fontProvider, FontWeight.SemiBold, FontStyle.Normal),
        Font(spaceGrotesk, fontProvider, FontWeight.Bold, FontStyle.Normal)
    )
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = BrandDarkColors,
        typography = BrandTypography,
        content = content
    )
}
