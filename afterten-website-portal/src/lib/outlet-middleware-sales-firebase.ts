import { NextRequest, NextResponse } from "next/server";
import { Timestamp, type Query } from "firebase-admin/firestore";
import { parseBusinessDateRangeParam } from "@/lib/dateRangeParam";
import { getFirestoreDb } from "@/lib/firebase-server";
import {
  type MiddlewareSalesApiProfile,
  parseMiddlewareSalesApiProfile,
  outletIdsForMiddlewareSalesApiProfile,
  middlewareSaleRowMatchesProfile,
} from "@/lib/outletScope";
import { parseShiftFilterFromUrl } from "@/lib/posSalesStats";
import { shiftFilterIsAllInclusive } from "@/lib/posShift";
import { API_FORMAT_VERSION } from "@/lib/outlet-middleware-sales";
import {
  loadMiddlewareSalesCatalogIndex,
  resolveMiddlewareSaleCatalogLine,
} from "@/lib/middleware-sales-catalog-index";

const VAT_RATE = 0.16;
const MINTPOS_SHIFT_NAMES: Record<number, string> = {
  1: "Day",
  2: "Night",
  3: "Midnight",
};

type SalesFilter =
  | { mode: "all"; outletId: string | null }
  | { mode: "profile"; profile: MiddlewareSalesApiProfile; outletIds: string[] };

type PaymentMethod = { method: string; amount: number };

type SaleLine = {
  outlet_uuid: string;
  outlet_name: string | null;
  product_uuid: string;
  product_name: string | null;
  group_uuid: string | null;
  group_name: string | null;
  variant_uuid: string | null;
  variant_name: string | null;
  variant_sku: string | null;
  menu_group_uuid: string | null;
  menu_group_name: string | null;
  pos_menu_group_id: number | null;
  quantity: number;
  price_before_vat_16: number;
  price_after_vat_16: number;
  line_total_amount: number;
};

type SaleEvent = {
  sale_reference: string;
  source_event_id: string | null;
  pos_bill_id: string | null;
  pos_sale_id: string | null;
  payment_type: string | null;
  payment_methods: PaymentMethod[];
  shift_name: string | null;
  shift_id: number | null;
  shift_session_id: number | null;
  terminal: string | null;
  shift_session_start: string | null;
  shift_session_end: string | null;
  shift_session_status: string | null;
  shift_opened_by: string | null;
  cashier_id: number | null;
  cashier_name: string | null;
  cashier_username: string | null;
  outlet_uuid: string;
  outlet_name: string | null;
  sold_at: string;
  total_amount_of_sale: number;
  lines: { paragraph: string; items: SaleLine[] };
};

const isUuid = (value: string) =>
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value.trim());

function cleanUuid(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return isUuid(trimmed) ? trimmed : null;
}

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

function parseSalesBound(value: string | null, endOfDay: boolean): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return parseBusinessDateRangeParam(value, endOfDay);
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function extractPosBillId(sourceEventId: string | null, outletId: string): string | null {
  if (!sourceEventId) return null;
  const prefix = `${outletId}-`;
  if (sourceEventId.startsWith(prefix)) return sourceEventId.slice(prefix.length);
  return null;
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

function resolveSalesFilter(
  outletId: string | null,
  profileParam: string | null,
  fixedProfile?: MiddlewareSalesApiProfile,
): SalesFilter | { error: string } {
  const profile = fixedProfile ?? parseMiddlewareSalesApiProfile(profileParam);
  if (profile) {
    const allowedOutletIds = outletIdsForMiddlewareSalesApiProfile(profile);
    if (outletId && !allowedOutletIds.includes(outletId)) {
      return { error: `outletId is not part of the ${profile} middleware sales API profile` };
    }
    return { mode: "profile", profile, outletIds: outletId ? [outletId] : allowedOutletIds };
  }
  return { mode: "all", outletId };
}

function formatLineSegment(line: SaleLine): string {
  const variant = line.variant_name ? ` (${line.variant_name})` : "";
  const sku = line.variant_sku ? ` [sku ${line.variant_sku}]` : "";
  return `${line.product_name ?? "Item"}${variant}${sku} ×${line.quantity} @ ${line.price_after_vat_16} = ${line.line_total_amount}`;
}

export async function handleOutletMiddlewareSalesRequestFirebase(
  request: NextRequest,
  options?: { fixedProfile?: MiddlewareSalesApiProfile },
) {
  try {
    const url = new URL(request.url);
    const outletParam = url.searchParams.get("outletId");
    const outletId = cleanUuid(outletParam);
    if (outletParam && !outletId) {
      return NextResponse.json({ error: "Invalid outletId" }, { status: 400 });
    }

    const filterResult = resolveSalesFilter(outletId, url.searchParams.get("profile"), options?.fixedProfile);
    if ("error" in filterResult) {
      return NextResponse.json({ error: filterResult.error }, { status: 400 });
    }

    const since = parseSalesBound(url.searchParams.get("since"), false);
    const until = parseSalesBound(url.searchParams.get("until"), true);
    if (url.searchParams.get("since") && !since) {
      return NextResponse.json({ error: "Invalid since timestamp" }, { status: 400 });
    }
    if (url.searchParams.get("until") && !until) {
      return NextResponse.json({ error: "Invalid until timestamp" }, { status: 400 });
    }

    const now = new Date();
    const effectiveUntil = until ?? now;
    if (since && since > effectiveUntil) {
      return NextResponse.json({ error: "since must be before until" }, { status: 400 });
    }

    const { shiftIds, includeUnknownShift } = parseShiftFilterFromUrl(url);
    const applyShiftFilter =
      shiftIds != null && !shiftFilterIsAllInclusive(shiftIds, includeUnknownShift);
    const selectedShiftIds = new Set(shiftIds ?? []);

    const cashierIdParam = url.searchParams.get("cashierId") ?? url.searchParams.get("cashier_id");
    const cashierNameParam = url.searchParams.get("cashierName") ?? url.searchParams.get("cashier_name");
    const cashierUsernameParam =
      url.searchParams.get("cashierUsername") ?? url.searchParams.get("cashier_username");
    const selectedCashierId = cashierIdParam ? toNullableInt(cashierIdParam) : null;
    const selectedCashierName = cashierNameParam?.trim().toLowerCase() ?? null;
    const selectedCashierUsername = cashierUsernameParam?.trim().toLowerCase() ?? null;
    const applyCashierFilter =
      selectedCashierId != null || Boolean(selectedCashierName) || Boolean(selectedCashierUsername);

    const outletIds =
      filterResult.mode === "profile"
        ? filterResult.outletIds
        : filterResult.outletId
          ? [filterResult.outletId]
          : [];

    const db = getFirestoreDb();
    const catalogIndex = await loadMiddlewareSalesCatalogIndex(db, outletIds);
    const outletNames = new Map<string, string>();
    for (const id of outletIds) {
      const outletSnap = await db.collection("outlets").doc(id).get();
      if (outletSnap.exists) {
        outletNames.set(id, outletSnap.get("name") ?? "Outlet");
      }
    }

    const sales: SaleEvent[] = [];
    const sinceTs = since ? Timestamp.fromDate(since) : null;
    const untilTs = Timestamp.fromDate(effectiveUntil);

    for (const currentOutletId of outletIds) {
      let query: Query = db.collection("pos_sales").doc(currentOutletId).collection("bills");

      if (sinceTs) {
        query = query.where("occurredAt", ">=", sinceTs);
      }
      query = query.where("occurredAt", "<=", untilTs).orderBy("occurredAt", "desc").limit(5000);

      const snapshot = await query.get();
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const sourceEventId = asNonEmptyText(data.sourceEventId) ?? doc.id;
        const rawPayload = asRecord(data.rawPayload) ?? {};
        const shift = asRecord(rawPayload.shift);
        const cashier = asRecord(rawPayload.cashier);
        const payments = Array.isArray(rawPayload.payments) ? rawPayload.payments : [];
        const items = Array.isArray(rawPayload.items) ? rawPayload.items : [];

        const shiftId = toNullableInt(data.shiftId) ?? toNullableInt(shift?.shift_id);
        const soldAt = timestampToIso(data.occurredAt ?? rawPayload.occurred_at);

        const paymentMethods: PaymentMethod[] = payments
          .map((entry) => {
            const row = asRecord(entry);
            const method = asNonEmptyText(row?.method);
            if (!method) return null;
            return { method, amount: round2(toNumber(row?.amount)) };
          })
          .filter((entry): entry is PaymentMethod => entry !== null);

        const lineItems: SaleLine[] = items.map((entry) => {
          const row = asRecord(entry) ?? {};
          const quantity = toNumber(row.quantity);
          const unitAfterVat = toNumber(row.sale_price) || toNumber(row.flavour_price);
          const unitBeforeVat = toNumber(row.vat_exc_price) || (unitAfterVat > 0 ? unitAfterVat / (1 + VAT_RATE) : 0);
          const catalog = resolveMiddlewareSaleCatalogLine(catalogIndex, currentOutletId, {
            pos_item_id: row.pos_item_id,
            flavour_id: row.flavour_id,
            item_sku: row.item_sku,
            variant_sku: row.variant_sku,
            variant_id: row.variant_id ?? row.variantId,
            variant_key: row.variant_key ?? row.variantKey,
            name: row.name,
            flavour_name: row.flavour_name,
          });
          return {
            outlet_uuid: currentOutletId,
            outlet_name: outletNames.get(currentOutletId) ?? null,
            product_uuid: catalog.product_uuid,
            product_name: catalog.product_name ?? asNonEmptyText(row.name),
            group_uuid: catalog.group_uuid,
            group_name: catalog.group_name,
            variant_uuid: catalog.variant_uuid,
            variant_name: catalog.variant_name ?? asNonEmptyText(row.flavour_name),
            variant_sku: catalog.variant_sku ?? asNonEmptyText(row.variant_sku),
            menu_group_uuid: catalog.menu_group_uuid,
            menu_group_name: catalog.menu_group_name,
            pos_menu_group_id: catalog.pos_menu_group_id,
            quantity: round2(quantity),
            price_before_vat_16: round2(unitBeforeVat),
            price_after_vat_16: round2(unitAfterVat),
            line_total_amount: round2(unitAfterVat * quantity),
          };
        });

        const totalAmount = round2(lineItems.reduce((sum, line) => sum + line.line_total_amount, 0));

        sales.push({
          sale_reference: `${currentOutletId}:${sourceEventId}`,
          source_event_id: sourceEventId,
          pos_bill_id: extractPosBillId(sourceEventId, currentOutletId),
          pos_sale_id: asNonEmptyText(data.saleId) ?? asNonEmptyText(rawPayload.sale_id),
          payment_type: paymentMethods[0]?.method ?? null,
          payment_methods: paymentMethods,
          shift_name: asNonEmptyText(shift?.shift_name) ?? (shiftId != null ? MINTPOS_SHIFT_NAMES[shiftId] ?? null : null),
          shift_id: shiftId,
          shift_session_id: toNullableInt(shift?.shift_session_id),
          terminal: asNonEmptyText(shift?.terminal) ?? asNonEmptyText(rawPayload.terminal),
          shift_session_start: asNonEmptyText(shift?.session_start),
          shift_session_end: asNonEmptyText(shift?.session_end),
          shift_session_status: asNonEmptyText(shift?.session_status),
          shift_opened_by: asNonEmptyText(shift?.opened_by),
          cashier_id: toNullableInt(cashier?.user_id),
          cashier_name: asNonEmptyText(cashier?.name),
          cashier_username: asNonEmptyText(cashier?.username),
          outlet_uuid: currentOutletId,
          outlet_name: outletNames.get(currentOutletId) ?? null,
          sold_at: soldAt,
          total_amount_of_sale: totalAmount,
          lines: {
            paragraph: lineItems.map(formatLineSegment).join("; "),
            items: lineItems,
          },
        });
      }
    }

    const filteredSales = sales
      .filter((sale) => {
        if (filterResult.mode !== "profile") return true;
        return middlewareSaleRowMatchesProfile(sale.outlet_uuid, sale.source_event_id, filterResult.profile);
      })
      .filter((sale) => {
        if (!applyShiftFilter) return true;
        if (sale.shift_id == null) return includeUnknownShift;
        return selectedShiftIds.has(sale.shift_id);
      })
      .filter((sale) => {
        if (!applyCashierFilter) return true;
        if (selectedCashierId != null && sale.cashier_id === selectedCashierId) return true;
        if (selectedCashierName && sale.cashier_name?.trim().toLowerCase() === selectedCashierName) return true;
        if (selectedCashierUsername && sale.cashier_username?.trim().toLowerCase() === selectedCashierUsername) {
          return true;
        }
        return false;
      })
      .sort((a, b) => b.sold_at.localeCompare(a.sold_at));

    const outletSummaries = Array.from(
      filteredSales
        .reduce((map, sale) => {
          const existing = map.get(sale.outlet_uuid) ?? {
            outlet_id: sale.outlet_uuid,
            outlet_name: sale.outlet_name,
            sales_count: 0,
            total_amount: 0,
          };
          existing.sales_count += 1;
          existing.total_amount = round2(existing.total_amount + sale.total_amount_of_sale);
          map.set(sale.outlet_uuid, existing);
          return map;
        }, new Map<string, { outlet_id: string; outlet_name: string | null; sales_count: number; total_amount: number }>())
        .values(),
    );

    return NextResponse.json({
      api_format_version: API_FORMAT_VERSION,
      since: since?.toISOString() ?? null,
      until: effectiveUntil.toISOString(),
      sales_count: filteredSales.length,
      grouping: "by_outlet",
      cloud_backend: "firebase",
      middleware_api_profile: filterResult.mode === "profile" ? filterResult.profile : null,
      outlet_ids: filterResult.mode === "profile" ? filterResult.outletIds : undefined,
      outlet_summaries: outletSummaries,
      sales: filteredSales,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load middleware sales from Firebase";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
