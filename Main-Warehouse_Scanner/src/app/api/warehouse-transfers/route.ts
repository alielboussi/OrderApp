import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import type { TransferItem, WarehouseTransfer } from '@/types/transfers';

const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sourceId = url.searchParams.get('sourceId')?.trim() || null;
    const destId = url.searchParams.get('destId')?.trim() || null;
    const startDateParam = url.searchParams.get('startDate')?.trim() || null;
    const endDateParam = url.searchParams.get('endDate')?.trim() || null;
    const limitParam = Number(url.searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.floor(limitParam), 1), MAX_LIMIT) : 100;

    const toIsoRange = (value: string | null, endOfDay: boolean) => {
      if (!value) return null;
      const parts = value.split('-').map((segment) => Number(segment));
      if (parts.length < 3) return null;
      const [year, month, day] = parts;
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
      const date = new Date(Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0));
      return date.toISOString();
    };

    const startIso = toIsoRange(startDateParam, false);
    const endIso = toIsoRange(endDateParam, true);

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
        source:warehouses!stock_movements_source_location_id_fkey (
          id,
          name
        ),
        dest:warehouses!stock_movements_dest_location_id_fkey (
          id,
          name
        ),
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
    if (startIso) {
      query = query.gte('created_at', startIso);
    }
    if (endIso) {
      query = query.lte('created_at', endIso);
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
