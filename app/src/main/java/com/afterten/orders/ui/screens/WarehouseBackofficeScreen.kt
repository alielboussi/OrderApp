package com.afterten.orders.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.afterten.orders.BuildConfig

@Composable
fun WarehouseBackofficeScreen(
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    val uriHandler = LocalUriHandler.current
    val backofficeUrl = BuildConfig.WAREHOUSE_BACKOFFICE_URL.ifBlank {
        "https://afterten.example.com/warehouse"
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "Warehouse Backoffice",
            style = MaterialTheme.typography.headlineSmall
        )
        Text(
            modifier = Modifier.fillMaxWidth(),
            text = "Launch the kiosk-ready backoffice to reconcile stock, manage scanners, and review metrics.",
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { uriHandler.openUri(backofficeUrl) }
        ) {
            Text("Open Backoffice")
        }
        OutlinedButton(
            modifier = Modifier.fillMaxWidth(),
            onClick = onBack
        ) {
            Text("Back")
        }
        TextButton(onClick = onLogout, colors = ButtonDefaults.textButtonColors()) {
            Text("Log out")
        }
    }
}
