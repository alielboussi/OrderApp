import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-server";
import { listSupabaseOutlets } from "@/lib/supabase-outlets";
import {
  middlewareSaleRowMatchesProfile,
  middlewareSalesApiProfileForOutletId,
} from "@/lib/outletScope";
import { shiftFilterIsAllInclusive } from "@/lib/posShift";
import type { PosSalesStats, PosSalesStatsQuery } from "@/lib/posSalesStats";
import type { FirestorePosSalesQuery } from "@/lib/firestore-pos-sales";

const ORDER_LIMIT = 5000;

type PosOrderRow = {
  outlet_id: string;
  source_event_id: string;
  sold_at: string;
  raw_payload: Record<string, unknown>;
  shift_id: number | null;
  pos_sale_id: string | null;
  branch_id: number | null;
  order_type: string | null;
  bill_type: string | null;
  total_discount: number | null;
  total_discount_amount: number | null;
  total_gst: number | null;
  service_charges: number | null;
  delivery_charges: number | null;
  tip: number | null;
  pos_fee: number | null;
  price_type: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

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

function toNullableInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function soldAtFromOrder(rawPayload: Record<string, unknown>, createdAt: string): string {
  const occurred = asNonEmptyText(rawPayload.occurred_at);
  if (occurred) {
    const parsed = Date.parse(occurred);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    return occurred;
  }
  return createdAt;
}

function rowMatchesOutletProfile(outletId: string, sourceEventId: string | null): boolean {
  const profile = middlewareSalesApiProfileForOutletId(outletId);
  if (!profile) return true;
  return middlewareSaleRowMatchesProfile(outletId, sourceEventId, profile);
}

function aggregateByName(rows: Array<{ name: string; qty: number }>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.name, round2((map.get(row.name) ?? 0) + row.qty));
  }
  return Array.from(map.entries())
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

function pickMostLeast(items: Array<{ name: string; qty: number }>) {
  if (items.length === 0) return { most: null, least: null };
  const positive = items.filter((row) => row.qty > 0);
  if (positive.length === 0) return { most: null, least: null };
  return { most: positive[0], least: positive[positive.length - 1] };
}

async function resolveOutletIds(outletId: string | null): Promise<string[]> {
  if (outletId) return [outletId];
  const outlets = await listSupabaseOutlets();
  return outlets.filter((row) => row.active).map((row) => row.id);
}

function mapDbOrder(row: Record<string, unknown>): PosOrderRow | null {
  const sourceEventId = asNonEmptyText(row.source_event_id);
  const outletId = asNonEmptyText(row.outlet_id);
  if (!sourceEventId || !outletId) return null;

  const rawPayload = asRecord(row.raw_payload) ?? {};
  const shift = asRecord(rawPayload.shift);
  const createdAt = asNonEmptyText(row.created_at) ?? new Date().toISOString();

  return {
    outlet_id: outletId,
    source_event_id: sourceEventId,
    sold_at: soldAtFromOrder(rawPayload, createdAt),
    raw_payload: rawPayload,
    shift_id: toNullableInt(shift?.shift_id),
    pos_sale_id: asNonEmptyText(row.pos_sale_id) ?? asNonEmptyText(rawPayload.sale_id),
    branch_id: toNullableInt(row.branch_id) ?? toNullableInt(rawPayload.branch_id),
    order_type: asNonEmptyText(row.order_type) ?? asNonEmptyText(rawPayload.order_type),
    bill_type: asNonEmptyText(row.bill_type) ?? asNonEmptyText(rawPayload.bill_type),
    total_discount: toNullableInt(row.total_discount) ?? toNumber(rawPayload.total_discount),
    total_discount_amount:
      toNullableInt(row.total_discount_amount) ?? toNumber(rawPayload.total_discount_amount),
    total_gst: toNullableInt(row.total_gst) ?? toNumber(rawPayload.total_gst),
    service_charges: toNullableInt(row.service_charges) ?? toNumber(rawPayload.service_charges),
    delivery_charges: toNullableInt(row.delivery_charges) ?? toNumber(rawPayload.delivery_charges),
    tip: toNullableInt(row.tip) ?? toNumber(rawPayload.tip),
    pos_fee: toNullableInt(row.pos_fee) ?? toNumber(rawPayload.pos_fee),
    price_type: asNonEmptyText(row.price_type) ?? asNonEmptyText(rawPayload.price_type),
  };
}

async function fetchPosOrders(
  outletIds: string[],
  fromIso: string,
  toIso: string,
  options?: {
    sourceEventId?: string;
    sourceEventPrefix?: string;
    branchId?: number | null;
    limit?: number;
  },
): Promise<PosOrderRow[]> {
  const supabase = getSupabaseAdmin();
  const sinceMs = Date.parse(fromIso);
  const untilMs = Date.parse(toIso);
  const limit = options?.limit ?? ORDER_LIMIT;
  const rows: PosOrderRow[] = [];

  for (const outletId of outletIds) {
    let query = supabase
      .from("orders")
      .select(
        "outlet_id,source_event_id,pos_sale_id,branch_id,order_type,bill_type,total_discount,total_discount_amount,total_gst,service_charges,delivery_charges,tip,pos_fee,price_type,raw_payload,created_at",
      )
      .eq("outlet_id", outletId)
      .not("source_event_id", "is", null)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (options?.sourceEventId) {
      query = query.eq("source_event_id", options.sourceEventId);
    } else if (options?.sourceEventPrefix) {
      query = query.like("source_event_id", `${options.sourceEventPrefix}%`);
    }

    if (options?.branchId != null) {
      query = query.eq("branch_id", options.branchId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    for (const entry of data ?? []) {
      const mapped = mapDbOrder(entry as Record<string, unknown>);
      if (!mapped) continue;
      const soldMs = Date.parse(mapped.sold_at);
      if (!Number.isNaN(sinceMs) && soldMs < sinceMs) continue;
      if (!Number.isNaN(untilMs) && soldMs > untilMs) continue;
      rows.push(mapped);
    }
  }

  rows.sort((a, b) => b.sold_at.localeCompare(a.sold_at));
  return rows.slice(0, limit);
}

export async function loadSupabasePosSalesStats(query: PosSalesStatsQuery): Promise<PosSalesStats> {
  const empty: PosSalesStats = {
    total_qty: 0,
    total_revenue: 0,
    bill_count: 0,
    line_count: 0,
    most_sold: null,
    least_sold: null,
  };

  const outletIds =
    query.outletIds.length > 0 ? query.outletIds : await resolveOutletIds(null);
  if (outletIds.length === 0) return empty;

  let bills = await fetchPosOrders(outletIds, query.fromIso, query.toIso);
  bills = bills.filter((bill) => rowMatchesOutletProfile(bill.outlet_id, bill.source_event_id));

  const applyShiftFilter =
    query.shiftIds != null && !shiftFilterIsAllInclusive(query.shiftIds, query.includeUnknownShift);
  const selectedShiftIds = new Set(query.shiftIds ?? []);

  if (applyShiftFilter) {
    if (selectedShiftIds.size === 0 && !query.includeUnknownShift) return empty;
    bills = bills.filter((bill) => {
      if (bill.shift_id == null) return query.includeUnknownShift;
      return selectedShiftIds.has(bill.shift_id);
    });
  }

  let totalQty = 0;
  let totalRevenue = 0;
  let lineCount = 0;
  const salesByProduct: Array<{ name: string; qty: number }> = [];
  const billIds = new Set<string>();

  for (const bill of bills) {
    const items = Array.isArray(bill.raw_payload.items) ? bill.raw_payload.items : [];
    billIds.add(`${bill.outlet_id}:${bill.source_event_id}`);
    for (const entry of items) {
      const row = asRecord(entry);
      if (!row) continue;
      const qty = toNumber(row.quantity);
      const unitAfterVat = toNumber(row.sale_price) || toNumber(row.flavour_price);
      const lineTotal = round2(unitAfterVat * qty);
      totalQty = round2(totalQty + qty);
      totalRevenue = round2(totalRevenue + lineTotal);
      lineCount += 1;
      const name = asNonEmptyText(row.name) ?? "Unknown";
      salesByProduct.push({ name, qty: round2(qty) });
    }
  }

  const { most, least } = pickMostLeast(aggregateByName(salesByProduct));
  return {
    total_qty: totalQty,
    total_revenue: totalRevenue,
    bill_count: billIds.size,
    line_count: lineCount,
    most_sold: most,
    least_sold: least,
  };
}

export async function fetchSupabasePosSales(query: FirestorePosSalesQuery) {
  const outletIds = await resolveOutletIds(query.outletId);
  let bills = await fetchPosOrders(outletIds, query.since.toISOString(), query.until.toISOString(), {
    sourceEventId: query.sourceEventId,
    sourceEventPrefix: query.sourceEventId ? undefined : query.sourceEventPrefix,
    branchId: query.branchId,
    limit: query.limit,
  });

  bills = bills.slice(0, query.limit);

  const orders = bills.map((bill) => ({
    id: bill.source_event_id,
    outlet_id: bill.outlet_id,
    source_event_id: bill.source_event_id,
    pos_sale_id: bill.pos_sale_id,
    branch_id: bill.branch_id,
    order_type: bill.order_type,
    bill_type: bill.bill_type,
    total_discount: bill.total_discount ?? 0,
    total_discount_amount: bill.total_discount_amount ?? 0,
    total_gst: bill.total_gst ?? 0,
    service_charges: bill.service_charges ?? 0,
    delivery_charges: bill.delivery_charges ?? 0,
    tip: bill.tip ?? 0,
    pos_fee: bill.pos_fee ?? 0,
    price_type: bill.price_type,
    raw_payload: bill.raw_payload,
    created_at: bill.sold_at,
  }));

  const response: Record<string, unknown> = {
    outlet_id: query.outletId,
    since: query.since.toISOString(),
    until: query.until.toISOString(),
    limit: query.limit,
    source_event_id: query.sourceEventId || null,
    source_event_prefix: query.sourceEventId ? null : query.sourceEventPrefix || null,
    branch_id: query.branchId ?? null,
    order_count: orders.length,
    orders,
    backend: "supabase",
  };

  if (query.includeSales) {
    const sales: Array<Record<string, unknown>> = [];
    for (const bill of bills) {
      const items = Array.isArray(bill.raw_payload.items) ? bill.raw_payload.items : [];
      items.forEach((entry, index) => {
        const row = asRecord(entry);
        if (!row) return;
        sales.push({
          id: `${bill.source_event_id}:${index}`,
          outlet_id: bill.outlet_id,
          item_id: asNonEmptyText(row.item_sku) ?? asNonEmptyText(row.pos_item_id) ?? "unknown",
          variant_key: asNonEmptyText(row.variant_sku),
          qty_units: toNumber(row.quantity),
          sold_at: bill.sold_at,
          sale_price: toNumber(row.sale_price),
          vat_exc_price: toNumber(row.vat_exc_price),
          flavour_price: toNumber(row.flavour_price),
          context: {
            source_event_id: bill.source_event_id,
            sale_id: bill.pos_sale_id,
            source_system: "afterten-pos",
          },
        });
      });
    }
    response.sales_count = sales.length;
    response.sales = sales;
  }

  return response;
}

/** POS orders for middleware sales API (per-outlet, optional since bound). */
export async function fetchSupabasePosOrdersForOutlet(options: {
  outletId: string;
  since: Date | null;
  until: Date;
  limit?: number;
}): Promise<PosOrderRow[]> {
  const fromIso = options.since?.toISOString() ?? new Date(0).toISOString();
  return fetchPosOrders([options.outletId], fromIso, options.until.toISOString(), {
    limit: options.limit ?? ORDER_LIMIT,
  });
}
