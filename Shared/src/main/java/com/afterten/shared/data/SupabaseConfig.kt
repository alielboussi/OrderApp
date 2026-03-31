package com.afterten.shared.data

data class SupabaseConfig(
    val supabaseUrl: String,
    val supabaseAnonKey: String,
    val adminEmail: String,
    val adminUuid: String,
    val warehouseBackofficeUrl: String
) {
    val resolvedSupabaseUrl: String
        get() = warehouseBackofficeUrl.takeIf { it.isNotBlank() } ?: supabaseUrl
}
