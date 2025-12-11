package com.afterten.orders.data

import android.content.Context
import kotlinx.serialization.json.Json

object SessionStore {
    private const val PREF = "afterten.session"
    private const val KEY = "session_json"
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun save(context: Context, session: OutletSession?) {
        val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        if (session == null) {
            prefs.edit().remove(KEY).apply()
        } else {
            prefs.edit().putString(KEY, json.encodeToString(OutletSession.serializer(), session)).apply()
        }
    }

    fun load(context: Context): OutletSession? {
        val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val text = prefs.getString(KEY, null) ?: return null
        return runCatching { json.decodeFromString(OutletSession.serializer(), text) }.getOrNull()
    }
}
