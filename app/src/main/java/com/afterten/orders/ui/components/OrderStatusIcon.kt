package com.afterten.orders.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import java.util.Locale

@Composable
fun OrderStatusIcon(
    status: String,
    modifier: Modifier = Modifier,
    tint: Color = MaterialTheme.colorScheme.primary
) {
    val icon: ImageVector? = when (status.lowercase(Locale.US)) {
        "ordered", "loaded" -> Icons.Filled.LocalShipping
        "offloaded", "delivered" -> Icons.Filled.Inventory2
        else -> null
    }
    icon?.let {
        Icon(
            imageVector = it,
            contentDescription = status,
            tint = tint,
            modifier = modifier
        )
    }
}
