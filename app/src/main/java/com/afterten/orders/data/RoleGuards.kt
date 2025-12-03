package com.afterten.orders.data

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
    val Outlet = RoleGuard(
        id = "8cafa111-b968-455c-bf4b-7bb8577daff7",
        slug = "Outlet",
        legacySlugs = setOf("outlet", "outlet_operator"),
        additionalIds = setOf("fb847394-0001-408a-83cc-791652db6cee")
    )
    val Supervisor = RoleGuard(
        id = "e6523948-4c2c-41d8-8cbc-27aca489dbcb",
        slug = "Main Branch Order Supervisor",
        legacySlugs = setOf("supervisor", "main_branch_order_supervisor"),
        additionalIds = setOf("66f6f683-6f98-415b-a66a-923684b2823f")
    )
    val Transfers = RoleGuard(
        slug = "Transfers",
        legacySlugs = setOf("transfer_manager", "warehouse_transfers", "transfers"),
        additionalIds = setOf("89147a54-507d-420b-86b4-2089d64faecd")
    )
    val WarehouseAdmin = RoleGuard(
        id = "6b9e657a-6131-4a0b-8afa-0ce260f8ed0c",
        slug = "admin",
        legacySlugs = setOf("administrator")
    )
}

fun OutletSession?.hasRole(guard: RoleGuard): Boolean {
    val current = this ?: return false
    return current.roles.any { guard.matches(it) }
}
