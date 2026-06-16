package com.afterten.supervisorapp

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.afterten.shared.data.OutletSession
import com.afterten.shared.data.SessionStore
import com.afterten.shared.data.SupabaseProvider
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class RootViewModel(application: Application) : AndroidViewModel(application) {
    val supabaseProvider = SupabaseProvider(application, AppConfig.supabaseConfig)

    private val _session = MutableStateFlow<OutletSession?>(null)
    val session: StateFlow<OutletSession?> = _session
    private var refreshJob: Job? = null

    init {
        SessionStore.load(getApplication())?.let { setSession(it) }
    }

    fun setSession(session: OutletSession?) {
        _session.value = session
        SessionStore.save(getApplication(), session)
        refreshJob?.cancel()
        if (session != null) {
            supabaseProvider.updateRealtimeAuth(session.token)
            refreshJob = viewModelScope.launch {
                while (true) {
                    val waitMs = (session.expiresAtMillis - System.currentTimeMillis()).coerceAtLeast(5_000L)
                    delay(waitMs)
                    runCatching {
                        val (newJwt, newExp) = supabaseProvider.refreshAccessToken(session.refreshToken)
                        val updated = session.copy(token = newJwt, expiresAtMillis = newExp)
                        _session.value = updated
                        SessionStore.save(getApplication(), updated)
                        supabaseProvider.updateRealtimeAuth(newJwt)
                    }.onFailure { delay(30_000L) }
                }
            }
        }
    }
}
