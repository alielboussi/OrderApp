import { NextRequest, NextResponse } from "next/server";
import { parseBusinessDateRangeParam } from "@/lib/dateRangeParam";
import { loadPosSalesStats, parseShiftFilterFromUrl } from "@/lib/posSalesStats";
import { getServiceClient } from "@/lib/supabase-server";
import { isMissingRelationError } from "@/lib/supabase-errors";

type OrderItemRow = {
  name: string | null;
  qty: number | null;
};

const MAX_ORDER_ROWS = 8000;
const DEFAULT_DAYS = 7;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseSalesOutletIds(url: URL): string[] {
  const ids = new Set<string>();

  for (const value of url.searchParams.getAll("sales_outlet_id")) {
    const trimmed = value.trim();
    if (trimmed && UUID_RE.test(trimmed)) ids.add(trimmed);
  }

  const csv = url.searchParams.get("sales_outlet_ids")?.trim();
  if (csv) {
    for (const part of csv.split(",")) {
      const trimmed = part.trim();
      if (trimmed && UUID_RE.test(trimmed)) ids.add(trimmed);
    }
  }

  return Array.from(ids);
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function aggregateByName(rows: Array<{ name: string; qty: number }>): Array<{ name: string; qty: number }> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.name, (map.get(row.name) ?? 0) + row.qty);
  }
  return Array.from(map.entries())
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

function pickMostLeast(items: Array<{ name: string; qty: number }>): {
  most: { name: string; qty: number } | null;
  least: { name: string; qty: number } | null;
} {
  if (items.length === 0) return { most: null, least: null };
  const positive = items.filter((row) => row.qty > 0);
  if (positive.length === 0) return { most: null, least: null };
  return {
    most: positive[0],
    least: positive[positive.length - 1],
  };
}

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const salesOutletFilterActive = url.searchParams.has("sales_outlet_ids");
    const salesOutletIds = parseSalesOutletIds(url);
    const { shiftIds, includeUnknownShift } = parseShiftFilterFromUrl(url);

    const salesFrom = parseBusinessDateRangeParam(url.searchParams.get("sales_from"), false);
    const salesTo = parseBusinessDateRangeParam(url.searchParams.get("sales_to"), true);
    const ordersFrom = parseBusinessDateRangeParam(url.searchParams.get("orders_from"), false);
    const ordersTo = parseBusinessDateRangeParam(url.searchParams.get("orders_to"), true);

    const salesRange = {
      from: salesFrom ?? defaultRange().from,
      to: salesTo ?? defaultRange().to,
    };
    const ordersRange = {
      from: ordersFrom ?? salesRange.from,
      to: ordersTo ?? salesRange.to,
    };

    if (salesRange.from > salesRange.to || ordersRange.from > ordersRange.to) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const supabase = getServiceClient();

    let sales = {
      total_qty: 0,
      total_revenue: 0,
      bill_count: 0,
      line_count: 0,
      most_sold: null as { name: string; qty: number } | null,
      least_sold: null as { name: string; qty: number } | null,
    };

    if (!(salesOutletFilterActive && salesOutletIds.length === 0)) {
      try {
        sales = await loadPosSalesStats(supabase, {
          outletIds: salesOutletIds,
          fromIso: salesRange.from.toISOString(),
          toIso: salesRange.to.toISOString(),
          shiftIds,
          includeUnknownShift,
        });
      } catch (salesError) {
        if (!isMissingRelationError(salesError as { code?: string; message?: string }, "outlet_sales")) {
          throw salesError;
        }
      }
    }

    const ordersRes = await supabase
      .from("orders")
      .select("id")
      .is("source_event_id", null)
      .gte("created_at", ordersRange.from.toISOString())
      .lte("created_at", ordersRange.to.toISOString())
      .limit(MAX_ORDER_ROWS);

    if (ordersRes.error) throw ordersRes.error;

    const orderIds = ((ordersRes.data as Array<{ id: string }>) ?? []).map((row) => row.id).filter(Boolean);
    const ordersByProduct: Array<{ name: string; qty: number }> = [];

    if (orderIds.length > 0) {
      const { data: orderItems, error: orderItemsError } = await supabase
        .from("order_items")
        .select("name,qty")
        .in("order_id", orderIds)
        .limit(MAX_ORDER_ROWS);
      if (orderItemsError) throw orderItemsError;

      for (const row of (orderItems as OrderItemRow[]) ?? []) {
        const qty = toNumber(row.qty);
        if (qty <= 0) continue;
        ordersByProduct.push({ name: (row.name ?? "Unknown").trim() || "Unknown", qty });
      }
    }

    const ordersAgg = aggregateByName(ordersByProduct);
    const { most: mostOrdered, least: leastOrdered } = pickMostLeast(ordersAgg);

    return NextResponse.json({
      sales,
      outlet_orders: {
        order_count: orderIds.length,
        most_ordered: mostOrdered,
        least_ordered: leastOrdered,
      },
      ranges: {
        sales: { from: salesRange.from.toISOString(), to: salesRange.to.toISOString() },
        orders: { from: ordersRange.from.toISOString(), to: ordersRange.to.toISOString() },
      },
    });
  } catch (error) {
    console.error("[dashboard/stats] GET failed", error);
    return NextResponse.json({ error: "Unable to load dashboard stats" }, { status: 500 });
  }
}
