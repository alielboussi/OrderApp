package com.afterten.ordersapp

import com.afterten.shared.data.SupabaseConfig

object AppConfig {
    val supabaseConfig = SupabaseConfig(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseAnonKey = BuildConfig.SUPABASE_ANON_KEY,
        adminEmail = BuildConfig.ADMIN_EMAIL,
        adminUuid = BuildConfig.ADMIN_UUID,
        warehouseBackofficeUrl = BuildConfig.WAREHOUSE_BACKOFFICE_URL
    )
}
