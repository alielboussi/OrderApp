export type MiddlewareOutletCandidate = {
  active?: boolean | null;
  has_pos_middleware?: boolean | null;
  channel?: string | null;
  name?: string | null;
  code?: string | null;
};

/** POS-only tills — excluded from certain outlet programming UIs. */
export const TILL_OUTLET_IDS = new Set([
  "648e949d-8648-4c43-80d4-f08feb7bdd04", // Till 1
  "a655b0a1-a37a-43d6-aa55-7f97377b2660", // Till 2
]);

export const QUICK_CORNER_OUTLET_ID = "a406fede-7aab-4473-8e9f-ff645267466f";

/** Orders app pilot outlet (no POS middleware). */
export const ONEWAY_OUTLET_ID = "7f3e9a2b-1c4d-5e6f-8a9b-0c1d2e3f4a5b";
export const ONEWAY_WAREHOUSE_ID = "8a4f0b3c-2d5e-6f70-9b0c-1d2e3f405a6b";

export const POS_ONLY_OUTLET_IDS = new Set([
  ...TILL_OUTLET_IDS,
  QUICK_CORNER_OUTLET_ID, // Quick Corner
]);

/** Middleware sales export API profile — Till 1/2 share `till`, Quick Corner uses `quick_corner`. */
export type MiddlewareSalesApiProfile = "till" | "quick_corner";

export const MIDDLEWARE_SALES_API_PATHS: Record<MiddlewareSalesApiProfile, string> = {
  till: "/api/outlet-middleware-sales/tills",
  quick_corner: "/api/outlet-middleware-sales/quick-corner",
};

export function middlewareSalesApiProfileForOutletId(outletId: string): MiddlewareSalesApiProfile | null {
  if (TILL_OUTLET_IDS.has(outletId)) return "till";
  if (outletId === QUICK_CORNER_OUTLET_ID) return "quick_corner";
  return null;
}

export function outletIdsForMiddlewareSalesApiProfile(profile: MiddlewareSalesApiProfile): string[] {
  if (profile === "till") return Array.from(TILL_OUTLET_IDS);
  return [QUICK_CORNER_OUTLET_ID];
}

export function sourceEventIdBelongsToOutlet(sourceEventId: string, outletId: string): boolean {
  return sourceEventId.startsWith(`${outletId}-`);
}

/** Outlet row + optional POS source_event_id must match a middleware sales API profile. */
export function middlewareSaleRowMatchesProfile(
  outletId: string,
  sourceEventId: string | null | undefined,
  profile: MiddlewareSalesApiProfile,
): boolean {
  const allowedOutletIds = outletIdsForMiddlewareSalesApiProfile(profile);
  if (!allowedOutletIds.includes(outletId)) return false;

  const trimmedSourceEventId = sourceEventId?.trim();
  if (!trimmedSourceEventId) return true;

  if (!allowedOutletIds.some((id) => sourceEventIdBelongsToOutlet(trimmedSourceEventId, id))) {
    return false;
  }

  return sourceEventIdBelongsToOutlet(trimmedSourceEventId, outletId);
}

export function parseMiddlewareSalesApiProfile(value: string | null | undefined): MiddlewareSalesApiProfile | null {
  const normalized = value?.trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) return null;
  if (normalized === "till" || normalized === "tills") return "till";
  if (normalized === "quick_corner" || normalized === "quickcorner") return "quick_corner";
  return null;
}

export function resolveMiddlewareSalesApiProfile(
  outletId: string | null,
  profileParam: string | null | undefined,
  fixedProfile?: MiddlewareSalesApiProfile,
): { profile: MiddlewareSalesApiProfile; outletIds: string[] } | { error: string } {
  const profile = fixedProfile ?? parseMiddlewareSalesApiProfile(profileParam);
  if (!profile) {
    return { error: "middleware sales profile is required (till or quick_corner)" };
  }

  const allowedOutletIds = outletIdsForMiddlewareSalesApiProfile(profile);
  if (outletId) {
    if (!allowedOutletIds.includes(outletId)) {
      return { error: `outletId is not part of the ${profile} middleware sales API profile` };
    }
    return { profile, outletIds: [outletId] };
  }

  return { profile, outletIds: allowedOutletIds };
}

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
