import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import type { TransferItem, WarehouseTransfer } from '@/types/transfers';

const MAX_LIMIT = 200;

type TransferItemRaw = {
  id: string;
  transfer_id: string | null;
  product_id?: string | null;
  item_id?: string | null;
  variant_key?: string | null;
  variation_key?: string | null;
  qty_units?: number | string | null;
  qty?: number | string | null;
  item?: { id: string; name: string | null } | null;
  product?: { id: string; name: string | null } | null;
  variant?: { id: string; name: string | null } | null;
  variation?: { id: string; name: string | null } | null;
};

type TransferRecordRaw = {
  id: string;
  reference_code?: string | null;
  note?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  operator_name?: string | null;
  source_warehouse_id: string | null;
  destination_warehouse_id: string | null;
  items?: TransferItemRaw[] | null;
};

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
      url.searchParams.get('lockedWarehouseId')?.trim() ||
      url.searchParams.get('lockedWarehouse')?.trim() ||
      url.searchParams.get('locked_source_id')?.trim() ||
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
        created_by,
        operator_name,
        source_warehouse_id,
        destination_warehouse_id,
        items:warehouse_transfer_items (
          id,
          transfer_id,
          item_id,
          variant_key,
          qty_units,
          item:catalog_items ( id, name )
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

    const { data, error } = (await query) as { data: TransferRecordRaw[] | null; error: Error | null };
    if (error) {
      throw error;
    }

    const warehouseIds = new Set<string>();
    (data ?? []).forEach((transfer) => {
      if (transfer.source_warehouse_id) warehouseIds.add(transfer.source_warehouse_id);
      if (transfer.destination_warehouse_id) warehouseIds.add(transfer.destination_warehouse_id);
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

    const createdByIds = Array.from(
      new Set((data ?? []).map((transfer) => transfer.created_by).filter((id): id is string => !!id))
    );
    const operatorFallbackMap = new Map<string, string>();
    if (createdByIds.length > 0) {
      const { data: userRows, error: userError } = await supabase
        .schema('auth')
        .from('users')
        .select('id,email,raw_user_meta_data')
        .in('id', createdByIds);
      if (userError) throw userError;
      (userRows ?? []).forEach((row) => {
        const meta = row?.raw_user_meta_data as { display_name?: string } | null;
        const display = meta?.display_name?.trim() || row?.email?.trim();
        if (row?.id && display) operatorFallbackMap.set(row.id, display);
      });
    }

    const transfers: WarehouseTransfer[] = (data ?? []).map((transfer) => {
      const sourceIdValue = transfer.source_warehouse_id;
      const destIdValue = transfer.destination_warehouse_id;
      const sourceName = sourceIdValue ? warehouseMap.get(sourceIdValue) ?? null : null;
      const destName = destIdValue ? warehouseMap.get(destIdValue) ?? null : null;
      const operatorName = (transfer.operator_name ?? '').trim();
      const fallbackName = transfer.created_by ? operatorFallbackMap.get(transfer.created_by) ?? null : null;
      const resolvedOperator = operatorName && operatorName !== 'Operator' ? operatorName : fallbackName ?? operatorName;

      return {
        id: transfer.id,
        reference_code: transfer.reference_code ?? null,
        status: 'completed',
        note: transfer.note ?? null,
        created_at: transfer.created_at ?? null,
        completed_at: transfer.created_at ?? null,
        source_location_id: sourceIdValue,
        dest_location_id: destIdValue,
        operator_name: resolvedOperator || null,
        source: sourceIdValue ? { id: sourceIdValue, name: sourceName } : null,
        dest: destIdValue ? { id: destIdValue, name: destName } : null,
        items: Array.isArray(transfer.items)
          ? transfer.items.map((item) => {
              const variantKey = item.variant_key ?? item.variation_key ?? null;

              return {
                id: item.id,
                transfer_id: item.transfer_id ?? null,
                product_id: item.product_id ?? item.item_id ?? null,
                variant_key: variantKey,
                qty: Number(item.qty_units ?? item.qty ?? 0) || 0,
                product: item.item ?? item.product ?? null,
                variation: variantKey ? { id: variantKey, name: variantKey } : item.variant ?? item.variation ?? null,
              } satisfies TransferItem;
            })
          : [],
      };
    });

    return NextResponse.json({ transfers });
  } catch (error) {
    console.error('warehouse-transfers api failed', error);
    return NextResponse.json({ error: 'Unable to load warehouse transfers' }, { status: 500 });
  }
}
