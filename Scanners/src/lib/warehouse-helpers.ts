import type { AggregatedStockRow, Warehouse, WarehouseStockRow } from '@/types/warehouse';

export function collectDescendantIds(warehouses: Warehouse[], rootId: string): string[] {
  const map = warehouses.reduce<Record<string, Warehouse[]>>((acc, wh) => {
    const parent = wh.parent_warehouse_id ?? '__root__';
    if (!acc[parent]) {
      acc[parent] = [];
    }
    acc[parent].push(wh);
    return acc;
  }, {});

  const result: string[] = [];
  const queue: string[] = [rootId];

  while (queue.length) {
    const current = queue.shift()!;
    result.push(current);
    const children = map[current] ?? [];
    for (const child of children) {
      queue.push(child.id);
    }
  }

  return Array.from(new Set(result));
}

export function aggregateStockRows(rows: WarehouseStockRow[]): AggregatedStockRow[] {
  const byKey = new Map<string, AggregatedStockRow>();

  for (const row of rows) {
    const qty = Number(row.qty) || 0;
    const variantKey = row.variant_key ?? 'NOVAR';
    const key = `${row.product_id}::${variantKey}`;
    const warehouseName = row.warehouse_name ?? 'Warehouse';

    if (!byKey.has(key)) {
      byKey.set(key, {
        productId: row.product_id,
        variantKey: row.variant_key ?? null,
        productName: row.product_name,
        variantName: row.variant_name ?? row.variant_key ?? null,
        totalQty: 0,
        warehouses: [],
      });
    }

    const entry = byKey.get(key)!;
    entry.totalQty += qty;
    entry.warehouses.push({
      warehouseId: row.warehouse_id,
      warehouseName,
      qty,
    });
  }

  return Array.from(byKey.values()).sort((a, b) => {
    return b.totalQty - a.totalQty || a.productName.localeCompare(b.productName);
  });
}

export function filterRowsBySearch(rows: WarehouseStockRow[], search?: string): WarehouseStockRow[] {
  if (!search) return rows;
  const lowered = search.trim().toLowerCase();
  if (!lowered) return rows;
  return rows.filter((row) => {
    return (
      row.product_name.toLowerCase().includes(lowered) ||
      (row.variant_name ?? '').toLowerCase().includes(lowered) ||
      row.product_id.toLowerCase().includes(lowered) ||
      (row.variant_key ?? '').toLowerCase().includes(lowered)
    );
  });
}
