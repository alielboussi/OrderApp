import { NextRequest, NextResponse } from 'next/server';
import { listFirestoreWarehouses } from '@/lib/firestore-warehouses';
import { listFirestoreWarehouseLiveItems } from '@/lib/firestore-warehouse-stock';
import { aggregateStockRows, collectDescendantIds, filterRowsBySearch } from '@/lib/warehouse-helpers';
import type { Warehouse, WarehouseStockRow } from '@/types/warehouse';

const STOCK_VIEW_NAME = process.env.STOCK_VIEW_NAME ?? 'warehouse_live_items';

type WarehouseRecord = {
  id: string;
  name: string | null;
  parent_warehouse_id: string | null;
  kind: string | null;
  active: boolean | null;
};

type StockRecord = {
  warehouse_id: string;
  item_id?: string | null;
  item_name?: string | null;
  product_id?: string | null;
  variant_key?: string | null;
  qty?: number | string | null;
  net_units?: number | string | null;
};

type ProductRecord = {
  id: string;
  name: string | null;
};

type StockApiError = { code?: string; message?: string } | null;

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));
    const warehouseId = typeof payload.warehouseId === 'string' ? payload.warehouseId : '';
    const search = typeof payload.search === 'string' ? payload.search : undefined;

    if (!warehouseId) {
      return NextResponse.json({ error: 'warehouseId is required' }, { status: 400 });
    }

    const warehouses = await listFirestoreWarehouses();
if (!warehouses.some((wh) => wh.id === warehouseId)) {
  return NextResponse.json({ error: 'Warehouse not found or inactive' }, { status: 404 });
}
const targetIds = collectDescendantIds(warehouses, warehouseId);
const liveItems = await listFirestoreWarehouseLiveItems({
  warehouseIds: targetIds,
  kinds: ['finished', 'ingredient', 'raw', 'packaging', 'consumable', 'other'],
  search: search || null,
});

const normalizedRows: WarehouseStockRow[] = liveItems.map((row) => ({
  warehouse_id: row.warehouse_id,
  warehouse_name: row.warehouse_name,
  product_id: row.item_id,
  product_name: row.item_name ?? 'Product',
  variant_key: row.variant_key,
  variant_name: row.variant_key,
  qty: row.net_units,
}));

const filteredRows = filterRowsBySearch(normalizedRows, search);
const aggregates = aggregateStockRows(filteredRows);

return NextResponse.json({
  rows: filteredRows,
  aggregates,
  warehouseCount: targetIds.length,
  cloud_backend: 'firebase',
});
    
  } catch (error) {
    console.error('stock api failed', error);
    return NextResponse.json({ error: 'Unable to load stock data' }, { status: 500 });
  }
}
