package com.afterten.orders.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.afterten.orders.R
import com.afterten.orders.ui.components.AppOutlinedTextField
import com.afterten.orders.RootViewModel
import com.afterten.orders.data.OutletSession
import com.afterten.orders.data.repo.OutletRepository
import com.afterten.orders.util.rememberScreenLogger
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
    LaunchedEffect(error) {
        error?.let { logger.warn("ValidationErrorVisible", mapOf("message" to it.take(80))) }
    }

    fun submit() {
        error = null
        logger.event("SubmitTapped")
        if (email.isBlank() || !email.contains("@")) {
            error = "Enter a valid email"
            logger.warn("InvalidEmail", mapOf("isBlank" to email.isBlank()))
            return
        }
        // Accept any length password per new requirement
        loading = true
        val emailDomain = email.substringAfter('@', missingDelimiterValue = "unknown")
        logger.state(
            "LoginAttempt",
            mapOf(
                "emailDomain" to emailDomain,
                "hasExistingSession" to (viewModel.session.value != null)
            )
        )
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val session = repo.login(email, password)
                viewModel.setSession(session)
                logger.event(
                    "LoginSuccess",
                    mapOf(
                        "outletId" to session.outletId,
                        "isAdmin" to session.isAdmin,
                        "canTransfer" to session.canTransfer
                    )
                )
                onLoggedIn(session)
            } catch (t: Throwable) {
                error = t.message ?: "Login failed"
                logger.error("LoginFailed", t, mapOf("emailDomain" to emailDomain))
            } finally {
                loading = false
                logger.state("LoadingState", mapOf("loading" to loading))
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Brand logo above the username/password
        Logo(modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 16.dp)
        )
        Text(text = "Outlet Login", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))
        AppOutlinedTextField(
            value = email,
            onValueChange = { email = it.trim() },
            label = "Email",
            modifier = Modifier.fillMaxWidth(),
            borderColor = MaterialTheme.colorScheme.error,
            borderThickness = 2.dp,
            keyboardOptions = KeyboardOptions(
                imeAction = ImeAction.Next,
                keyboardType = KeyboardType.Email
            ),
        )
        Spacer(Modifier.height(8.dp))
        AppOutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = "Password",
            modifier = Modifier.fillMaxWidth(),
            borderColor = MaterialTheme.colorScheme.error,
            borderThickness = 2.dp,
            keyboardOptions = KeyboardOptions(
                imeAction = ImeAction.Done,
                keyboardType = KeyboardType.Password
            ),
            visualTransformation = PasswordVisualTransformation(),
            keyboardActions = KeyboardActions(onDone = {
                focus.clearFocus(); submit()
            })
        )
        if (error != null) {
            Spacer(Modifier.height(8.dp))
            Text(text = error!!, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(16.dp))
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = { submit() },
            enabled = !loading,
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFFD50000),
                contentColor = Color.White,
                disabledContainerColor = Color(0x80D50000),
                disabledContentColor = Color.White
            )
        ) {
            Text(if (loading) "Signing in…" else "Sign In")
        }
        // Removed "Forgot password? Contact admin" link per requirements
    }
}

@Composable
private fun Logo(modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(id = R.drawable.afterten_logo),
        contentDescription = null,
        modifier = modifier,
        contentScale = ContentScale.Fit
    )
}
