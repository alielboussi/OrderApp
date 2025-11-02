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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.afterten.orders.RootViewModel

@Composable
fun AdminScreen(
    root: RootViewModel,
    onBack: () -> Unit,
    onWarehouses: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top
    ) {
        Text("Admin", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(24.dp))
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { onWarehouses() }
        ) { Text("Warehouses Admin") }
        Spacer(Modifier.height(12.dp))
        // Future admin actions can be added here
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = onBack
        ) { Text("Back") }
    }
}
