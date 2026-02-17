package com.afterten.stocktake.util

import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember

private const val SCREEN_TRACE_TAG = "ScreenTrace"

class ScreenLogger internal constructor(private val screenName: String) {
    fun enter(props: Map<String, Any?> = emptyMap()) {
        log(Level.INFO, "ENTER", props = props)
    }

    fun state(state: String, props: Map<String, Any?> = emptyMap()) {
        log(Level.DEBUG, "STATE:$state", props = props)
    }

    fun event(action: String, props: Map<String, Any?> = emptyMap()) {
        log(Level.DEBUG, "EVENT:$action", props = props)
    }

    fun warn(message: String, props: Map<String, Any?> = emptyMap(), throwable: Throwable? = null) {
        log(Level.WARN, message, props, throwable)
    }

    fun error(message: String, throwable: Throwable? = null, props: Map<String, Any?> = emptyMap()) {
        log(Level.ERROR, message, props, throwable)
    }

    private fun log(level: Level, message: String, props: Map<String, Any?>, throwable: Throwable? = null) {
        val formattedProps = props
            .filterKeys { !it.isNullOrBlank() }
            .entries
            .joinToString(separator = ", ") { (key, value) -> "$key=${value ?: "<null>"}" }
        val payload = buildString {
            append(screenName)
            append(" | ")
            append(message)
            if (formattedProps.isNotEmpty()) {
                append(" | ")
                append(formattedProps)
            }
        }
        when (level) {
            Level.DEBUG -> if (throwable == null) Log.d(SCREEN_TRACE_TAG, payload) else Log.d(SCREEN_TRACE_TAG, payload, throwable)
            Level.INFO -> if (throwable == null) Log.i(SCREEN_TRACE_TAG, payload) else Log.i(SCREEN_TRACE_TAG, payload, throwable)
            Level.WARN -> if (throwable == null) Log.w(SCREEN_TRACE_TAG, payload) else Log.w(SCREEN_TRACE_TAG, payload, throwable)
            Level.ERROR -> if (throwable == null) Log.e(SCREEN_TRACE_TAG, payload) else Log.e(SCREEN_TRACE_TAG, payload, throwable)
        }
    }

    private enum class Level { DEBUG, INFO, WARN, ERROR }
}

@Composable
fun rememberScreenLogger(screenName: String): ScreenLogger = remember(screenName) { ScreenLogger(screenName) }
