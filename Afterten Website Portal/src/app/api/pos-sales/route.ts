import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { fetchFirestorePosSales } from "@/lib/firestore-pos-sales";

const MAX_LIMIT = 2000;
const DEFAULT_LIMIT = 500;
const DEFAULT_DAYS = 7;

const isUuid = (value: string) =>
  /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

const cleanUuid = (value: string | null) => (value && isUuid(value) ? value.trim() : null);

const parseDate = (value: string | null) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
};

const parseLimit = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

const parseBranchId = (value: string | null) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  return parsed;
};

const parseBool = (value: string | null) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
};

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

    const sourceEventId = url.searchParams.get("sourceEventId")?.trim() ?? "";
    const sourceEventPrefix = url.searchParams.get("sourceEventPrefix")?.trim() ?? "";
    const branchParam = url.searchParams.get("branchId");
    const branchId = parseBranchId(branchParam);

    if (sinceParam && !since) {
      return NextResponse.json({ error: "Invalid since timestamp" }, { status: 400 });
    }

    if (untilParam && !until) {
      return NextResponse.json({ error: "Invalid until timestamp" }, { status: 400 });
    }

    if (branchParam && branchId === null) {
      return NextResponse.json({ error: "Invalid branchId" }, { status: 400 });
    }

    const now = new Date();
    const effectiveSince = since ?? new Date(now.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
    const effectiveUntil = until ?? now;

    if (effectiveSince > effectiveUntil) {
      return NextResponse.json({ error: "since must be before until" }, { status: 400 });
    }

    const includeSales = parseBool(url.searchParams.get("includeSales")) ||
      url.searchParams
        .get("include")
        ?.split(",")
        .map((value) => value.trim().toLowerCase())
        .includes("sales") === true;

    const limit = parseLimit(url.searchParams.get("limit"), DEFAULT_LIMIT);

    if (useFirebaseBackend()) {
      const payload = await fetchFirestorePosSales({
        outletId,
        since: effectiveSince,
        until: effectiveUntil,
        sourceEventId: sourceEventId || undefined,
        sourceEventPrefix: sourceEventId ? undefined : sourceEventPrefix || undefined,
        branchId,
        limit,
        includeSales,
      });
      return NextResponse.json(payload);
    }

    const supabase = getServiceClient();

    let orderQuery = supabase
      .from("orders")
      .select(
        "id,outlet_id,source_event_id,pos_sale_id,branch_id,order_type,bill_type,total_discount,total_discount_amount,total_gst,service_charges,delivery_charges,tip,pos_fee,price_type,raw_payload,created_at"
      )
      .not("source_event_id", "is", null)
      .gte("created_at", effectiveSince.toISOString())
      .lte("created_at", effectiveUntil.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (outletId) {
      orderQuery = orderQuery.eq("outlet_id", outletId);
    }

    if (sourceEventId) {
      orderQuery = orderQuery.eq("source_event_id", sourceEventId);
    } else if (sourceEventPrefix) {
      orderQuery = orderQuery.ilike("source_event_id", `${sourceEventPrefix}%`);
    }

    if (branchId !== null) {
      orderQuery = orderQuery.eq("branch_id", branchId);
    }

    const { data: orders, error: orderError } = await orderQuery;
    if (orderError) throw orderError;

    const response: Record<string, unknown> = {
      outlet_id: outletId,
      since: effectiveSince.toISOString(),
      until: effectiveUntil.toISOString(),
      limit,
      source_event_id: sourceEventId || null,
      source_event_prefix: sourceEventId ? null : sourceEventPrefix || null,
      branch_id: branchId,
      order_count: orders?.length ?? 0,
      orders: orders ?? [],
    };

    if (includeSales) {
      let salesQuery = supabase
        .from("outlet_sales")
        .select("id,outlet_id,item_id,variant_key,qty_units,sold_at,sale_price,vat_exc_price,flavour_price,context")
        .gte("sold_at", effectiveSince.toISOString())
        .lte("sold_at", effectiveUntil.toISOString())
        .order("sold_at", { ascending: false })
        .limit(limit);

      if (outletId) {
        salesQuery = salesQuery.eq("outlet_id", outletId);
      }

      if (sourceEventId) {
        salesQuery = salesQuery.filter("context->>source_event_id", "eq", sourceEventId);
      } else if (sourceEventPrefix) {
        salesQuery = salesQuery.filter("context->>source_event_id", "ilike", `${sourceEventPrefix}%`);
      }

      const { data: sales, error: salesError } = await salesQuery;
      if (salesError) throw salesError;

      response.sales_count = sales?.length ?? 0;
      response.sales = sales ?? [];
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[pos-sales] GET failed", error);
    return NextResponse.json({ error: "Unable to load POS sales" }, { status: 500 });
  }
}
