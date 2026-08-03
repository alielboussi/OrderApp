import { NextRequest, NextResponse } from "next/server";
import { listFirestoreWarehouseReportItems } from "@/lib/firestore-warehouse-reports";

type WarehouseItem = {
  item_id: string;
  item_name: string | null;
  variant_key: string | null;
  item_kind: string | null;
};

type LedgerRow = {
  item_id: string;
  variant_key: string | null;
  delta_units: number | string | null;
};

function normalizeVariantKey(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length ? trimmed : "base";
}

function makeKey(itemId: string, variantKey?: string | null): string {
  return `${itemId}::${normalizeVariantKey(variantKey)}`;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const warehouseId = url.searchParams.get("warehouse_id")?.trim() || "";
    const search = url.searchParams.get("search")?.trim() || "";
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");

    if (!warehouseId) {
      return NextResponse.json({ error: "warehouse_id is required" }, { status: 400 });
    }

    const result = await listFirestoreWarehouseReportItems({
  warehouseId,
  search: search || null,
  startDate,
  endDate,
});
return NextResponse.json({ ...result, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[warehouse-reports/items] GET failed", error);
    return NextResponse.json({ error: "Unable to load warehouse report" }, { status: 500 });
  }
}
