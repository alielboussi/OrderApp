import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;
const DEFAULT_DAYS = 7;
const VAT_RATE = 0.16;

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
  variant_uuid: string | null;
  variant_name: string | null;
  variant_sku: string | null;
  quantity: number;
  price_before_vat_16: number;
  price_after_vat_16: number;
  line_total_amount: number;
};

type SaleEvent = {
  sale_reference: string;
  source_event_id: string | null;
  outlet_uuid: string;
  outlet_name: string | null;
  sold_at: string;
  total_amount_of_sale: number;
  lines: SaleLine[];
};

const isUuid = (value: string) =>
  /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

function cleanUuid(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return isUuid(trimmed) ? trimmed : null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function toNumber(value: number | string | null | undefined): number {
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

function asNonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function variantLookupKey(itemId: string, variantIdOrSku: string): string {
  return `${itemId.toLowerCase()}::${variantIdOrSku.toLowerCase()}`;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const outletParam = url.searchParams.get("outletId");
    const outletId = cleanUuid(outletParam);
    if (outletParam && !outletId) {
      return NextResponse.json({ error: "Invalid outletId" }, { status: 400 });
    }

    const sinceParam = url.searchParams.get("since");
    const untilParam = url.searchParams.get("until");
    const since = parseDate(sinceParam);
    const until = parseDate(untilParam);
    if (sinceParam && !since) return NextResponse.json({ error: "Invalid since timestamp" }, { status: 400 });
    if (untilParam && !until) return NextResponse.json({ error: "Invalid until timestamp" }, { status: 400 });

    const now = new Date();
    const effectiveSince = since ?? new Date(now.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
    const effectiveUntil = until ?? now;
    if (effectiveSince > effectiveUntil) {
      return NextResponse.json({ error: "since must be before until" }, { status: 400 });
    }

    const limit = parseLimit(url.searchParams.get("limit"));
    const supabase = getServiceClient();

    let salesQuery = supabase
      .from("outlet_sales")
      .select("id,outlet_id,item_id,variant_key,flavour_id,qty_units,sold_at,sale_price,vat_exc_price,flavour_price,context")
      .not("context->>source_event_id", "is", null)
      .gte("sold_at", effectiveSince.toISOString())
      .lte("sold_at", effectiveUntil.toISOString())
      .order("sold_at", { ascending: false })
      .limit(limit);

    if (outletId) {
      salesQuery = salesQuery.eq("outlet_id", outletId);
    }

    const { data: salesData, error: salesError } = await salesQuery;
    if (salesError) throw salesError;

    const salesRows = ((salesData ?? []) as OutletSalesRow[]).filter((row) => row.outlet_id && row.item_id);

    if (salesRows.length === 0) {
      return NextResponse.json({
        since: effectiveSince.toISOString(),
        until: effectiveUntil.toISOString(),
        limit,
        sales_count: 0,
        sales: [],
      });
    }

    const outletIds = Array.from(new Set(salesRows.map((row) => row.outlet_id)));
    const itemIds = Array.from(new Set(salesRows.map((row) => row.item_id)));

    const [outletsRes, itemsRes, variantsRes] = await Promise.all([
      supabase.from("outlets").select("id,name").in("id", outletIds),
      supabase.from("catalog_items").select("id,name").in("id", itemIds),
      supabase.from("catalog_variants").select("id,item_id,name,sku").in("item_id", itemIds),
    ]);

    if (outletsRes.error) throw outletsRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (variantsRes.error) throw variantsRes.error;

    const outletById = new Map((outletsRes.data ?? []).map((row) => [row.id, row] as const));
    const itemById = new Map((itemsRes.data ?? []).map((row) => [row.id, row] as const));
    const variantByItemAndIdOrSku = new Map<string, VariantRow>();

    for (const row of (variantsRes.data ?? []) as VariantRow[]) {
      variantByItemAndIdOrSku.set(variantLookupKey(row.item_id, row.id), row);
      if (row.sku) variantByItemAndIdOrSku.set(variantLookupKey(row.item_id, row.sku), row);
    }

    const eventMap = new Map<string, SaleEvent>();

    for (const row of salesRows) {
      const context = row.context ?? {};
      const sourceEventId = asNonEmptyText(context.source_event_id);
      const fallbackSaleRef = asNonEmptyText(context.sale_id) ?? row.id;
      const saleReference = sourceEventId ?? `${row.outlet_id}:${fallbackSaleRef}`;
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

      const line: SaleLine = {
        outlet_uuid: row.outlet_id,
        outlet_name: outlet?.name ?? null,
        product_uuid: row.item_id,
        product_name: item?.name ?? null,
        variant_uuid: matchedVariant?.id ?? null,
        variant_name: matchedVariant?.name ?? null,
        variant_sku: matchedVariant?.sku ?? null,
        quantity: round2(quantity),
        price_before_vat_16: round2(unitBeforeVat),
        price_after_vat_16: round2(unitAfterVat),
        line_total_amount: round2(lineTotal),
      };

      const existing = eventMap.get(saleReference);
      if (!existing) {
        eventMap.set(saleReference, {
          sale_reference: saleReference,
          source_event_id: sourceEventId,
          outlet_uuid: row.outlet_id,
          outlet_name: outlet?.name ?? null,
          sold_at: row.sold_at,
          total_amount_of_sale: round2(lineTotal),
          lines: [line],
        });
      } else {
        existing.lines.push(line);
        existing.total_amount_of_sale = round2(existing.total_amount_of_sale + line.line_total_amount);
      }
    }

    const sales = Array.from(eventMap.values()).sort((a, b) => b.sold_at.localeCompare(a.sold_at));

    return NextResponse.json({
      since: effectiveSince.toISOString(),
      until: effectiveUntil.toISOString(),
      limit,
      sales_count: sales.length,
      sales,
    });
  } catch (error) {
    console.error("[outlet-middleware-sales] GET failed", error);
    return NextResponse.json({ error: "Unable to load middleware outlet sales" }, { status: 500 });
  }
}
