package com.afterten.orders.data

import androidx.compose.runtime.Immutable

@Immutable
class RoleGuard(
    val id: String? = null,
    val slug: String? = null,
    legacySlugs: Set<String> = emptySet()
) {
    private val normalizedLegacy = legacySlugs.mapNotNull { it.trim().lowercase().takeIf(String::isNotEmpty) }.toSet()

    private fun normalize(value: String?): String? = value?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }

    fun matches(role: RoleDescriptor): Boolean {
        if (id != null && role.id?.equals(id, ignoreCase = true) == true) return true
        val normalizedSlug = normalize(role.slug) ?: normalize(role.normalizedSlug)
        val normalizedDisplay = normalize(role.displayName)
        val normalizedTarget = normalize(slug)
        if (normalizedTarget != null) {
            if (normalizedSlug == normalizedTarget || normalizedDisplay == normalizedTarget) return true
        }
        if (normalizedLegacy.isNotEmpty()) {
            if (normalizedSlug != null && normalizedSlug in normalizedLegacy) return true
            if (normalizedDisplay != null && normalizedDisplay in normalizedLegacy) return true
        }
        return false
    }
}

object RoleGuards {
    val Outlet = RoleGuard(
        id = "8cafa111-b968-455c-bf4b-7bb8577daff7",
        slug = "Outlet",
        legacySlugs = setOf("outlet", "outlet_operator")
    )
    val Supervisor = RoleGuard(
        id = "e6523948-4c2c-41d8-8cbc-27aca489dbcb",
        slug = "Main Branch Order Supervisor",
        legacySlugs = setOf("supervisor", "main_branch_order_supervisor")
    )
    val Transfers = RoleGuard(
        slug = "Transfers",
        legacySlugs = setOf("transfer_manager", "warehouse_transfers", "transfers")
    )
    val WarehouseAdmin = RoleGuard(
        id = "e091af92-912d-43f5-bf22-fd867c57a59a",
        slug = "Warehouse Admin",
        legacySlugs = setOf("admin", "warehouse_admin")
    )
}

fun OutletSession?.hasRole(guard: RoleGuard): Boolean {
    val current = this ?: return false
    return current.roles.any { guard.matches(it) }
}
