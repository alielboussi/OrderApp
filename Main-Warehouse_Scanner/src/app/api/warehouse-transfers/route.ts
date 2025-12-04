import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import type { TransferItem, WarehouseTransfer } from '@/types/transfers';

const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sourceId = url.searchParams.get('sourceId')?.trim() || null;
    const destId = url.searchParams.get('destId')?.trim() || null;
    const limitParam = Number(url.searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.floor(limitParam), 1), MAX_LIMIT) : 100;

    const supabase = getServiceClient();
    let query = supabase
      .from('stock_movements')
      .select(
        `
        id,
        status,
        note,
        created_at,
        completed_at,
        source_location_id,
        dest_location_id,
        items:stock_movement_items (
          id,
          movement_id,
          product_id,
          variation_id,
          qty,
          product:products ( id, name, uom ),
          variation:product_variations ( id, name, uom )
        )
      `
      )
      .eq('source_location_type', 'warehouse')
      .eq('dest_location_type', 'warehouse')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (sourceId) {
      query = query.eq('source_location_id', sourceId);
    }
    if (destId) {
      query = query.eq('dest_location_id', destId);
    }

    type TransferRecord = WarehouseTransfer & {
      items: Array<TransferItem & { qty: number | string | null }> | null;
    };

    const { data, error } = (await query) as { data: TransferRecord[] | null; error: Error | null };
    if (error) {
      throw error;
    }

    const transfers: WarehouseTransfer[] = (data ?? []).map((transfer) => ({
      ...transfer,
      items: Array.isArray(transfer.items)
        ? transfer.items.map((item) => ({
            ...item,
            qty: Number(item?.qty) || 0,
          }))
        : [],
    }));

    return NextResponse.json({ transfers });
  } catch (error) {
    console.error('warehouse-transfers api failed', error);
    return NextResponse.json({ error: 'Unable to load warehouse transfers' }, { status: 500 });
  }
}
