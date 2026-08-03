import { NextRequest, NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { listFirestoreWarehouseReportItems } from "@/lib/firestore-warehouse-reports";
import { getServiceClient } from "@/lib/supabase-server";

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

    if (useFirebaseBackend()) {
      const result = await listFirestoreWarehouseReportItems({
        warehouseId,
        search: search || null,
        startDate,
        endDate,
      });
      return NextResponse.json({ ...result, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();

    const { data: listItems, error: listError } = await supabase.rpc("list_warehouse_items", {
      p_warehouse_id: warehouseId,
      p_outlet_id: null,
      p_search: search || null,
    });

    if (listError) throw listError;

    const items = ((listItems ?? []) as WarehouseItem[]).filter((item) => item?.item_id);
    const itemsByKey = new Map<string, WarehouseItem>();
    items.forEach((item) => {
      const key = makeKey(item.item_id, item.variant_key);
      if (!itemsByKey.has(key)) itemsByKey.set(key, item);
    });

    let ledgerQuery = supabase
      .from("stock_ledger")
      .select("item_id,variant_key,delta_units")
      .eq("location_type", "warehouse")
      .eq("warehouse_id", warehouseId);

    if (startDate) {
      ledgerQuery = ledgerQuery.gte("occurred_at", new Date(`${startDate}T00:00:00`).toISOString());
    }
    if (endDate) {
      const end = new Date(`${endDate}T00:00:00`);
      end.setDate(end.getDate() + 1);
      ledgerQuery = ledgerQuery.lt("occurred_at", end.toISOString());
    }

    const { data: ledgerRows, error: ledgerError } = await ledgerQuery;
    if (ledgerError) throw ledgerError;

    const totals = new Map<string, number>();
    ((ledgerRows ?? []) as LedgerRow[]).forEach((row) => {
      if (!row?.item_id) return;
      const key = makeKey(row.item_id, row.variant_key);
      if (!itemsByKey.has(key)) return;
      const delta = Number(row.delta_units ?? 0);
      if (!Number.isFinite(delta)) return;
      totals.set(key, (totals.get(key) ?? 0) + delta);
    });

    const rows = Array.from(itemsByKey.values())
      .map((item) => {
        const key = makeKey(item.item_id, item.variant_key);
        return {
          item_id: item.item_id,
          item_name: item.item_name ?? "Item",
          variant_key: normalizeVariantKey(item.variant_key),
          item_kind: item.item_kind ?? "unknown",
          total_units: totals.get(key) ?? 0,
        };
      })
      .sort((a, b) => a.item_name.localeCompare(b.item_name) || a.variant_key.localeCompare(b.variant_key));

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("[warehouse-reports/items] GET failed", error);
    return NextResponse.json({ error: "Unable to load warehouse report" }, { status: 500 });
  }
}
