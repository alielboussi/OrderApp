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
    const limitParamRaw = url.searchParams.get('limit');
    const limitParam = limitParamRaw === null ? Number.NaN : Number(limitParamRaw);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.floor(limitParam), 1), MAX_LIMIT)
      : 100;

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
        items:stock_movement_items (
          id,
          movement_id,
          product_id,
          variation_id,
          qty,
          product:catalog_items ( id, name, uom ),
          variation:catalog_variants ( id, name, uom )
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

    const warehouseIds = new Set<string>();
    (data ?? []).forEach((transfer) => {
      if (transfer.source_location_id) warehouseIds.add(transfer.source_location_id);
      if (transfer.dest_location_id) warehouseIds.add(transfer.dest_location_id);
    });

    const warehouseMap = new Map<string, string | null>();
    if (warehouseIds.size > 0) {
      const { data: warehouseRows, error: warehouseError } = await supabase
        .from('warehouses')
        .select('id,name')
        .in('id', Array.from(warehouseIds));
      if (warehouseError) {
        throw warehouseError;
      }
      warehouseRows?.forEach((row) => {
        if (row?.id) {
          warehouseMap.set(row.id, row.name ?? null);
        }
      });
    }

    const transfers: WarehouseTransfer[] = (data ?? []).map((transfer) => {
      const sourceName = transfer.source?.name ?? (transfer.source_location_id ? warehouseMap.get(transfer.source_location_id) ?? null : null);
      const destName = transfer.dest?.name ?? (transfer.dest_location_id ? warehouseMap.get(transfer.dest_location_id) ?? null : null);

      return {
        ...transfer,
        source: transfer.source_location_id
          ? { id: transfer.source_location_id, name: sourceName }
          : null,
        dest: transfer.dest_location_id
          ? { id: transfer.dest_location_id, name: destName }
          : null,
        items: Array.isArray(transfer.items)
          ? transfer.items.map((item) => ({
              ...item,
              qty: Number(item?.qty) || 0,
            }))
          : [],
      };
    });

    return NextResponse.json({ transfers });
  } catch (error) {
    console.error('warehouse-transfers api failed', error);
    return NextResponse.json({ error: 'Unable to load warehouse transfers' }, { status: 500 });
  }
}
