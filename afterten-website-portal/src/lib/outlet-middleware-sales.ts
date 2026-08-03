import { NextRequest, NextResponse } from "next/server";
import { parseBusinessDateRangeParam } from "@/lib/dateRangeParam";
import { getServiceClient } from "@/lib/supabase-server";
import { isMissingRelationError } from "@/lib/supabase-errors";
import {
  type MiddlewareSalesApiProfile,
  parseMiddlewareSalesApiProfile,
  outletIdsForMiddlewareSalesApiProfile,
  middlewareSaleRowMatchesProfile,
} from "@/lib/outletScope";
import { parseShiftFilterFromUrl } from "@/lib/posSalesStats";
import { shiftFilterIsAllInclusive } from "@/lib/posShift";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { handleOutletMiddlewareSalesRequestFirebase } from "@/lib/outlet-middleware-sales-firebase";

export const API_FORMAT_VERSION = 2;

const FETCH_PAGE_SIZE = 10_000;
const IN_CHUNK_SIZE = 100;
const VAT_RATE = 0.16;
const MINTPOS_SHIFT_NAMES: Record<number, string> = {
  1: "Day",
  2: "Night",
  3: "Midnight",
};

type OutletSalesRow = {
  id: string;
  outlet_id: string;
  item_id: string;
  variant_key: string | null;
  flavour_id: string | null;
  qty_units: number | string | null;
  sold_at: string;
  sale_price: number | string | null;
  vat_exc_price: number | string | null;
  flavour_price: number | string | null;
  context: Record<string, unknown> | null;
};

type OutletRow = {
  id: string;
  name: string | null;
};

type ItemRow = {
  id: string;
  name: string | null;
  menu_group_id: string | null;
};

type MenuGroupRow = {
  id: string;
  name: string | null;
  pos_menu_group_id: number | null;
};

type VariantRow = {
  id: string;
  item_id: string;
  name: string | null;
  sku: string | null;
};

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

type PaymentMethod = {
  method: string;
  amount: number;
};

type OrderRow = {
  source_event_id: string;
  pos_sale_id: string | null;
  raw_payload: Record<string, unknown> | null;
};

type SaleShift = {
  shift_id: number | null;
  shift_name: string | null;
  shift_session_id: number | null;
  terminal: string | null;
  shift_session_start: string | null;
  shift_session_end: string | null;
  shift_session_status: string | null;
  shift_opened_by: string | null;
};

type SaleCashier = {
  user_id: number | null;
  name: string | null;
  username: string | null;
};

type SaleLines = {
  paragraph: string;
  items: SaleLine[];
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
  lines: SaleLines;
};

type MutableSaleEvent = Omit<SaleEvent, "lines"> & { lineItems: SaleLine[] };

type SalesFilter =
  | { mode: "all"; outletId: string | null }
  | { mode: "profile"; profile: MiddlewareSalesApiProfile; outletIds: string[] };

type SupabaseServiceClient = ReturnType<typeof getServiceClient>;

const OUTLET_SALES_SELECT =
  "id,outlet_id,item_id,variant_key,flavour_id,qty_units,sold_at,sale_price,vat_exc_price,flavour_price,context";

async function fetchAllOutletSalesRows(
  supabase: SupabaseServiceClient,
  filterResult: SalesFilter,
  since: Date | null,
  until: Date,
): Promise<OutletSalesRow[]> {
  const rows: OutletSalesRow[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from("outlet_sales")
      .select(OUTLET_SALES_SELECT)
      .lte("sold_at", until.toISOString())
      .order("sold_at", { ascending: false });

    if (since) {
      query = query.gte("sold_at", since.toISOString());
    }

    if (filterResult.mode === "all") {
      if (filterResult.outletId) {
        query = query.eq("outlet_id", filterResult.outletId);
      }
    } else if (filterResult.outletIds.length === 1) {
      query = query.eq("outlet_id", filterResult.outletIds[0]);
    } else {
      query = query.in("outlet_id", filterResult.outletIds);
    }

    const { data, error } = await query.range(offset, offset + FETCH_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as OutletSalesRow[];
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
    offset += FETCH_PAGE_SIZE;
  }

  return rows;
}

const isUuid = (value: string) =>
  /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

function cleanUuid(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return isUuid(trimmed) ? trimmed : null;
}

function chunkValues<T>(values: T[], size = IN_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

async function fetchInChunks<T>(
  ids: string[],
  fetchChunk: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
): Promise<T[]> {
  if (!ids.length) return [];
  const rows: T[] = [];
  for (const chunk of chunkValues(ids)) {
    const { data, error } = await fetchChunk(chunk);
    if (error) throw error;
    if (data?.length) rows.push(...data);
  }
  return rows;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

/** YYYY-MM-DD → EAT business day; otherwise ISO/timestamp. */
function parseSalesBound(value: string | null, endOfDay: boolean): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return parseBusinessDateRangeParam(value, endOfDay);
  }
  return parseDate(value);
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

function formatLineSegment(line: SaleLine): string {
  const variant = line.variant_name ? ` (${line.variant_name})` : "";
  const sku = line.variant_sku ? ` [sku ${line.variant_sku}]` : "";
  const group = line.group_name ? ` · ${line.group_name}` : "";
  return `${line.product_name ?? "Item"}${variant}${sku}${group} ×${line.quantity} @ ${line.price_after_vat_16} = ${line.line_total_amount}`;
}

function formatSaleLinesParagraph(lineItems: SaleLine[]): string {
  if (lineItems.length === 0) return "";
  return lineItems.map(formatLineSegment).join("; ");
}

function finalizeSale(event: MutableSaleEvent): SaleEvent {
  const { lineItems, ...sale } = event;
  return {
    ...sale,
    lines: {
      paragraph: formatSaleLinesParagraph(lineItems),
      items: lineItems,
    },
  };
}

function asNonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function variantLookupKey(itemId: string, variantIdOrSku: string): string {
  return `${itemId.toLowerCase()}::${variantIdOrSku.toLowerCase()}`;
}

function isMiddlewareContext(context: unknown): boolean {
  const record = asRecord(context);
  if (!record) return false;

  const sourceEventId = asNonEmptyText(record.source_event_id);
  const saleId = asNonEmptyText(record.sale_id);
  const posOrderId = asNonEmptyText(record.pos_order_id);
  const sourceSystem = asNonEmptyText(record.source_system)?.toLowerCase() ?? null;

  if (sourceEventId || saleId || posOrderId) return true;
  if (sourceSystem && (sourceSystem.includes("pos") || sourceSystem.includes("afterten-pos"))) return true;

  return false;
}

function extractPosBillId(sourceEventId: string | null, outletId: string): string | null {
  if (!sourceEventId) return null;
  const prefix = `${outletId}-`;
  if (sourceEventId.startsWith(prefix)) return sourceEventId.slice(prefix.length);
  return null;
}

function extractPaymentMethods(rawPayload: Record<string, unknown> | null): PaymentMethod[] {
  const payload = asRecord(rawPayload);
  if (!payload || !Array.isArray(payload.payments)) return [];

  return payload.payments
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const method = asNonEmptyText((entry as Record<string, unknown>).method);
      if (!method) return null;
      const amount = round2(toNumber((entry as Record<string, unknown>).amount));
      return { method, amount };
    })
    .filter((entry): entry is PaymentMethod => entry !== null);
}

function toNullableInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value.trim();
  return new Date(parsed).toISOString();
}

function emptyShift(): SaleShift {
  return {
    shift_id: null,
    shift_name: null,
    shift_session_id: null,
    terminal: null,
    shift_session_start: null,
    shift_session_end: null,
    shift_session_status: null,
    shift_opened_by: null,
  };
}

function emptyCashier(): SaleCashier {
  return {
    user_id: null,
    name: null,
    username: null,
  };
}

function extractShift(rawPayload: Record<string, unknown> | null): SaleShift {
  const payload = asRecord(rawPayload);
  const fallbackTerminal = asNonEmptyText(payload?.terminal);
  if (!payload || !payload.shift || typeof payload.shift !== "object") {
    return { ...emptyShift(), terminal: fallbackTerminal };
  }

  const shift = payload.shift as Record<string, unknown>;
  const shiftId = toNullableInt(shift.shift_id);
  return {
    shift_id: shiftId,
    shift_name:
      asNonEmptyText(shift.shift_name) ??
      (shiftId != null ? MINTPOS_SHIFT_NAMES[shiftId] ?? null : null),
    shift_session_id: toNullableInt(shift.shift_session_id),
    terminal: asNonEmptyText(shift.terminal) ?? fallbackTerminal,
    shift_session_start: toIsoTimestamp(shift.session_start),
    shift_session_end: toIsoTimestamp(shift.session_end),
    shift_session_status: asNonEmptyText(shift.session_status),
    shift_opened_by: asNonEmptyText(shift.opened_by),
  };
}

function extractCashier(rawPayload: Record<string, unknown> | null): SaleCashier {
  const payload = asRecord(rawPayload);
  if (!payload || !payload.cashier || typeof payload.cashier !== "object") {
    return emptyCashier();
  }

  const cashier = payload.cashier as Record<string, unknown>;
  return {
    user_id: toNullableInt(cashier.user_id),
    name: asNonEmptyText(cashier.name),
    username: asNonEmptyText(cashier.username),
  };
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

function emptyPayload(
  since: string | null,
  until: string,
  filter: SalesFilter,
  warning?: string,
) {
  return {
    api_format_version: API_FORMAT_VERSION,
    since,
    until,
    sales_count: 0,
    grouping: "by_outlet" as const,
    middleware_api_profile: filter.mode === "profile" ? filter.profile : null,
    outlet_ids: filter.mode === "profile" ? filter.outletIds : undefined,
    outlet_summaries: [],
    sales: [],
    ...(warning ? { warning } : {}),
  };
}

export async function handleOutletMiddlewareSalesRequest(
  request: NextRequest,
  options?: { fixedProfile?: MiddlewareSalesApiProfile },
) {
  if (useFirebaseBackend()) {
    return handleOutletMiddlewareSalesRequestFirebase(request, options);
  }

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

    const sinceParam = url.searchParams.get("since");
    const untilParam = url.searchParams.get("until");
    const since = parseSalesBound(sinceParam, false);
    const until = parseSalesBound(untilParam, true);
    if (sinceParam && !since) return NextResponse.json({ error: "Invalid since timestamp" }, { status: 400 });
    if (untilParam && !until) return NextResponse.json({ error: "Invalid until timestamp" }, { status: 400 });

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

    const sinceIso = since?.toISOString() ?? null;
    const untilIso = effectiveUntil.toISOString();
    const supabase = getServiceClient();

    let salesData: OutletSalesRow[];
    try {
      salesData = await fetchAllOutletSalesRows(supabase, filterResult, since, effectiveUntil);
    } catch (salesError: unknown) {
      if (isMissingRelationError(salesError as { code?: string | null; message?: string | null }, "outlet_sales")) {
        return NextResponse.json(
          emptyPayload(
            sinceIso,
            untilIso,
            filterResult,
            "outlet_sales table missing — apply outlet_sales schema in Supabase",
          ),
        );
      }
      throw salesError;
    }

    const profileForScope = filterResult.mode === "profile" ? filterResult.profile : null;

    let salesRows = salesData
      .filter((row) => row.outlet_id && row.item_id)
      .filter((row) => isMiddlewareContext(row.context))
      .filter((row) => {
        if (!profileForScope) return true;
        const sourceEventId = asNonEmptyText(asRecord(row.context)?.source_event_id);
        return middlewareSaleRowMatchesProfile(row.outlet_id, sourceEventId, profileForScope);
      });

    if (applyShiftFilter && selectedShiftIds.size === 0 && !includeUnknownShift) {
      salesRows = [];
    }

    if (salesRows.length === 0) {
      return NextResponse.json(emptyPayload(sinceIso, untilIso, filterResult));
    }

    const outletIds = Array.from(new Set(salesRows.map((row) => row.outlet_id)));
    const itemIds = Array.from(
      new Set(salesRows.map((row) => cleanUuid(row.item_id)).filter((value): value is string => Boolean(value))),
    );
    const sourceEventIds = Array.from(
      new Set(
        salesRows
          .map((row) => asNonEmptyText(asRecord(row.context)?.source_event_id))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [outletsData, itemsData, variantsData, ordersData] = await Promise.all([
      fetchInChunks<OutletRow>(outletIds, (chunk) => supabase.from("outlets").select("id,name").in("id", chunk)),
      fetchInChunks<ItemRow>(itemIds, (chunk) =>
        supabase.from("catalog_items").select("id,name,menu_group_id").in("id", chunk),
      ),
      fetchInChunks<VariantRow>(itemIds, (chunk) =>
        supabase.from("catalog_variants").select("id,item_id,name,sku").in("item_id", chunk),
      ),
      sourceEventIds.length > 0
        ? fetchInChunks<OrderRow>(sourceEventIds, (chunk) =>
            supabase.from("orders").select("source_event_id,pos_sale_id,raw_payload").in("source_event_id", chunk),
          )
        : Promise.resolve([] as OrderRow[]),
    ]);

    const outletById = new Map(outletsData.map((row) => [row.id, row] as const));
    const itemById = new Map(itemsData.map((row) => [row.id, row] as const));
    const menuGroupIds = Array.from(
      new Set(itemsData.map((row) => row.menu_group_id).filter((value): value is string => Boolean(value))),
    );

    let menuGroupById = new Map<string, MenuGroupRow>();
    if (menuGroupIds.length > 0) {
      const menuGroupData = await fetchInChunks<MenuGroupRow>(menuGroupIds, (chunk) =>
        supabase.from("catalog_menu_groups").select("id,name,pos_menu_group_id").in("id", chunk),
      );
      menuGroupById = new Map(menuGroupData.map((row) => [row.id, row] as const));
    }
    const orderBySourceEventId = new Map(ordersData.map((row) => [row.source_event_id, row] as const));
    const variantByItemAndIdOrSku = new Map<string, VariantRow>();

    for (const row of variantsData) {
      variantByItemAndIdOrSku.set(variantLookupKey(row.item_id, row.id), row);
      if (row.sku) variantByItemAndIdOrSku.set(variantLookupKey(row.item_id, row.sku), row);
    }

    const eventMap = new Map<string, MutableSaleEvent>();

    for (const row of salesRows) {
      const context = asRecord(row.context) ?? {};
      const sourceEventId = asNonEmptyText(context.source_event_id);
      const fallbackSaleRef = asNonEmptyText(context.sale_id) ?? row.id;
      const saleReference = `${row.outlet_id}:${sourceEventId ?? fallbackSaleRef}`;
      const outlet = outletById.get(row.outlet_id) as OutletRow | undefined;
      const item = itemById.get(row.item_id) as ItemRow | undefined;

      const variantKey = asNonEmptyText(row.variant_key);
      const flavourId = asNonEmptyText(row.flavour_id);
      const variantLookup = variantKey && variantKey.toLowerCase() !== "base" ? variantKey : flavourId;
      const matchedVariant = variantLookup
        ? variantByItemAndIdOrSku.get(variantLookupKey(row.item_id, variantLookup))
        : undefined;

      const quantity = toNumber(row.qty_units);
      const unitAfterVat = toNumber(row.sale_price) || toNumber(row.flavour_price);
      const unitBeforeVat = toNumber(row.vat_exc_price) || (unitAfterVat > 0 ? unitAfterVat / (1 + VAT_RATE) : 0);
      const lineTotal = unitAfterVat * quantity;

      const menuGroup = item?.menu_group_id ? menuGroupById.get(item.menu_group_id) : undefined;
      const groupUuid = menuGroup?.id ?? item?.menu_group_id ?? null;
      const groupName = menuGroup?.name ?? null;

      const line: SaleLine = {
        outlet_uuid: row.outlet_id,
        outlet_name: outlet?.name ?? null,
        product_uuid: row.item_id,
        product_name: item?.name ?? null,
        group_uuid: groupUuid,
        group_name: groupName,
        variant_uuid: matchedVariant?.id ?? null,
        variant_name: matchedVariant?.name ?? null,
        variant_sku: matchedVariant?.sku ?? null,
        menu_group_uuid: groupUuid,
        menu_group_name: groupName,
        pos_menu_group_id: menuGroup?.pos_menu_group_id ?? null,
        quantity: round2(quantity),
        price_before_vat_16: round2(unitBeforeVat),
        price_after_vat_16: round2(unitAfterVat),
        line_total_amount: round2(lineTotal),
      };

      const existing = eventMap.get(saleReference);
      if (!existing) {
        const order = sourceEventId ? orderBySourceEventId.get(sourceEventId) : undefined;
        const orderPayload = asRecord(order?.raw_payload);
        const paymentMethods = extractPaymentMethods(orderPayload);
        const shift = extractShift(orderPayload);
        const cashier = extractCashier(orderPayload);
        const posSaleId =
          asNonEmptyText(order?.pos_sale_id) ??
          asNonEmptyText(context.sale_id) ??
          asNonEmptyText(orderPayload?.sale_id as string | undefined);

        eventMap.set(saleReference, {
          sale_reference: saleReference,
          source_event_id: sourceEventId,
          pos_bill_id: extractPosBillId(sourceEventId, row.outlet_id),
          pos_sale_id: posSaleId,
          payment_type: paymentMethods[0]?.method ?? null,
          payment_methods: paymentMethods,
          shift_name: shift.shift_name,
          shift_id: shift.shift_id,
          shift_session_id: shift.shift_session_id,
          terminal: shift.terminal,
          shift_session_start: shift.shift_session_start,
          shift_session_end: shift.shift_session_end,
          shift_session_status: shift.shift_session_status,
          shift_opened_by: shift.shift_opened_by,
          cashier_id: cashier.user_id,
          cashier_name: cashier.name,
          cashier_username: cashier.username,
          outlet_uuid: row.outlet_id,
          outlet_name: outlet?.name ?? null,
          sold_at: row.sold_at,
          total_amount_of_sale: round2(lineTotal),
          lineItems: [line],
        });
      } else {
        existing.lineItems.push(line);
        existing.total_amount_of_sale = round2(existing.total_amount_of_sale + line.line_total_amount);
      }
    }

    const sales = Array.from(eventMap.values())
      .map(finalizeSale)
      .filter((sale) => {
        if (!profileForScope) return true;
        if (!middlewareSaleRowMatchesProfile(sale.outlet_uuid, sale.source_event_id, profileForScope)) {
          return false;
        }
        const allowedOutletIds = new Set(outletIdsForMiddlewareSalesApiProfile(profileForScope));
        return sale.lines.items.every((line) => allowedOutletIds.has(line.outlet_uuid));
      })
      .filter((sale) => {
        if (!applyShiftFilter) return true;
        if (sale.shift_id == null) return includeUnknownShift;
        return selectedShiftIds.has(sale.shift_id);
      })
      .filter((sale) => {
        if (!applyCashierFilter) return true;
        if (selectedCashierId != null && sale.cashier_id === selectedCashierId) return true;
        if (
          selectedCashierName &&
          sale.cashier_name?.trim().toLowerCase() === selectedCashierName
        ) {
          return true;
        }
        if (
          selectedCashierUsername &&
          sale.cashier_username?.trim().toLowerCase() === selectedCashierUsername
        ) {
          return true;
        }
        return false;
      })
      .sort((a, b) => b.sold_at.localeCompare(a.sold_at));

    const outletSummaries = Array.from(
      sales
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
    ).sort((a, b) => (a.outlet_name ?? "").localeCompare(b.outlet_name ?? ""));

    return NextResponse.json(
      {
        api_format_version: API_FORMAT_VERSION,
        since: sinceIso,
        until: untilIso,
        sales_count: sales.length,
        grouping: "by_outlet",
        middleware_api_profile: filterResult.mode === "profile" ? filterResult.profile : null,
        outlet_ids: filterResult.mode === "profile" ? filterResult.outletIds : undefined,
        outlet_summaries: outletSummaries,
        sales,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("[outlet-middleware-sales] GET failed", error);
    return NextResponse.json({ error: "Unable to load middleware outlet sales" }, { status: 500 });
  }
}
