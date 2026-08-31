import { NextRequest, NextResponse } from "next/server";
import { cloudBackendMeta } from "@/lib/cloud-backend";
import { fetchPosSales } from "@/lib/pos-sales-store";

type RawSalesRow = {
  id: string;
  outlet_id: string;
  item_id: string;
  variant_key: string | null;
  qty_units: number | null;
  sold_at: string;
  sale_price: number | null;
  vat_exc_price: number | null;
  flavour_price: number | null;
  catalog_items?: { name: string | null; item_kind: string | null }[] | { name: string | null; item_kind: string | null } | null;
  outlets?: { name: string | null }[] | { name: string | null } | null;
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const outletIds = url.searchParams.getAll("outlet_id").filter(Boolean);
    const startDate = url.searchParams.get("start_date");
    const startTime = url.searchParams.get("start_time");
    const endDate = url.searchParams.get("end_date");
    const endTime = url.searchParams.get("end_time");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 5000), 5000);

    let since = startDate ? new Date(`${startDate}T${startTime || "00:00"}:00`) : new Date();
    if (!startDate) {
      since = new Date();
      since.setDate(since.getDate() - 7);
    }

    let until: Date;
    if (endDate) {
      until = endTime
        ? new Date(`${endDate}T${endTime}:00`)
        : (() => {
            const end = new Date(`${endDate}T00:00:00`);
            end.setDate(end.getDate() + 1);
            return end;
          })();
    } else {
      until = new Date();
    }

    const outletId = outletIds.length === 1 ? outletIds[0] : null;
const payload = await fetchPosSales({
  outletId,
  since,
  until,
  limit,
  includeSales: true,
});

const sales = Array.isArray(payload.sales) ? payload.sales : [];
const filtered =
  outletIds.length > 1
    ? sales.filter((row) => outletIds.includes(String((row as { outlet_id?: string }).outlet_id ?? "")))
    : sales;

const rows = filtered.map((row) => {
  const record = row as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    outlet_id: String(record.outlet_id ?? ""),
    item_id: String(record.item_id ?? ""),
    variant_key: typeof record.variant_key === "string" ? record.variant_key : null,
    qty_units: typeof record.qty_units === "number" ? record.qty_units : null,
    sold_at: String(record.sold_at ?? ""),
    sale_price: typeof record.sale_price === "number" ? record.sale_price : null,
    vat_exc_price: typeof record.vat_exc_price === "number" ? record.vat_exc_price : null,
    flavour_price: typeof record.flavour_price === "number" ? record.flavour_price : null,
    catalog_items: null,
    outlets: null,
  };
});

return NextResponse.json({ rows, ...cloudBackendMeta() });
    
  } catch (error) {
    console.error("[outlet-sales] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlet sales" }, { status: 500 });
  }
}
