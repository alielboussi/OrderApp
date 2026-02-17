package com.afterten.ordersapp.data

import androidx.compose.runtime.Immutable

@Immutable
class RoleGuard(
    val id: String? = null,
    val slug: String? = null,
    legacySlugs: Set<String> = emptySet(),
    additionalIds: Set<String> = emptySet(),
    blockedIds: Set<String> = emptySet()
) {
    private val normalizedLegacy = legacySlugs.mapNotNull { it.trim().lowercase().takeIf(String::isNotEmpty) }.toSet()
    private val normalizedIds = buildSet {
        normalize(id)?.let { add(it) }
        additionalIds.mapNotNull { normalize(it) }.forEach { add(it) }
    }
    private val normalizedBlocked = blockedIds.mapNotNull { normalize(it) }.toSet()

    private fun normalize(value: String?): String? = value?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }

    fun matches(role: RoleDescriptor): Boolean {
        val normalizedRoleId = normalize(role.id)
        if (normalizedRoleId != null && normalizedRoleId in normalizedBlocked) return false
        if (normalizedRoleId != null && normalizedRoleId in normalizedIds) return true
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
    val Branch = RoleGuard(
        id = "8cafa111-b968-455c-bf4b-7bb8577daff7",
        slug = "branch",
        legacySlugs = setOf("outlet", "branch_operator")
    )
    val Supervisor = RoleGuard(
        id = "eef421e0-ce06-4518-93c4-6bb6525f6742",
        slug = "supervisor"
    )
    val Backoffice = RoleGuard(
        id = "de9f2075-9c97-4da1-a2a0-59ed162947e7",
        slug = "back office manager",
        legacySlugs = setOf("backoffice", "warehouse admin", "back office"),
        blockedIds = setOf("6b9e657a-6131-4a0b-8afa-0ce260f8ed0c")
    )
    val Stocktake = RoleGuard(
        id = "95b6a75d-bd46-4764-b5ea-981b1608f1ca",
        slug = "stock operator",
        legacySlugs = setOf("stocktake", "stock_taker")
    )
    val Administrator: RoleGuard = Backoffice

    // Aliases to keep older screens/routes working while enforcing the new role split
    val Outlet: RoleGuard = Branch
    val Transfers: RoleGuard = Supervisor
    val WarehouseAdmin: RoleGuard = Backoffice
}

fun OutletSession?.hasRole(guard: RoleGuard): Boolean {
    val current = this ?: return false
    return current.roles.any { guard.matches(it) }
}
