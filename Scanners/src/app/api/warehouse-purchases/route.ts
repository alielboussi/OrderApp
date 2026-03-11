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
  recorded_by?: string | null;
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
        recorded_by,
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

    const operatorMap = new Map<string, string>();
    const { data: operators } = await supabase.rpc('console_operator_directory');
    if (Array.isArray(operators)) {
      operators.forEach((op) => {
        const id = (op as { auth_user_id?: string; id?: string }).auth_user_id ?? (op as { id?: string }).id;
        const name = (op as { display_name?: string; name?: string }).display_name ?? (op as { name?: string }).name;
        if (id && name) {
          operatorMap.set(id, name);
        }
      });
    }

    const recordedByIds = Array.from(
      new Set((data ?? []).map((purchase) => purchase.recorded_by).filter((id): id is string => !!id))
    );
    const operatorFallbackMap = new Map<string, string>();
    if (recordedByIds.length > 0) {
      const { data: userRows, error: userError } = await supabase
        .schema('auth')
        .from('users')
        .select('id,email,raw_user_meta_data')
        .in('id', recordedByIds);
      if (userError) throw userError;
      (userRows ?? []).forEach((row) => {
        const meta = row?.raw_user_meta_data as { display_name?: string } | null;
        const display = meta?.display_name?.trim() || row?.email?.trim();
        if (row?.id && display) operatorFallbackMap.set(row.id, display);
      });
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

    const variantKeys = new Set<string>();
    (data ?? []).forEach((purchase) => {
      (purchase.items ?? []).forEach((item) => {
        const key = (item.variant_key ?? item.variation_key ?? '').toString().trim();
        if (!key) return;
        if (key.toLowerCase() === 'base') return;
        variantKeys.add(key);
      });
    });

    const variantNameMap = new Map<string, string>();
    if (variantKeys.size > 0) {
      const { data: variantRows, error: variantError } = await supabase
        .from('catalog_variants')
        .select('id,name')
        .in('id', Array.from(variantKeys));
      if (variantError) throw variantError;
      (variantRows ?? []).forEach((row) => {
        if (row?.id) {
          variantNameMap.set(row.id, (row.name ?? '').trim() || row.id);
        }
      });
    }

    const purchases: WarehousePurchase[] = (data ?? []).map((purchase) => {
      const whId = purchase.warehouse_id;
      const warehouseName = whId ? warehouseMap.get(whId) ?? null : null;
      const operatorDirectoryName = purchase.recorded_by ? operatorMap.get(purchase.recorded_by) ?? null : null;
      const fallbackName = purchase.recorded_by ? operatorFallbackMap.get(purchase.recorded_by) ?? null : null;
      const operatorName = operatorDirectoryName ?? fallbackName ?? null;

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
        operator_name: operatorName,
        items: Array.isArray(purchase.items)
          ? purchase.items.map((item) => {
              const rawKey = (item.variant_key ?? item.variation_key ?? null) as string | null;
              const normalizedKey = rawKey ? rawKey.trim() : '';
              const isBase = !normalizedKey || normalizedKey.toLowerCase() === 'base';
              const variantLabel = !isBase ? (variantNameMap.get(normalizedKey) ?? normalizedKey) : null;

              return {
                id: item.id,
                receipt_id: item.receipt_id ?? null,
                item_id: item.item_id ?? null,
                variant_key: normalizedKey || null,
                qty: Number(item.qty_units ?? 0) || 0,
                qty_input_mode: item.qty_input_mode ?? null,
                unit_cost: item.unit_cost != null ? Number(item.unit_cost) : null,
                item: item.item ?? null,
                variant: variantLabel ? { id: normalizedKey, name: variantLabel } : null,
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
