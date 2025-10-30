package com.afterten.orders.util

import java.util.Locale

fun formatMoney(amount: Double): String = "K" + String.format(Locale.US, "%.2f", amount)
