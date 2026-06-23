import type { SupabaseClient } from "@supabase/supabase-js";

export type MiddlewareOutletCandidate = {
  active?: boolean | null;
  has_pos_middleware?: boolean | null;
  channel?: string | null;
  name?: string | null;
  code?: string | null;
};

/** POS-only tills — no ordering-app deductions; excluded from POS deduction programming UI. */
export const POS_ONLY_OUTLET_IDS = new Set([
  "648e949d-8648-4c43-80d4-f08feb7bdd04", // Till 1
  "a406fede-7aab-4473-8e9f-ff645267466f", // Quick Corner
  "a655b0a1-a37a-43d6-aa55-7f97377b2660", // Till 2
]);

export function isSellingChannel(channel?: string | null): boolean {
  const normalized = (channel ?? "selling").trim().toLowerCase();
  if (!normalized || normalized === "selling") return true;
  if (normalized === "pos" || normalized === "point of sale" || normalized === "point of sales") {
    return true;
  }
  return /\bpoint\s+of\s+sale(s)?\b/.test(normalized);
}

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
  if (outlet.has_pos_middleware !== true) return false;
  if (!isSellingChannel(outlet.channel)) return false;

  const label = `${outlet.name ?? ""} ${outlet.code ?? ""}`.toLowerCase();
  if (isStoreroomLabel(label)) return false;

  return true;
}

/** Outlets eligible for POS sale deduction programming (all active except POS-only tills). */
export function isPosDeductionProgrammingOutlet(outlet: {
  id?: string | null;
  active?: boolean | null;
}): boolean {
  if (!outlet.id || POS_ONLY_OUTLET_IDS.has(outlet.id)) return false;
  return outlet.active !== false;
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
