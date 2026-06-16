package com.afterten.ordersapp.ui.screens

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.afterten.ordersapp.RootViewModel
import com.afterten.shared.data.OutletSession
import com.afterten.shared.data.repo.OutletRepository
import com.afterten.shared.ui.components.AppOutlinedTextField
import com.afterten.shared.ui.components.BrandHeader
import com.afterten.shared.ui.components.PrimaryButton
import com.afterten.shared.util.rememberScreenLogger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoggedIn: (OutletSession) -> Unit,
    viewModel: RootViewModel
) {
    val repo = remember { OutletRepository(viewModel.supabaseProvider) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current
    val logger = rememberScreenLogger("Login")

    LaunchedEffect(Unit) { logger.enter() }

    fun submit() {
        error = null
        if (email.isBlank() || !email.contains("@")) {
            error = "Enter a valid email"
            return
        }
        loading = true
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val session = repo.login(email, password)
                viewModel.setSession(session)
                onLoggedIn(session)
            } catch (t: Throwable) {
                error = t.message ?: "Login failed"
                logger.error("LoginFailed", t)
            } finally {
                loading = false
            }
        }
    }

    Surface(color = MaterialTheme.colorScheme.background) {
        androidx.compose.foundation.layout.Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(32.dp))
            BrandHeader(title = "Outlet Login", subtitle = "Afterten Orders")
            Spacer(Modifier.height(24.dp))
            AppOutlinedTextField(
                value = email,
                onValueChange = { email = it.trim() },
                label = "Email",
                modifier = Modifier.fillMaxWidth(),
                borderColor = MaterialTheme.colorScheme.primary,
                borderThickness = 1.5.dp,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next, keyboardType = KeyboardType.Email)
            )
            Spacer(Modifier.height(12.dp))
            AppOutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = "Password",
                modifier = Modifier.fillMaxWidth(),
                borderColor = MaterialTheme.colorScheme.primary,
                borderThickness = 1.5.dp,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done, keyboardType = KeyboardType.Password),
                visualTransformation = PasswordVisualTransformation(),
                keyboardActions = KeyboardActions(onDone = { focus.clearFocus(); submit() })
            )
            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(text = error!!, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(20.dp))
            PrimaryButton(
                text = if (loading) "Signing in…" else "Sign In",
                onClick = { submit() },
                enabled = !loading
            )
        }
    }
}
