import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import { aggregateStockRows, collectDescendantIds, filterRowsBySearch } from '@/lib/warehouse-helpers';
import type { Warehouse, WarehouseStockRow } from '@/types/warehouse';

const STOCK_VIEW_NAME = process.env.STOCK_VIEW_NAME ?? 'warehouse_layer_stock';

type WarehouseRecord = {
  id: string;
  name: string | null;
  parent_warehouse_id: string | null;
  kind: string | null;
  active: boolean | null;
};

type StockRecord = {
  warehouse_id: string;
  product_id: string;
  variation_id: string | null;
  qty: number | string | null;
};

type ProductRecord = {
  id: string;
  name: string | null;
};

type VariationRecord = {
  id: string;
  name: string | null;
};

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

    const { data: stockRows, error: stockError } = await supabase
      .from(STOCK_VIEW_NAME)
      .select('warehouse_id,product_id,variation_id,qty')
      .in('warehouse_id', targetIds);

    if (stockError) {
      throw stockError;
    }

    const productIds = Array.from(new Set((stockRows ?? []).map((row: StockRecord) => row.product_id))).filter(
      Boolean
    );
    const variationIds = Array.from(
      new Set(
        (stockRows ?? [])
          .map((row: StockRecord) => row.variation_id)
          .filter((id: string | null): id is string => Boolean(id))
      )
    );

    const productLookup = new Map<string, string>();
    if (productIds.length) {
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

    const variationLookup = new Map<string, string | null>();
    if (variationIds.length) {
      const { data: variations, error: variationsError } = await supabase
        .from('catalog_variants')
        .select('id,name')
        .in('id', variationIds);
      if (variationsError) {
        throw variationsError;
      }
      (variations as VariationRecord[] | null)?.forEach((variation) => {
        variationLookup.set(variation.id, variation.name ?? null);
      });
    }

    const normalizedRows: WarehouseStockRow[] = (stockRows ?? []).map((row: StockRecord) => ({
      warehouse_id: row.warehouse_id,
      warehouse_name: warehouses.find((wh) => wh.id === row.warehouse_id)?.name ?? 'Warehouse',
      product_id: row.product_id,
      product_name: productLookup.get(row.product_id) ?? 'Product',
      variation_id: row.variation_id,
      variation_name: row.variation_id ? variationLookup.get(row.variation_id) ?? null : null,
      qty: Number(row.qty) || 0,
    }));

    const filteredRows = filterRowsBySearch(normalizedRows, search);
    const aggregates = aggregateStockRows(filteredRows);

    return NextResponse.json({ rows: filteredRows, aggregates, warehouseCount: targetIds.length });
  } catch (error) {
    console.error('stock api failed', error);
    return NextResponse.json({ error: 'Unable to load stock data' }, { status: 500 });
  }
}
