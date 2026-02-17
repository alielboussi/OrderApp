package com.afterten.stocktake.util

import java.util.Locale

fun formatMoney(amount: Double): String = "K" + String.format(Locale.US, "%.2f", amount)

fun formatPackageUnits(units: Double?): String? {
	val normalized = units?.takeIf { it > 0 } ?: return null
	return if (normalized % 1.0 == 0.0) normalized.toInt().toString() else String.format(Locale.US, "%.2f", normalized)
}
