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
      .select(
        `
        id,
        warehouse_id,
        note,
        created_at,
        items:warehouse_damage_items (
          id,
          damage_id,
          item_id,
          variant_id,
          qty_units,
          note,
          item:catalog_items ( id, name ),
          variant:catalog_variants ( id, name )
        )
      `
      )
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

    type DamageRecord = WarehouseDamage & {
      items: Array<DamageItem & { qty_units?: number | string | null }> | null;
    };

    const { data, error } = (await query) as { data: DamageRecord[] | null; error: Error | null };
    if (error) {
      throw error;
    }

    const warehouseIds = new Set<string>();
    (data ?? []).forEach((damage) => {
      if ((damage as any).warehouse_id) warehouseIds.add((damage as any).warehouse_id as string);
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

    const damages: WarehouseDamage[] = (data ?? []).map((damage) => {
      const whId = (damage as any).warehouse_id as string | null;
      const warehouseName = whId ? warehouseMap.get(whId) ?? null : null;

      return {
        id: damage.id,
        warehouse_id: whId,
        warehouse: whId ? { id: whId, name: warehouseName } : null,
        note: damage.note ?? null,
        created_at: damage.created_at ?? null,
        items: Array.isArray((damage as any).items)
          ? ((damage as any).items as Array<DamageItem & { qty_units?: number | string | null }>).map((item) => ({
              id: item.id,
              damage_id: (item as any).damage_id ?? null,
              item_id: item.item_id ?? (item as any).item_id ?? null,
              variant_id: item.variant_id ?? (item as any).variant_id ?? null,
              qty: Number((item as any).qty_units ?? 0) || 0,
              note: item.note ?? null,
              item: (item as any).item ?? null,
              variant: (item as any).variant ?? null,
            }))
          : [],
      };
    });

    return NextResponse.json({ damages });
  } catch (error) {
    console.error('warehouse-damages api failed', error);
    return NextResponse.json({ error: 'Unable to load warehouse damages' }, { status: 500 });
  }
}
