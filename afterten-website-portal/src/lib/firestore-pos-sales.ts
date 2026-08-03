import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { getFirestoreDb } from "@/lib/firebase-server";
import {
  middlewareSaleRowMatchesProfile,
  middlewareSalesApiProfileForOutletId,
} from "@/lib/outletScope";
import { extractShiftId, shiftFilterIsAllInclusive } from "@/lib/posShift";
import type { PosSalesStats, PosSalesStatsQuery } from "@/lib/posSalesStats";

const FIRESTORE_BILL_LIMIT = 5000;

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

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    return value;
  }
  return new Date().toISOString();
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

type BillRow = {
  outletId: string;
  sourceEventId: string;
  soldAt: string;
  rawPayload: Record<string, unknown>;
  shiftId: number | null;
};

async function fetchBills(
  db: Firestore,
  outletIds: string[],
  fromIso: string,
  toIso: string,
): Promise<BillRow[]> {
  const sinceTs = Timestamp.fromDate(new Date(fromIso));
  const untilTs = Timestamp.fromDate(new Date(toIso));
  const rows: BillRow[] = [];

  for (const outletId of outletIds) {
    const snapshot = await db
      .collection("pos_sales")
      .doc(outletId)
      .collection("bills")
      .where("occurredAt", ">=", sinceTs)
      .where("occurredAt", "<=", untilTs)
      .orderBy("occurredAt", "desc")
      .limit(FIRESTORE_BILL_LIMIT)
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const sourceEventId = asNonEmptyText(data.sourceEventId) ?? doc.id;
      const rawPayload = asRecord(data.rawPayload) ?? {};
      const shift = asRecord(rawPayload.shift);
      rows.push({
        outletId,
        sourceEventId,
        soldAt: timestampToIso(data.occurredAt ?? rawPayload.occurred_at),
        rawPayload,
        shiftId: toNullableInt(data.shiftId) ?? toNullableInt(shift?.shift_id),
      });
    }
  }

  return rows;
}

async function resolveOutletIds(db: Firestore, outletId: string | null): Promise<string[]> {
  if (outletId) return [outletId];
  const snapshot = await db.collection("outlets").where("active", "==", true).get();
  return snapshot.docs.map((doc) => doc.id);
}

export async function loadFirestorePosSalesStats(query: PosSalesStatsQuery): Promise<PosSalesStats> {
  const empty: PosSalesStats = {
    total_qty: 0,
    total_revenue: 0,
    bill_count: 0,
    line_count: 0,
    most_sold: null,
    least_sold: null,
  };

  const db = getFirestoreDb();
  const outletIds =
    query.outletIds.length > 0 ? query.outletIds : await resolveOutletIds(db, null);
  if (outletIds.length === 0) return empty;

  let bills = await fetchBills(db, outletIds, query.fromIso, query.toIso);
  bills = bills.filter((bill) => rowMatchesOutletProfile(bill.outletId, bill.sourceEventId));

  const applyShiftFilter =
    query.shiftIds != null && !shiftFilterIsAllInclusive(query.shiftIds, query.includeUnknownShift);
  const selectedShiftIds = new Set(query.shiftIds ?? []);

  if (applyShiftFilter) {
    if (selectedShiftIds.size === 0 && !query.includeUnknownShift) return empty;
    bills = bills.filter((bill) => {
      if (bill.shiftId == null) return query.includeUnknownShift;
      return selectedShiftIds.has(bill.shiftId);
    });
  }

  let totalQty = 0;
  let totalRevenue = 0;
  let lineCount = 0;
  const salesByProduct: Array<{ name: string; qty: number }> = [];
  const billIds = new Set<string>();

  for (const bill of bills) {
    const items = Array.isArray(bill.rawPayload.items) ? bill.rawPayload.items : [];
    billIds.add(`${bill.outletId}:${bill.sourceEventId}`);
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

export type FirestorePosSalesQuery = {
  outletId: string | null;
  since: Date;
  until: Date;
  sourceEventId?: string;
  sourceEventPrefix?: string;
  branchId?: number | null;
  limit: number;
  includeSales: boolean;
};

export async function fetchFirestorePosSales(query: FirestorePosSalesQuery) {
  const db = getFirestoreDb();
  const outletIds = await resolveOutletIds(db, query.outletId);
  let bills = await fetchBills(
    db,
    outletIds,
    query.since.toISOString(),
    query.until.toISOString(),
  );

  if (query.sourceEventId) {
    bills = bills.filter((bill) => bill.sourceEventId === query.sourceEventId);
  } else if (query.sourceEventPrefix) {
    bills = bills.filter((bill) => bill.sourceEventId.startsWith(query.sourceEventPrefix!));
  }

  if (query.branchId != null) {
    bills = bills.filter((bill) => toNullableInt(bill.rawPayload.branch_id) === query.branchId);
  }

  bills = bills.slice(0, query.limit);

  const orders = bills.map((bill) => {
    const raw = bill.rawPayload;
    return {
      id: bill.sourceEventId,
      outlet_id: bill.outletId,
      source_event_id: bill.sourceEventId,
      pos_sale_id: asNonEmptyText(raw.sale_id),
      branch_id: toNullableInt(raw.branch_id),
      order_type: asNonEmptyText(raw.order_type),
      bill_type: asNonEmptyText(raw.bill_type),
      total_discount: toNumber(raw.total_discount),
      total_discount_amount: toNumber(raw.total_discount_amount),
      total_gst: toNumber(raw.total_gst),
      service_charges: toNumber(raw.service_charges),
      delivery_charges: toNumber(raw.delivery_charges),
      tip: toNumber(raw.tip),
      pos_fee: toNumber(raw.pos_fee),
      price_type: asNonEmptyText(raw.price_type),
      raw_payload: raw,
      created_at: bill.soldAt,
    };
  });

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
    backend: "firebase",
  };

  if (query.includeSales) {
    const sales: Array<Record<string, unknown>> = [];
    for (const bill of bills) {
      const items = Array.isArray(bill.rawPayload.items) ? bill.rawPayload.items : [];
      items.forEach((entry, index) => {
        const row = asRecord(entry);
        if (!row) return;
        sales.push({
          id: `${bill.sourceEventId}:${index}`,
          outlet_id: bill.outletId,
          item_id: asNonEmptyText(row.item_sku) ?? asNonEmptyText(row.pos_item_id) ?? "unknown",
          variant_key: asNonEmptyText(row.variant_sku),
          qty_units: toNumber(row.quantity),
          sold_at: bill.soldAt,
          sale_price: toNumber(row.sale_price),
          vat_exc_price: toNumber(row.vat_exc_price),
          flavour_price: toNumber(row.flavour_price),
          context: {
            source_event_id: bill.sourceEventId,
            sale_id: asNonEmptyText(bill.rawPayload.sale_id),
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

export async function loadFirestoreTransferOrderStats(
  outletIds: string[],
  fromIso: string,
  toIso: string,
) {
  const db = getFirestoreDb();
  const sinceTs = Timestamp.fromDate(new Date(fromIso));
  const untilTs = Timestamp.fromDate(new Date(toIso));

  const ordersByProduct: Array<{ name: string; qty: number }> = [];
  let orderCount = 0;

  const queryOutletIds =
    outletIds.length > 0
      ? outletIds
      : (await db.collection("outlets").where("active", "==", true).get()).docs.map((d) => d.id);

  for (const outletId of queryOutletIds) {
    const snapshot = await db
      .collection("transfer_orders")
      .where("outletId", "==", outletId)
      .where("createdAt", ">=", fromIso)
      .where("createdAt", "<=", toIso)
      .orderBy("createdAt", "desc")
      .limit(8000)
      .get();

    for (const doc of snapshot.docs) {
      orderCount += 1;
      const itemsSnap = await doc.ref.collection("items").get();
      for (const itemDoc of itemsSnap.docs) {
        const data = itemDoc.data();
        const qty = toNumber(data.qty);
        if (qty <= 0) continue;
        ordersByProduct.push({
          name: (asNonEmptyText(data.name) ?? "Unknown").trim() || "Unknown",
          qty: round2(qty),
        });
      }
    }
  }

  const agg = aggregateByName(ordersByProduct);
  const { most, least } = pickMostLeast(agg);
  return {
    order_count: orderCount,
    most_ordered: most,
    least_ordered: least,
  };
}
