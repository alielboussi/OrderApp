import { NextResponse } from 'next/server';
import { useFirebaseBackend } from '@/lib/cloud-backend';
import {
  filterFirestoreWarehousesByScope,
  listFirestoreOutletWarehouseIds,
  listFirestoreWarehouses,
} from '@/lib/firestore-warehouses';
import { getServiceClient } from '@/lib/supabase-server';
import { filterOutletScopedWarehouses, listOutletWarehouseIds } from '@/lib/outletScope';
import type { Warehouse } from '@/types/warehouse';

type WarehouseRecord = {
  id: string;
  name: string | null;
  parent_warehouse_id: string | null;
  active: boolean | null;
};

function mapWarehouse(record: WarehouseRecord): Warehouse {
  return {
    id: record.id,
    name: record.name ?? 'Warehouse',
    parent_warehouse_id: record.parent_warehouse_id,
    active: record.active ?? false,
  };
}

async function fetchWarehousesViaTable(supabase: ReturnType<typeof getServiceClient>, lockedIds: string[]) {
  const selectColumns = 'id,name,parent_warehouse_id,active';
  const { data, error } = await supabase
    .from('warehouses')
    .select(selectColumns)
    .order('name');
  if (error) {
    throw error;
  }

  let rows = Array.isArray(data) ? data : [];
  if (lockedIds.length) {
    const missing = lockedIds.filter((id) => id && !rows.some((row) => row?.id === id));
    if (missing.length) {
      const { data: lockedRows, error: lockedError } = await supabase
        .from('warehouses')
        .select(selectColumns)
        .in('id', missing);
      if (lockedError) {
        throw lockedError;
      }
      rows = rows.concat(Array.isArray(lockedRows) ? lockedRows : []);
    }
  }

  return rows.map((row) => ({
    ...row,
    active: row?.active ?? true,
  }));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const includeInactiveParam = url.searchParams.get('include_inactive');
    const includeInactive = includeInactiveParam === '1' || includeInactiveParam === 'true';
    const scope = url.searchParams.get('scope')?.trim().toLowerCase() || null;
    const outletId = url.searchParams.get('outlet_id')?.trim() || null;
    const lockedIdCandidates = [
      ...url.searchParams.getAll('locked_id'),
      url.searchParams.get('fromLockedId'),
      url.searchParams.get('from_locked_id'),
      url.searchParams.get('locked_from'),
      url.searchParams.get('lockedWarehouseId'),
      url.searchParams.get('lockedWarehouse'),
      url.searchParams.get('locked_source_id'),
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const lockedIds = Array.from(new Set(lockedIdCandidates.map((value) => value.trim())));

    if (useFirebaseBackend()) {
      let normalized = await listFirestoreWarehouses({ includeInactive, lockedIds });

      if (scope === 'outlet') {
        const outletWarehouseIds = new Set(await listFirestoreOutletWarehouseIds(outletId));
        normalized = filterFirestoreWarehousesByScope(normalized, outletWarehouseIds);
      } else if (scope === 'hub') {
        const outletIds = new Set(await listFirestoreOutletWarehouseIds());
        normalized = normalized.filter((w) => !outletIds.has(w.id));
      }

      return NextResponse.json({ warehouses: normalized, cloud_backend: 'firebase' });
    }

    const supabase = getServiceClient();
    let warehouseRecords: WarehouseRecord[] = [];
    try {
      const { data, error } = await supabase.rpc('console_locked_warehouses', {
        p_include_inactive: includeInactive,
        p_locked_ids: lockedIds.length ? lockedIds : null,
      });
      if (error) {
        throw error;
      }
      warehouseRecords = Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('console_locked_warehouses RPC unavailable, falling back to warehouses table', error);
      warehouseRecords = await fetchWarehousesViaTable(supabase, lockedIds);
    }

    let normalized: Warehouse[] = warehouseRecords
      .map(mapWarehouse)
      .filter((warehouse, index, list) => warehouse.id && index === list.findIndex((entry) => entry.id === warehouse.id))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }));

    if (scope === 'outlet') {
      normalized = await filterOutletScopedWarehouses(supabase, normalized, outletId);
    } else if (scope === 'hub') {
      const outletIds = new Set(await listOutletWarehouseIds(supabase));
      normalized = normalized.filter((w) => !outletIds.has(w.id));
    }

    return NextResponse.json({ warehouses: normalized });
  } catch (error) {
    console.error('warehouses api failed', error);
    return NextResponse.json({ error: 'Unable to load warehouses' }, { status: 500 });
  }
}
