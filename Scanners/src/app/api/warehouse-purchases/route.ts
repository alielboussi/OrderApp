import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import type { PurchaseItem, WarehousePurchase } from '@/types/purchases';

const MAX_LIMIT = 200;

type PurchaseItemRaw = {
  id: string;
  receipt_id: string | null;
  item_id: string | null;
  variant_key?: string | null;
  variation_key?: string | null;
  qty_units?: number | string | null;
  qty_input_mode?: string | null;
  unit_cost?: number | string | null;
  item?: { id: string; name: string | null } | null;
  variant?: { id: string; name: string | null } | null;
};

type PurchaseRecordRaw = {
  id: string;
  warehouse_id: string | null;
  supplier_id?: string | null;
  reference_code?: string | null;
  note?: string | null;
  auto_whatsapp?: boolean | null;
  recorded_at?: string | null;
  received_at?: string | null;
  supplier?: { id: string; name: string | null } | null;
  items?: PurchaseItemRaw[] | null;
};

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

    const { data, error } = (await query) as { data: PurchaseRecordRaw[] | null; error: Error | null };
    if (error) {
      throw error;
    }

    const warehouseIds = new Set<string>();
    (data ?? []).forEach((purchase) => {
      if (purchase.warehouse_id) warehouseIds.add(purchase.warehouse_id);
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
      const whId = purchase.warehouse_id;
      const warehouseName = whId ? warehouseMap.get(whId) ?? null : null;

      return {
        id: purchase.id,
        warehouse_id: whId,
        warehouse: whId ? { id: whId, name: warehouseName } : null,
        supplier_id: purchase.supplier_id ?? null,
        supplier: purchase.supplier ?? null,
        reference_code: purchase.reference_code ?? null,
        note: purchase.note ?? null,
        auto_whatsapp: purchase.auto_whatsapp ?? null,
        recorded_at: purchase.recorded_at ?? null,
        received_at: purchase.received_at ?? null,
        items: Array.isArray(purchase.items)
          ? purchase.items.map((item) => {
              const variantKey = item.variant_key ?? item.variation_key ?? null;

              return {
                id: item.id,
                receipt_id: item.receipt_id ?? null,
                item_id: item.item_id ?? null,
                variant_key: variantKey,
                qty: Number(item.qty_units ?? 0) || 0,
                qty_input_mode: item.qty_input_mode ?? null,
                unit_cost: item.unit_cost != null ? Number(item.unit_cost) : null,
                item: item.item ?? null,
                variant: variantKey ? { id: variantKey, name: variantKey } : item.variant ?? null,
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
