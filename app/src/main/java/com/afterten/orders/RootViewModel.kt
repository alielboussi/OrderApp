package com.afterten.orders

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import com.afterten.orders.data.OutletSession
import com.afterten.orders.data.SupabaseProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class RootViewModel(application: Application) : AndroidViewModel(application) {
    val supabaseProvider = SupabaseProvider(application)

    private val _session = MutableStateFlow<OutletSession?>(null)
    val session: StateFlow<OutletSession?> = _session

    fun setSession(session: OutletSession?) {
        _session.value = session
    }
}
