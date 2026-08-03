import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOutletSalesPage } from "@/lib/fetchOutletSalesPage";
import {
  middlewareSaleRowMatchesProfile,
  middlewareSalesApiProfileForOutletId,
} from "@/lib/outletScope";
import {
  extractShiftId,
  parseShiftIdsParam,
  shiftFilterIsAllInclusive,
} from "@/lib/posShift";

const SHIFT_LOOKUP_CHUNK = 200;

type SalesRow = {
  id: string;
  outlet_id: string;
  item_id: string;
  qty_units: number | string | null;
  sale_price: number | string | null;
  flavour_price: number | string | null;
  context: Record<string, unknown> | null;
  catalog_items: { name: string | null } | { name: string | null }[] | null;
};

export type PosSalesStatsQuery = {
  outletIds: string[];
  fromIso: string;
  toIso: string;
  /** null = no shift filter param (include all). */
  shiftIds: number[] | null;
  includeUnknownShift: boolean;
};

export type ProductQty = {
  name: string;
  qty: number;
};

export type PosSalesStats = {
  total_qty: number;
  total_revenue: number;
  bill_count: number;
  line_count: number;
  most_sold: ProductQty | null;
  least_sold: ProductQty | null;
};

function asNonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Same POS/middleware row gate used by outlet-middleware-sales. */
export function isMiddlewareSalesContext(context: Record<string, unknown> | null | undefined): boolean {
  if (!context) return false;

  const sourceEventId = asNonEmptyText(context.source_event_id);
  const saleId = asNonEmptyText(context.sale_id);
  const posOrderId = asNonEmptyText(context.pos_order_id);
  const sourceSystem = asNonEmptyText(context.source_system)?.toLowerCase() ?? null;

  if (sourceEventId || saleId || posOrderId) return true;
  if (sourceSystem && (sourceSystem.includes("pos") || sourceSystem.includes("afterten-pos"))) return true;

  return false;
}

function relName(value: SalesRow["catalog_items"]): string {
  if (!value) return "Unknown";
  const row = Array.isArray(value) ? value[0] : value;
  return (row?.name ?? "Unknown").trim() || "Unknown";
}

function sourceEventIdFromContext(context: Record<string, unknown> | null): string | null {
  return asNonEmptyText(context?.source_event_id);
}

function saleReferenceForRow(row: SalesRow): string {
  const sourceEventId = sourceEventIdFromContext(row.context);
  const fallbackSaleRef = asNonEmptyText(row.context?.sale_id) ?? row.id;
  return `${row.outlet_id}:${sourceEventId ?? fallbackSaleRef}`;
}

function rowMatchesOutletProfile(row: SalesRow): boolean {
  const profile = middlewareSalesApiProfileForOutletId(row.outlet_id);
  if (!profile) return true;
  return middlewareSaleRowMatchesProfile(row.outlet_id, sourceEventIdFromContext(row.context), profile);
}

async function fetchShiftIdsBySourceEvent(
  supabase: SupabaseClient,
  sourceEventIds: string[],
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  for (let i = 0; i < sourceEventIds.length; i += SHIFT_LOOKUP_CHUNK) {
    const chunk = sourceEventIds.slice(i, i + SHIFT_LOOKUP_CHUNK);
    const { data, error } = await supabase
      .from("orders")
      .select("source_event_id,raw_payload")
      .in("source_event_id", chunk);
    if (error) throw error;
    for (const row of (data as Array<{ source_event_id: string; raw_payload: Record<string, unknown> | null }>) ?? []) {
      if (!row.source_event_id) continue;
      map.set(row.source_event_id, extractShiftId(row.raw_payload));
    }
  }
  return map;
}

function rowMatchesShiftFilter(
  row: SalesRow,
  shiftBySourceEvent: Map<string, number | null>,
  selectedShiftIds: Set<number>,
  includeUnknownShift: boolean,
): boolean {
  const billId = sourceEventIdFromContext(row.context);
  const shiftId = billId ? (shiftBySourceEvent.get(billId) ?? null) : null;
  if (shiftId == null) return includeUnknownShift;
  return selectedShiftIds.has(shiftId);
}

function aggregateByName(rows: Array<{ name: string; qty: number }>): ProductQty[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.name, round2((map.get(row.name) ?? 0) + row.qty));
  }
  return Array.from(map.entries())
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

function pickMostLeast(items: ProductQty[]): { most: ProductQty | null; least: ProductQty | null } {
  if (items.length === 0) return { most: null, least: null };
  const positive = items.filter((row) => row.qty > 0);
  if (positive.length === 0) return { most: null, least: null };
  return {
    most: positive[0],
    least: positive[positive.length - 1],
  };
}

/**
 * Dashboard POS sales aggregates using the same inclusion / pricing / bill rules
 * as `/api/outlet-middleware-sales/*`.
 */
export async function loadPosSalesStats(
  supabase: SupabaseClient,
  query: PosSalesStatsQuery,
): Promise<PosSalesStats> {
  const empty: PosSalesStats = {
    total_qty: 0,
    total_revenue: 0,
    bill_count: 0,
    line_count: 0,
    most_sold: null,
    least_sold: null,
  };

  let salesRows = await fetchOutletSalesPage<SalesRow>(supabase, {
    outletIds: query.outletIds,
    fromIso: query.fromIso,
    toIso: query.toIso,
    select:
      "id,outlet_id,item_id,qty_units,sale_price,flavour_price,context,catalog_items(name)",
  });

  salesRows = salesRows
    .filter((row) => row.outlet_id && row.item_id)
    .filter((row) => isMiddlewareSalesContext(row.context))
    .filter((row) => rowMatchesOutletProfile(row));

  const applyShiftFilter =
    query.shiftIds != null && !shiftFilterIsAllInclusive(query.shiftIds, query.includeUnknownShift);
  const selectedShiftIds = new Set(query.shiftIds ?? []);

  if (applyShiftFilter) {
    if (selectedShiftIds.size === 0 && !query.includeUnknownShift) {
      return empty;
    }
    const sourceEventIds = Array.from(
      new Set(
        salesRows
          .map((row) => sourceEventIdFromContext(row.context))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const shiftBySourceEvent = await fetchShiftIdsBySourceEvent(supabase, sourceEventIds);
    salesRows = salesRows.filter((row) =>
      rowMatchesShiftFilter(row, shiftBySourceEvent, selectedShiftIds, query.includeUnknownShift),
    );
  }

  let totalQty = 0;
  let totalRevenue = 0;
  const salesByProduct: Array<{ name: string; qty: number }> = [];
  const billIds = new Set<string>();

  for (const row of salesRows) {
    const qty = toNumber(row.qty_units);
    const unitAfterVat = toNumber(row.sale_price) || toNumber(row.flavour_price);
    const lineTotal = round2(unitAfterVat * qty);

    totalQty = round2(totalQty + qty);
    totalRevenue = round2(totalRevenue + lineTotal);
    salesByProduct.push({ name: relName(row.catalog_items), qty: round2(qty) });
    billIds.add(saleReferenceForRow(row));
  }

  const { most, least } = pickMostLeast(aggregateByName(salesByProduct));

  return {
    total_qty: totalQty,
    total_revenue: totalRevenue,
    bill_count: billIds.size,
    line_count: salesRows.length,
    most_sold: most,
    least_sold: least,
  };
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
