import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';
import type { Warehouse } from '@/types/warehouse';

type WarehouseRecord = {
  id: string;
  name: string | null;
  parent_warehouse_id: string | null;
  kind: string | null;
  active: boolean | null;
};

function mapWarehouse(record: WarehouseRecord): Warehouse {
  return {
    id: record.id,
    name: record.name ?? 'Warehouse',
    parent_warehouse_id: record.parent_warehouse_id,
    kind: record.kind,
    active: record.active ?? false,
  };
}

export async function GET(request: Request) {
  try {
    const supabase = getServiceClient();
    const url = new URL(request.url);
    const includeInactiveParam = url.searchParams.get('include_inactive');
    const includeInactive = includeInactiveParam === '1' || includeInactiveParam === 'true';
    const lockedIds = url.searchParams.getAll('locked_id').filter(Boolean);

    let query = supabase
      .from('warehouses')
      .select('id,name,parent_warehouse_id,kind,active')
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    let warehouses: Warehouse[] = (data ?? []).map(mapWarehouse);

    if (!includeInactive && lockedIds.length) {
      const missingIds = lockedIds.filter((id) => id && !warehouses.some((wh) => wh.id === id));
      if (missingIds.length) {
        const { data: lockedRows, error: lockedErr } = await supabase
          .from('warehouses')
          .select('id,name,parent_warehouse_id,kind,active')
          .in('id', missingIds);
        if (lockedErr) {
          throw lockedErr;
        }
        warehouses = warehouses.concat((lockedRows ?? []).map(mapWarehouse));
      }
    }

    const seen = new Set<string>();
    const normalized: Warehouse[] = [];
    for (const warehouse of warehouses) {
      if (!warehouse.id || seen.has(warehouse.id)) continue;
      seen.add(warehouse.id);
      normalized.push(warehouse);
    }

    normalized.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }));

    return NextResponse.json({ warehouses: normalized });
  } catch (error) {
    console.error('warehouses api failed', error);
    return NextResponse.json({ error: 'Unable to load warehouses' }, { status: 500 });
  }
}
