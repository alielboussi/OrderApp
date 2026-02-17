package com.afterten.ordersapp.ui.screens

import com.afterten.ordersapp.data.SupabaseProvider.TransferWarehouseRef
import com.afterten.ordersapp.data.SupabaseProvider.Warehouse
import com.afterten.ordersapp.data.SupabaseProvider.WarehouseTransferDto

/**
 * Build a lookup of warehouse id to display name using the canonical warehouse list
 * and any inline names present on transfer records.
 */
fun buildWarehouseNameLookup(
    warehouses: List<Warehouse>,
    transfers: List<WarehouseTransferDto>
): Map<String, String> {
    val lookup = mutableMapOf<String, String>()

    warehouses.forEach { warehouse ->
        if (warehouse.id.isNotBlank() && warehouse.name.isNotBlank()) {
            lookup.putIfAbsent(warehouse.id, warehouse.name)
        }
    }

    fun addRef(ref: TransferWarehouseRef?) {
        val id = ref?.id
        val name = ref?.name
        if (!id.isNullOrBlank() && !name.isNullOrBlank()) {
            lookup.putIfAbsent(id, name)
        }
    }

    transfers.forEach { transfer ->
        addRef(transfer.sourceWarehouse)
        addRef(transfer.destWarehouse)
    }

    return lookup
}

/**
 * Merge the live warehouse list with fallback names discovered from transfers
 * so UI selectors can show every known location.
 */
data class SelectableWarehouse(
    val id: String,
    val name: String
)

fun buildSelectableWarehouses(
    warehouses: List<Warehouse>,
    warehouseNames: Map<String, String>
): List<SelectableWarehouse> {
    val remainingNames = warehouseNames.toMutableMap()
    val selectable = mutableListOf<SelectableWarehouse>()

    warehouses.forEach { warehouse ->
        val label = remainingNames[warehouse.id] ?: warehouse.name
        selectable.add(SelectableWarehouse(id = warehouse.id, name = label))
        remainingNames.remove(warehouse.id)
    }

    remainingNames.forEach { (id, name) ->
        selectable.add(SelectableWarehouse(id = id, name = name))
    }

    return selectable
}
