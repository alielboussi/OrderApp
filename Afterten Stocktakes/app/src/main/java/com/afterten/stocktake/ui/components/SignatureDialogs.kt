package com.afterten.stocktake.ui.components

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp

@Composable
fun SignatureCaptureDialog(
    title: String,
    nameLabel: String,
    confirmLabel: String,
    initialName: String = "",
    onDismiss: () -> Unit,
    onConfirm: (String, Bitmap) -> Unit
) {
    var name by remember { mutableStateOf(initialName) }
    LaunchedEffect(initialName) {
        if (initialName.isNotBlank() && name.isBlank()) {
            name = initialName
        }
    }
    val signatureState = rememberSignatureState()
    var padSize by remember { mutableStateOf(IntSize.Zero) }
    var validationError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(nameLabel) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions.Default.copy(keyboardType = KeyboardType.Text),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))
                Text("Signature", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(6.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .border(1.5.dp, MaterialTheme.colorScheme.error, RoundedCornerShape(12.dp))
                        .padding(2.dp)
                        .clipToBounds()
                        .onSizeChanged { padSize = it }
                ) {
                    SignaturePad(modifier = Modifier.fillMaxWidth().height(180.dp), state = signatureState)
                }
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = { signatureState.clear() }) { Text("Clear Signature") }
                if (validationError != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        validationError!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val trimmed = name.trim()
                if (trimmed.length < 3) {
                    validationError = "Enter $nameLabel"
                    return@TextButton
                }
                if (!signatureState.isMeaningful()) {
                    validationError = "Please provide a signature"
                    return@TextButton
                }
                val width = padSize.width.coerceAtLeast(600)
                val height = padSize.height.coerceAtLeast(200)
                val bitmap = signatureState.toBitmap(width, height, colorOverride = Color.BLACK)
                validationError = null
                onConfirm(trimmed, bitmap)
            }) {
                Text(confirmLabel)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
