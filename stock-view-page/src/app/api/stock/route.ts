import { NextResponse } from 'next/server';
import { STOCK_VIEW_NAME, getSupabaseAdmin } from '@/lib/supabase-admin';
import { aggregateStockRows, collectDescendantIds, filterRowsBySearch } from '@/lib/warehouse-helpers';
import type { Warehouse, WarehouseStockRow } from '@/types/warehouse';

type WarehouseRecord = {
  id: string;
  name: string | null;
  parent_warehouse_id: string | null;
  kind: string | null;
  active: boolean | null;
};

type StockRecord = {
  warehouse_id: string;
  warehouse_name?: string | null;
  product_id: string;
  product_name?: string | null;
  variation_id: string | null;
  variation_name: string | null;
  qty: number | string | null;
};

export async function POST(request: Request) {
  try {
    const { warehouseId, search } = await request.json();
    if (!warehouseId || typeof warehouseId !== 'string') {
      return NextResponse.json({ error: 'warehouseId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: warehouseRows, error: warehouseError } = await supabase
      .from('warehouses')
      .select('id,name,parent_warehouse_id,kind,active')
      .eq('active', true);

    if (warehouseError) {
      throw warehouseError;
    }

    const warehouses: Warehouse[] = (warehouseRows ?? []).map((wh: WarehouseRecord) => ({
      id: wh.id,
      name: wh.name ?? 'Warehouse',
      parent_warehouse_id: wh.parent_warehouse_id,
      kind: wh.kind,
      active: wh.active ?? false,
    }));

    if (!warehouses.some((wh) => wh.id === warehouseId)) {
      return NextResponse.json({ error: 'Warehouse not found or inactive' }, { status: 404 });
    }

    const targetIds = collectDescendantIds(warehouses, warehouseId);

    const { data: stockRows, error: stockError } = await supabase
      .from(STOCK_VIEW_NAME)
      .select('warehouse_id,warehouse_name,product_id,product_name,variation_id,variation_name,qty')
      .in('warehouse_id', targetIds);

    if (stockError) {
      throw stockError;
    }

    const normalizedRows: WarehouseStockRow[] = (stockRows ?? []).map((row: StockRecord) => ({
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouse_name ?? warehouses.find((wh) => wh.id === row.warehouse_id)?.name ?? 'Warehouse',
      product_id: row.product_id,
      product_name: row.product_name ?? 'Product',
      variation_id: row.variation_id,
      variation_name: row.variation_name,
      qty: Number(row.qty) || 0,
    }));

    const filteredRows = filterRowsBySearch(normalizedRows, search);
    const aggregates = aggregateStockRows(filteredRows);

    return NextResponse.json({
      rows: filteredRows,
      aggregates,
      warehouseCount: targetIds.length,
    });
  } catch (error) {
    console.error('POST /api/stock failed', error);
    return NextResponse.json({ error: 'Unable to load stock data' }, { status: 500 });
  }
}
