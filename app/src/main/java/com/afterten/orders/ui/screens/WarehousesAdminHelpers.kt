package com.afterten.orders.ui.screens

import com.afterten.orders.data.SupabaseProvider.Warehouse
import com.afterten.orders.data.SupabaseProvider.WarehouseTransferDto
import java.util.Locale

internal fun buildWarehouseNameLookup(
    warehouses: List<Warehouse>,
    transfers: List<WarehouseTransferDto>
): Map<String, String> = buildMap {
    warehouses.forEach { put(it.id, it.name) }
    transfers.forEach { transfer ->
        transfer.sourceWarehouse?.let { ref ->
            val id = ref.id
            if (!id.isNullOrBlank()) put(id, ref.name ?: "Warehouse")
        }
        transfer.destWarehouse?.let { ref ->
            val id = ref.id
            if (!id.isNullOrBlank()) put(id, ref.name ?: "Warehouse")
        }
    }
}

internal fun buildSelectableWarehouses(
    warehouses: List<Warehouse>,
    warehouseNames: Map<String, String>
): List<Warehouse> {
    val fallback = warehouseNames.mapNotNull { (id, label) ->
        val safeId = id.takeIf { it.isNotBlank() } ?: return@mapNotNull null
        val safeName = label.takeIf { it.isNotBlank() } ?: return@mapNotNull null
        Warehouse(id = safeId, outletId = "", name = safeName, active = true)
    }
    return (warehouses + fallback)
        .associateBy { it.id }
        .values
        .sortedBy { it.name.lowercase(Locale.getDefault()) }
}
