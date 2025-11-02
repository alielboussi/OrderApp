package com.afterten.orders.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel

@Composable
fun TransfersScreen(
    root: RootViewModel,
    onBack: () -> Unit
) {
    val session by root.session.collectAsState()
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val maxContentWidth = 900.dp
        val contentWidth = if (this.maxWidth < maxContentWidth) this.maxWidth else maxContentWidth
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth(contentWidth / this@BoxWithConstraints.maxWidth)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.Top,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Stock Transfers", style = MaterialTheme.typography.headlineMedium)
                Spacer(Modifier.height(8.dp))
                Text(
                    "Create and manage stock movements between warehouses at your outlet.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(Modifier.height(16.dp))
                HorizontalDivider()
                Spacer(Modifier.height(16.dp))
                // Placeholder content sized comfortably for 1024x768 window
                Text("Coming soon: list transfers, create new transfer, approve/complete.")
                Spacer(Modifier.height(24.dp))
                Button(onClick = onBack) { Text("Back") }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}
