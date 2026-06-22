import type { SupabaseClient } from "@supabase/supabase-js";

export type MiddlewareOutletCandidate = {
  active?: boolean | null;
  has_pos_middleware?: boolean | null;
  channel?: string | null;
  name?: string | null;
  code?: string | null;
};

/** POS middleware outlets that should receive catalog sync — excludes storeroom/hub rows. */
export function isMiddlewareCatalogSyncOutlet(outlet: MiddlewareOutletCandidate): boolean {
  if (outlet.active === false) return false;
  if (outlet.has_pos_middleware !== true) return false;

  const label = `${outlet.name ?? ""} ${outlet.code ?? ""}`.toLowerCase();
  if (isStoreroomLabel(label)) return false;

  return true;
}

/** Selling outlets with POS middleware — excludes hub/storeroom rows in the outlets table. */
export function isPosMiddlewareOutlet(outlet: MiddlewareOutletCandidate): boolean {
  if (outlet.active === false) return false;
  if (outlet.has_pos_middleware === false) return false;

  const channel = (outlet.channel ?? "selling").trim().toLowerCase();
  if (channel !== "selling") return false;

  const label = `${outlet.name ?? ""} ${outlet.code ?? ""}`.toLowerCase();
  if (isStoreroomLabel(label)) return false;

  return true;
}

export function isStoreroomLabel(label: string): boolean {
  return /\bstorerooms?\b/i.test(label);
}

/** Outlet deduction warehouses — scope outlet, not hub storerooms. */
export function isOutletDeductionWarehouse(warehouse: {
  name?: string | null;
  warehouse_scope?: string | null;
}): boolean {
  const scope = (warehouse.warehouse_scope ?? "").trim().toLowerCase();
  if (scope === "hub") return false;
  if (isStoreroomLabel(warehouse.name ?? "")) return false;
  return scope === "outlet" || scope === "";
}

export type OutletWarehouseLink = {
  outlet_id: string;
  outlet_name?: string | null;
  warehouse_id: string;
  warehouse_name?: string | null;
  warehouse_scope?: string | null;
};

export function outletCandidateFromLink<T extends OutletWarehouseLink>(
  row: T,
  outletsById?: Map<string, MiddlewareOutletCandidate>
): MiddlewareOutletCandidate {
  const meta = outletsById?.get(row.outlet_id);
  return {
    name: meta?.name ?? row.outlet_name,
    code: meta?.code ?? null,
    active: meta?.active ?? true,
    channel: meta?.channel ?? "selling",
    has_pos_middleware: meta?.has_pos_middleware ?? null,
  };
}

export function filterSellingOutletWarehouseLinks<T extends OutletWarehouseLink>(
  links: T[],
  outletsById: Map<string, MiddlewareOutletCandidate>
): T[] {
  return links.filter((row) => {
    const outlet = outletCandidateFromLink(row, outletsById);
    if (!outletsById.has(row.outlet_id) && !row.outlet_name) return false;
    if (!isPosMiddlewareOutlet(outlet)) return false;
    return isOutletDeductionWarehouse({
      name: row.warehouse_name,
      warehouse_scope: row.warehouse_scope,
    });
  });
}

export function outletWarehouseLabel<T extends OutletWarehouseLink>(
  row: T,
  links: T[]
): string {
  const warehousesForOutlet = links.filter((entry) => entry.outlet_id === row.outlet_id);
  if (warehousesForOutlet.length <= 1) return row.outlet_name?.trim() || "Outlet";
  return `${row.outlet_name ?? "Outlet"} — ${row.warehouse_name ?? "Warehouse"}`;
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
