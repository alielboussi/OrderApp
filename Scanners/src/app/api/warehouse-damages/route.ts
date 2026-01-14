import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import type { WarehouseDamage, DamageItem } from '@/types/damages';

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
      .from('warehouse_damages')
      .select('id, warehouse_id, note, context, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    } else if (fromLocked) {
      query = query.eq('warehouse_id', fromLocked);
    }
    if (startIso) {
      query = query.gte('created_at', startIso);
    }
    if (endIso) {
      query = query.lte('created_at', endIso);
    }

    type DamageRecord = WarehouseDamage & { context?: any };

    const { data, error } = (await query) as { data: DamageRecord[] | null; error: Error | null };
    if (error) {
      throw error;
    }

    const warehouseIds = new Set<string>();
    const itemIds = new Set<string>();

    const parsedDamages = (data ?? []).map((damage) => {
      const lines = Array.isArray((damage as any).context) ? ((damage as any).context as any[]) : [];

      lines.forEach((line) => {
        const itemId = (line?.product_id ?? line?.item_id ?? '').toString();
        const variantId = (line?.variation_id ?? line?.variant_id ?? '').toString();
        if (itemId) itemIds.add(itemId);
      });

      const whId = (damage as any).warehouse_id as string | null;
      if (whId) warehouseIds.add(whId);

      return { ...damage, parsedLines: lines } as DamageRecord & { parsedLines: any[] };
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

    const itemMap = new Map<string, string | null>();
    if (itemIds.size > 0) {
      const { data: itemRows, error: itemError } = await supabase
        .from('catalog_items')
        .select('id,name')
        .in('id', Array.from(itemIds));
      if (itemError) throw itemError;
      itemRows?.forEach((row) => {
        if (row?.id) {
          itemMap.set(row.id, row.name ?? null);
        }
      });
    }

    const damages: WarehouseDamage[] = parsedDamages.map((damage) => {
      const whId = (damage as any).warehouse_id as string | null;
      const warehouseName = whId ? warehouseMap.get(whId) ?? null : null;

      const items: DamageItem[] = Array.isArray(damage.parsedLines)
        ? damage.parsedLines.map((line, index) => {
            const itemId = (line?.product_id ?? line?.item_id ?? null) as string | null;
            const variantKey = (line?.variant_key ?? line?.variation_key ?? null) as string | null;
            const variantId = (line?.variation_id ?? line?.variant_id ?? null) as string | null;
            const qty = Number((line?.qty ?? line?.qty_units ?? 0) as number) || 0;
            const note = (line?.note ?? null) as string | null;

            return {
              id: `${damage.id}-${index + 1}`,
              damage_id: damage.id,
              item_id: itemId,
              variant_key: variantKey,
              variant_id: variantId ?? variantKey ?? null,
              qty,
              note,
              item: itemId ? { id: itemId, name: itemMap.get(itemId) ?? null } : null,
              variant: variantKey ? { id: variantKey, name: variantKey } : variantId ? { id: variantId, name: variantId } : null,
            };
          })
        : [];

      return {
        id: damage.id,
        warehouse_id: whId,
        warehouse: whId ? { id: whId, name: warehouseName } : null,
        note: damage.note ?? null,
        created_at: (damage as any).created_at ?? null,
        items,
      };
    });

    return NextResponse.json({ damages });
  } catch (error) {
    console.error('warehouse-damages api failed', error);
    return NextResponse.json({ error: 'Unable to load warehouse damages' }, { status: 500 });
  }
}
