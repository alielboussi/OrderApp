package com.afterten.orders.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel
import com.afterten.orders.Routes

@Composable
fun HomeScreen(
    onCreateOrder: () -> Unit,
    onViewOrders: () -> Unit,
    onAdminWarehouses: () -> Unit,
    viewModel: RootViewModel
) {
    val session by viewModel.session.collectAsState()
    val isAdmin = session?.token?.let { jwtSub(it) } == "d86e2ce6-13a3-4bd9-a174-9f18f6f8a035"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = session?.outletName ?: "",
            style = MaterialTheme.typography.headlineMedium
        )
        Spacer(Modifier.height(16.dp))
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { onCreateOrder() },
            enabled = session != null
        ) {
            Text("Create New Order")
        }
        Spacer(Modifier.height(12.dp))
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { onViewOrders() },
            enabled = session != null
        ) {
            Text("Orders")
        }
        if (isAdmin) {
            Spacer(Modifier.height(12.dp))
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { onAdminWarehouses() },
                enabled = session != null
            ) {
                Text("Warehouses Admin")
            }
        }
    }
}

// Minimal JWT sub extractor (URL-safe base64 decode, no signature verification)
private fun jwtSub(jwt: String): String? {
    return try {
        val parts = jwt.split('.')
        if (parts.size < 2) return null
        val payload = parts[1]
        val decoded = android.util.Base64.decode(
            payload,
            android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP
        )
        val json = String(decoded, Charsets.UTF_8)
        val key = "\"sub\":"
        val idx = json.indexOf(key)
        if (idx < 0) return null
        val start = json.indexOf('"', idx + key.length)
        val end = json.indexOf('"', start + 1)
        if (start >= 0 && end > start) json.substring(start + 1, end) else null
    } catch (_: Throwable) { null }
}
