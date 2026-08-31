import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-server";
import type { Warehouse } from "@/types/warehouse";

type WarehouseRecord = {
  id: string;
  name: string | null;
  parent_warehouse_id: string | null;
  active: boolean | null;
};

function mapWarehouse(record: WarehouseRecord): Warehouse {
  return {
    id: record.id,
    name: record.name ?? "Warehouse",
    parent_warehouse_id: record.parent_warehouse_id,
    active: record.active ?? false,
  };
}

export async function listSupabaseWarehouses(options?: {
  includeInactive?: boolean;
  lockedIds?: string[];
}): Promise<Warehouse[]> {
  const supabase = getSupabaseAdmin();
  const lockedIds = new Set((options?.lockedIds ?? []).filter(Boolean));
  const includeInactive = options?.includeInactive === true;

  const { data, error } = await supabase
    .from("warehouses")
    .select("id,name,parent_warehouse_id,active");
  if (error) throw new Error(error.message);

  const byId = new Map<string, WarehouseRecord>();
  for (const row of data ?? []) {
    byId.set(String(row.id), {
      id: String(row.id),
      name: typeof row.name === "string" ? row.name : null,
      parent_warehouse_id:
        typeof row.parent_warehouse_id === "string" ? row.parent_warehouse_id : null,
      active: row.active !== false,
    });
  }

  for (const lockedId of lockedIds) {
    if (byId.has(lockedId)) continue;
    const { data: lockedRow, error: lockedError } = await supabase
      .from("warehouses")
      .select("id,name,parent_warehouse_id,active")
      .eq("id", lockedId)
      .maybeSingle();
    if (lockedError) throw new Error(lockedError.message);
    if (!lockedRow) continue;
    byId.set(lockedId, {
      id: String(lockedRow.id),
      name: typeof lockedRow.name === "string" ? lockedRow.name : null,
      parent_warehouse_id:
        typeof lockedRow.parent_warehouse_id === "string" ? lockedRow.parent_warehouse_id : null,
      active: lockedRow.active !== false,
    });
  }

  return Array.from(byId.values())
    .filter((row) => includeInactive || row.active !== false || lockedIds.has(row.id))
    .map(mapWarehouse)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }));
}

export async function listSupabaseOutletWarehouseIds(outletId?: string | null): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("outlet_warehouses").select("warehouse_id");
  if (outletId) {
    query = query.eq("outlet_id", outletId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const ids = (data ?? [])
    .map((row) => row.warehouse_id)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (!outletId) {
    const { data: outlets, error: outletsError } = await supabase
      .from("outlets")
      .select("default_sales_warehouse_id")
      .not("default_sales_warehouse_id", "is", null);
    if (outletsError) throw new Error(outletsError.message);
    for (const row of outlets ?? []) {
      if (typeof row.default_sales_warehouse_id === "string" && row.default_sales_warehouse_id.trim()) {
        ids.push(row.default_sales_warehouse_id);
      }
    }
  }

  return Array.from(new Set(ids));
}
