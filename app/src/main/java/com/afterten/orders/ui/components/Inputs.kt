package com.afterten.orders.ui.components

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.foundation.text.KeyboardActions

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppTextFieldColors(): TextFieldColors = TextFieldDefaults.colors(
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White,
    disabledTextColor = Color.White.copy(alpha = 0.6f),
    cursorColor = Color.White,
    focusedLabelColor = Color.White,
    unfocusedLabelColor = Color.White.copy(alpha = 0.7f),
    focusedIndicatorColor = Color.White,
    unfocusedIndicatorColor = Color.White.copy(alpha = 0.5f),
    disabledIndicatorColor = Color.White.copy(alpha = 0.3f),
    focusedContainerColor = Color.Transparent,
    unfocusedContainerColor = Color.Transparent,
    disabledContainerColor = Color.Transparent
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppOutlinedTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    singleLine: Boolean = true,
    visualTransformation: VisualTransformation = VisualTransformation.None,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = modifier,
        colors = AppTextFieldColors(),
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        singleLine = singleLine,
        visualTransformation = visualTransformation
    )
}
