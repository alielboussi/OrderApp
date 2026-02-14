import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import { aggregateStockRows, collectDescendantIds, filterRowsBySearch } from '@/lib/warehouse-helpers';
import type { Warehouse, WarehouseStockRow } from '@/types/warehouse';

const STOCK_VIEW_NAME = process.env.STOCK_VIEW_NAME ?? 'warehouse_stock_items';

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

type SupabaseError = { code?: string; message?: string } | null;

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));
    const warehouseId = typeof payload.warehouseId === 'string' ? payload.warehouseId : '';
    const search = typeof payload.search === 'string' ? payload.search : undefined;

    if (!warehouseId) {
      return NextResponse.json({ error: 'warehouseId is required' }, { status: 400 });
    }

    const supabase = getServiceClient();

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

    let stockRows: StockRecord[] = [];
    let stockError: SupabaseError = null;

    const primary = await supabase
      .from(STOCK_VIEW_NAME)
      .select('warehouse_id,item_id,item_name,variant_key,net_units')
      .in('warehouse_id', targetIds);
    stockRows = (primary.data as StockRecord[] | null) ?? [];
    stockError = primary.error;

    if (stockError?.code === '42703') {
      const fallback = await supabase
        .from(STOCK_VIEW_NAME)
        .select('warehouse_id,product_id,variant_key,qty')
        .in('warehouse_id', targetIds);
      stockRows = (fallback.data as StockRecord[] | null) ?? [];
      stockError = fallback.error;
    }

    if (stockError) {
      throw stockError;
    }

    const productIds = Array.from(
      new Set(
        (stockRows ?? [])
          .map((row: StockRecord) => row.item_id ?? row.product_id ?? '')
          .filter(Boolean)
      )
    );

    const productLookup = new Map<string, string>();
    const needsLookup = stockRows.some((row) => !row.item_name);
    if (needsLookup && productIds.length) {
      const { data: products, error: productsError } = await supabase
        .from('catalog_items')
        .select('id,name')
        .in('id', productIds);
      if (productsError) {
        throw productsError;
      }
      (products as ProductRecord[] | null)?.forEach((product) => {
        productLookup.set(product.id, product.name ?? 'Product');
      });
    }

    const normalizedRows: WarehouseStockRow[] = (stockRows ?? []).map((row: StockRecord) => {
      const productId = row.item_id ?? row.product_id ?? '';
      const qtyRaw = row.net_units ?? row.qty;
      const productName = row.item_name ?? productLookup.get(productId) ?? 'Product';
      return {
        warehouse_id: row.warehouse_id,
        warehouse_name: warehouses.find((wh) => wh.id === row.warehouse_id)?.name ?? 'Warehouse',
        product_id: productId,
        product_name: productName,
        variant_key: row.variant_key ?? null,
        variant_name: row.variant_key ?? null,
        qty: Number(qtyRaw) || 0,
      };
    });

    const filteredRows = filterRowsBySearch(normalizedRows, search);
    const aggregates = aggregateStockRows(filteredRows);

    return NextResponse.json({ rows: filteredRows, aggregates, warehouseCount: targetIds.length });
  } catch (error) {
    console.error('stock api failed', error);
    return NextResponse.json({ error: 'Unable to load stock data' }, { status: 500 });
  }
}
