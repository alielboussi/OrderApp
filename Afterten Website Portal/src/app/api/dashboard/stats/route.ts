import { NextRequest, NextResponse } from "next/server";
import { parseDateRangeParam } from "@/lib/dateRangeParam";
import { getServiceClient } from "@/lib/supabase-server";
import { isMissingRelationError } from "@/lib/supabase-errors";

type ProductQty = {
  name: string;
  qty: number;
};

type SalesRow = {
  item_id: string;
  variant_key: string | null;
  qty_units: number | null;
  sale_price: number | null;
  vat_exc_price: number | null;
  flavour_price: number | null;
  catalog_items: { name: string | null } | { name: string | null }[] | null;
};

type OrderItemRow = {
  name: string | null;
  qty: number | null;
};

const MAX_ROWS = 8000;
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

function relName(value: { name: string | null } | { name: string | null }[] | null | undefined): string {
  if (!value) return "Unknown";
  const row = Array.isArray(value) ? value[0] : value;
  return (row?.name ?? "Unknown").trim() || "Unknown";
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function aggregateByName(rows: Array<{ name: string; qty: number }>): ProductQty[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.name, (map.get(row.name) ?? 0) + row.qty);
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

    const salesFrom = parseDateRangeParam(url.searchParams.get("sales_from"), false);
    const salesTo = parseDateRangeParam(url.searchParams.get("sales_to"), true);
    const ordersFrom = parseDateRangeParam(url.searchParams.get("orders_from"), false);
    const ordersTo = parseDateRangeParam(url.searchParams.get("orders_to"), true);

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

    let salesRows: SalesRow[] = [];

    if (salesOutletFilterActive && salesOutletIds.length === 0) {
      salesRows = [];
    } else {
      let salesQuery = supabase
        .from("outlet_sales")
        .select("item_id,variant_key,qty_units,sale_price,vat_exc_price,flavour_price,catalog_items(name)")
        .gte("sold_at", salesRange.from.toISOString())
        .lte("sold_at", salesRange.to.toISOString())
        .limit(MAX_ROWS);

      if (salesOutletIds.length > 0) {
        salesQuery = salesQuery.in("outlet_id", salesOutletIds);
      }

      const salesRes = await salesQuery;
      if (salesRes.error) {
        if (!isMissingRelationError(salesRes.error, "outlet_sales")) throw salesRes.error;
      } else {
        salesRows = (salesRes.data as SalesRow[]) ?? [];
      }
    }

    let ordersQuery = supabase
      .from("orders")
      .select("id")
      .is("source_event_id", null)
      .gte("created_at", ordersRange.from.toISOString())
      .lte("created_at", ordersRange.to.toISOString())
      .limit(500);

    const ordersRes = await ordersQuery;

    if (ordersRes.error) throw ordersRes.error;

    let salesQty = 0;
    let salesRevenue = 0;
    const salesByProduct: Array<{ name: string; qty: number }> = [];

    for (const row of salesRows) {
      const qty = toNumber(row.qty_units);
      if (qty <= 0) continue;
      const unitPrice =
        toNumber(row.sale_price) || toNumber(row.vat_exc_price) || toNumber(row.flavour_price);
      salesQty += qty;
      salesRevenue += unitPrice * qty;
      salesByProduct.push({ name: relName(row.catalog_items), qty });
    }

    const salesAgg = aggregateByName(salesByProduct);
    const { most: mostSold, least: leastSold } = pickMostLeast(salesAgg);

    const orderIds = ((ordersRes.data as Array<{ id: string }>) ?? []).map((row) => row.id).filter(Boolean);
    const ordersByProduct: Array<{ name: string; qty: number }> = [];

    if (orderIds.length > 0) {
      const { data: orderItems, error: orderItemsError } = await supabase
        .from("order_items")
        .select("name,qty")
        .in("order_id", orderIds)
        .limit(MAX_ROWS);
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
      sales: {
        total_qty: salesQty,
        total_revenue: Math.round(salesRevenue * 100) / 100,
        most_sold: mostSold,
        least_sold: leastSold,
        row_count: salesRows.length,
      },
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
