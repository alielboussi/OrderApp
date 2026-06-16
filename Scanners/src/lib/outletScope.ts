import type { SupabaseClient } from "@supabase/supabase-js";

export type MiddlewareOutletCandidate = {
  active?: boolean | null;
  has_pos_middleware?: boolean | null;
  channel?: string | null;
  name?: string | null;
  code?: string | null;
};

/** Selling outlets with POS middleware — excludes hub/storeroom rows in the outlets table. */
export function isPosMiddlewareOutlet(outlet: MiddlewareOutletCandidate): boolean {
  if (outlet.active === false) return false;
  if (outlet.has_pos_middleware === false) return false;

  const channel = (outlet.channel ?? "selling").trim().toLowerCase();
  if (channel !== "selling") return false;

  const label = `${outlet.name ?? ""} ${outlet.code ?? ""}`.toLowerCase();
  if (/\bstorerooms?\b/.test(label)) return false;

  return true;
}

/** Warehouse IDs linked to selling outlets (outlet_warehouses + default outlet warehouses). */
export async function listOutletWarehouseIds(
  supabase: SupabaseClient,
  outletId?: string | null
): Promise<string[]> {
  const ids = new Set<string>();

  let linkQuery = supabase.from("outlet_warehouses").select("warehouse_id");
  if (outletId) linkQuery = linkQuery.eq("outlet_id", outletId);

  const { data: links, error: linkError } = await linkQuery;
  if (linkError) throw linkError;

  for (const row of links ?? []) {
    const id = (row as { warehouse_id?: string }).warehouse_id;
    if (id) ids.add(id);
  }

  if (outletId) {
    const { data: outletRow, error: outletError } = await supabase
      .from("outlets")
      .select("default_sales_warehouse_id,default_receiving_warehouse_id")
      .eq("id", outletId)
      .maybeSingle();
    if (outletError) throw outletError;
    if (outletRow?.default_sales_warehouse_id) ids.add(outletRow.default_sales_warehouse_id);
    if (outletRow?.default_receiving_warehouse_id) ids.add(outletRow.default_receiving_warehouse_id);
  }

  return Array.from(ids);
}

export async function filterOutletScopedWarehouses<T extends { id: string }>(
  supabase: SupabaseClient,
  warehouses: T[],
  outletId?: string | null
): Promise<T[]> {
  const outletIds = await listOutletWarehouseIds(supabase, outletId);
  if (!outletIds.length) return [];
  const allowed = new Set(outletIds);
  return warehouses.filter((w) => allowed.has(w.id));
}
