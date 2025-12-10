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
    const fromLocked =
      url.searchParams.get('fromLockedId')?.trim() ||
      url.searchParams.get('from_locked_id')?.trim() ||
      url.searchParams.get('locked_from')?.trim() ||
      url.searchParams.get('locked_id')?.trim() ||
      null;
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
      .from('warehouse_transfers')
      .select(
        `
        id,
        reference_code,
        note,
        created_at,
        source_warehouse_id,
        destination_warehouse_id,
        items:warehouse_transfer_items (
          id,
          transfer_id,
          item_id,
          variant_id,
          qty_units,
          item:catalog_items ( id, name ),
          variant:catalog_variants ( id, name )
        )
      `
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (sourceId) {
      query = query.eq('source_warehouse_id', sourceId);
    } else if (fromLocked) {
      query = query.eq('source_warehouse_id', fromLocked);
    }
    if (destId) {
      query = query.eq('destination_warehouse_id', destId);
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
      if ((transfer as any).source_warehouse_id) warehouseIds.add((transfer as any).source_warehouse_id as string);
      if ((transfer as any).destination_warehouse_id) warehouseIds.add((transfer as any).destination_warehouse_id as string);
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
      const sourceIdValue = (transfer as any).source_warehouse_id as string | null;
      const destIdValue = (transfer as any).destination_warehouse_id as string | null;
      const sourceName = sourceIdValue ? warehouseMap.get(sourceIdValue) ?? null : null;
      const destName = destIdValue ? warehouseMap.get(destIdValue) ?? null : null;

      return {
        id: transfer.id,
        reference_code: (transfer as any).reference_code ?? null,
        status: 'completed',
        note: transfer.note ?? null,
        created_at: transfer.created_at ?? null,
        completed_at: transfer.created_at ?? null,
        source_location_id: sourceIdValue,
        dest_location_id: destIdValue,
        source: sourceIdValue ? { id: sourceIdValue, name: sourceName } : null,
        dest: destIdValue ? { id: destIdValue, name: destName } : null,
        items: Array.isArray((transfer as any).items)
          ? ((transfer as any).items as Array<TransferItem & { qty_units?: number | string | null }>).map((item) => ({
              id: item.id,
              transfer_id: (item as any).transfer_id ?? null,
              product_id: item.product_id ?? (item as any).item_id ?? null,
              variation_id: item.variation_id ?? (item as any).variant_id ?? null,
              qty: Number((item as any).qty_units ?? item.qty ?? 0) || 0,
              product: (item as any).item ?? item.product ?? null,
              variation: (item as any).variant ?? item.variation ?? null,
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
