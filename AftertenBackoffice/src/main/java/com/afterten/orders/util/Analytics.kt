package com.afterten.orders.util

import android.util.Log

interface Analytics {
    fun event(name: String, props: Map<String, Any?> = emptyMap())
    fun error(name: String, message: String?, throwable: Throwable? = null, props: Map<String, Any?> = emptyMap())
}

object LogAnalytics : Analytics {
    override fun event(name: String, props: Map<String, Any?>) {
        Log.i("Analytics", "$name ${props.map { it.key+"="+it.value }.joinToString(", ")}")
    }
    override fun error(name: String, message: String?, throwable: Throwable?, props: Map<String, Any?>) {
        Log.e("Analytics", "$name ${message ?: ""} ${props.map { it.key+"="+it.value }.joinToString(", ")}", throwable)
    }
}
