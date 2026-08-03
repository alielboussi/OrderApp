import {
  middlewareSaleRowMatchesProfile,
  middlewareSalesApiProfileForOutletId,
} from "@/lib/outletScope";
import {
  extractShiftId,
  parseShiftIdsParam,
  shiftFilterIsAllInclusive,
} from "@/lib/posShift";

export type ProductQty = {
  name: string;
  qty: number;
};

export type PosSalesStatsQuery = {
  outletIds: string[];
  fromIso: string;
  toIso: string;
  shiftIds: number[] | null;
  includeUnknownShift: boolean;
};

export type PosSalesStats = {
  total_qty: number;
  total_revenue: number;
  bill_count: number;
  line_count: number;
  most_sold: ProductQty | null;
  least_sold: ProductQty | null;
};

/** Same POS/middleware row gate used by outlet-middleware-sales. */
export function isMiddlewareSalesContext(context: Record<string, unknown> | null | undefined): boolean {
  if (!context) return false;

  const asNonEmptyText = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };

  const sourceEventId = asNonEmptyText(context.source_event_id);
  const saleId = asNonEmptyText(context.sale_id);
  const posOrderId = asNonEmptyText(context.pos_order_id);
  const sourceSystem = asNonEmptyText(context.source_system)?.toLowerCase() ?? null;

  if (sourceEventId || saleId || posOrderId) return true;
  if (sourceSystem && (sourceSystem.includes("pos") || sourceSystem.includes("afterten-pos"))) return true;

  return false;
}

export function rowMatchesOutletProfile(outletId: string, sourceEventId: string | null): boolean {
  const profile = middlewareSalesApiProfileForOutletId(outletId);
  if (!profile) return true;
  return middlewareSaleRowMatchesProfile(outletId, sourceEventId, profile);
}

/** Shared shift-param parsing for dashboard + middleware sales APIs. */
export function parseShiftFilterFromUrl(url: URL): {
  shiftIds: number[] | null;
  includeUnknownShift: boolean;
} {
  return {
    shiftIds: parseShiftIdsParam(url.searchParams.get("shift_ids")),
    includeUnknownShift: url.searchParams.get("include_unknown_shift") === "1",
  };
}

export function rowMatchesShiftFilter(
  shiftId: number | null,
  selectedShiftIds: Set<number>,
  includeUnknownShift: boolean,
): boolean {
  if (shiftId == null) return includeUnknownShift;
  return selectedShiftIds.has(shiftId);
}

export function shiftFilterIsActive(shiftIds: number[] | null, includeUnknownShift: boolean): boolean {
  return shiftIds != null && !shiftFilterIsAllInclusive(shiftIds, includeUnknownShift);
}

export { extractShiftId };
