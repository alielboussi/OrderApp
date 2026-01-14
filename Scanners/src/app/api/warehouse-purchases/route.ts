import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import type { PurchaseItem, WarehousePurchase } from '@/types/purchases';

const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const warehouseId = url.searchParams.get('warehouseId')?.trim() || null;
    const fromLocked =
      url.searchParams.get('fromLockedId')?.trim() ||
      url.searchParams.get('from_locked_id')?.trim() ||
      url.searchParams.get('locked_from')?.trim() ||
      url.searchParams.get('locked_id')?.trim() ||
      url.searchParams.get('lockedWarehouseId')?.trim() ||
      url.searchParams.get('lockedWarehouse')?.trim() ||
      url.searchParams.get('locked_source_id')?.trim() ||
      null;
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
      .from('warehouse_purchase_receipts')
      .select(
        `
        id,
        warehouse_id,
        supplier_id,
        reference_code,
        note,
        auto_whatsapp,
        recorded_at,
        received_at,
        supplier:suppliers ( id, name ),
        items:warehouse_purchase_items (
          id,
          receipt_id,
          item_id,
          variant_id,
          variant_key,
          qty_units,
          qty_input_mode,
          unit_cost,
          item:catalog_items ( id, name )
        )
      `
      )
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    } else if (fromLocked) {
      query = query.eq('warehouse_id', fromLocked);
    }
    if (startIso) {
      query = query.gte('recorded_at', startIso);
    }
    if (endIso) {
      query = query.lte('recorded_at', endIso);
    }

    type PurchaseRecord = WarehousePurchase & {
      items: Array<PurchaseItem & { qty_units?: number | string | null; unit_cost?: number | string | null }> | null;
    };

    const { data, error } = (await query) as { data: PurchaseRecord[] | null; error: Error | null };
    if (error) {
      throw error;
    }

    const warehouseIds = new Set<string>();
    (data ?? []).forEach((purchase) => {
      if ((purchase as any).warehouse_id) warehouseIds.add((purchase as any).warehouse_id as string);
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

    const purchases: WarehousePurchase[] = (data ?? []).map((purchase) => {
      const whId = (purchase as any).warehouse_id as string | null;
      const warehouseName = whId ? warehouseMap.get(whId) ?? null : null;

      return {
        id: purchase.id,
        warehouse_id: whId,
        warehouse: whId ? { id: whId, name: warehouseName } : null,
        supplier_id: (purchase as any).supplier_id ?? null,
        supplier: (purchase as any).supplier ?? null,
        reference_code: (purchase as any).reference_code ?? null,
        note: purchase.note ?? null,
        auto_whatsapp: (purchase as any).auto_whatsapp ?? null,
        recorded_at: (purchase as any).recorded_at ?? null,
        received_at: (purchase as any).received_at ?? null,
        items: Array.isArray((purchase as any).items)
          ? ((purchase as any).items as Array<PurchaseItem & { qty_units?: number | string | null; unit_cost?: number | string | null; variant_key?: string | null }>).map((item) => {
              const variantKey = (item as any).variant_key ?? (item as any).variation_key ?? null;
              const variantId = (item as any).variant_id ?? null;

              return {
                id: item.id,
                receipt_id: (item as any).receipt_id ?? null,
                item_id: item.item_id ?? (item as any).item_id ?? null,
                variant_key: variantKey,
                variant_id: variantId ?? variantKey ?? null,
                qty: Number((item as any).qty_units ?? 0) || 0,
                qty_input_mode: (item as any).qty_input_mode ?? null,
                unit_cost: item.unit_cost != null ? Number(item.unit_cost) : (item as any).unit_cost != null ? Number((item as any).unit_cost) : null,
                item: (item as any).item ?? null,
                variant: variantKey ? { id: variantKey, name: variantKey } : (item as any).variant ?? null,
              } satisfies PurchaseItem;
            })
          : [],
      };
    });

    return NextResponse.json({ purchases });
  } catch (error) {
    console.error('warehouse-purchases api failed', error);
    return NextResponse.json({ error: 'Unable to load warehouse purchases' }, { status: 500 });
  }
}
