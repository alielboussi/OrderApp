package com.afterten.orders.ui.screens

import com.afterten.orders.data.SupabaseProvider.TransferWarehouseRef
import com.afterten.orders.data.SupabaseProvider.Warehouse
import com.afterten.orders.data.SupabaseProvider.WarehouseTransferDto
import org.junit.Assert.assertEquals
import org.junit.Test

class WarehousesAdminHelpersTest {

    @Test
    fun `buildWarehouseNameLookup pulls names from transfers`() {
        val warehouses = listOf(
            Warehouse(id = "primary", outletId = "o1", name = "Main Hub", active = true)
        )
        val transfers = listOf(
            transfer(
                id = "t1",
                sourceId = "primary",
                destId = "coldroom",
                sourceRef = TransferWarehouseRef(id = "primary", name = "Main Hub"),
                destRef = TransferWarehouseRef(id = "coldroom", name = "Cold Room")
            ),
            transfer(
                id = "t2",
                sourceId = "overflow",
                destId = "primary",
                sourceRef = TransferWarehouseRef(id = "overflow", name = "Overflow Storage"),
                destRef = null
            )
        )

        val lookup = buildWarehouseNameLookup(warehouses, transfers)

        assertEquals("Main Hub", lookup["primary"])
        assertEquals("Cold Room", lookup["coldroom"])
        assertEquals("Overflow Storage", lookup["overflow"])
    }

    @Test
    fun `buildSelectableWarehouses merges fallback labels`() {
        val warehouses = listOf(
            Warehouse(id = "primary", outletId = "o1", name = "Main Hub", active = true)
        )
        val warehouseNames = mapOf(
            "primary" to "Main Hub",
            "overflow" to "Overflow Storage"
        )

        val selectable = buildSelectableWarehouses(warehouses, warehouseNames)

        assertEquals(listOf("Main Hub", "Overflow Storage"), selectable.map { it.name })
        assertEquals(setOf("primary", "overflow"), selectable.map { it.id }.toSet())
    }

    private fun transfer(
        id: String,
        sourceId: String,
        destId: String,
        sourceRef: TransferWarehouseRef? = null,
        destRef: TransferWarehouseRef? = null
    ): WarehouseTransferDto = WarehouseTransferDto(
        id = id,
        status = "pending",
        note = null,
        sourceWarehouseId = sourceId,
        destWarehouseId = destId,
        createdAt = "2024-01-01T00:00:00Z",
        completedAt = null,
        sourceWarehouse = sourceRef,
        destWarehouse = destRef,
        items = emptyList()
    )
}
