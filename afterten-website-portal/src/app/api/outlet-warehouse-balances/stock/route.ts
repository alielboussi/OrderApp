import { NextRequest, NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { getFirestoreDb } from "@/lib/firebase-server";
import { listFirestoreWarehouseLiveItems } from "@/lib/firestore-warehouse-stock";
import { getServiceClient } from "@/lib/supabase-server";

function normalizeVariantKey(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length ? trimmed : "base";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const warehouseIds = Array.isArray(body.warehouse_ids)
      ? body.warehouse_ids.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    const kinds = Array.isArray(body.kinds)
      ? body.kinds.filter((kind: unknown): kind is string => typeof kind === "string")
      : [];
    const search = typeof body.search === "string" ? body.search.trim() : "";
    const baseOnly = body.base_only === true;

    if (warehouseIds.length === 0 || kinds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    if (useFirebaseBackend()) {
      const variantsSnap = await getFirestoreDb().collection("catalog_variants").get();
      const itemsWithVariants = new Set<string>();
      for (const doc of variantsSnap.docs) {
        const data = doc.data();
        if (data.active === false) continue;
        const itemId = typeof data.item_id === "string" ? data.item_id : null;
        if (itemId) itemsWithVariants.add(itemId);
      }

      const items = await listFirestoreWarehouseLiveItems({
        warehouseIds,
        kinds,
        search: search || null,
        baseOnly,
        itemsWithVariants,
      });
      return NextResponse.json({ items, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();

    const { data: warehouseRows, error: warehouseError } = await supabase
      .from("warehouses")
      .select("id,name,parent_warehouse_id")
      .in("id", warehouseIds);

    if (warehouseError) throw warehouseError;

    const warehouseNameMap = new Map<string, string>();
    (warehouseRows || []).forEach((row) => {
      if (!row?.id) return;
      warehouseNameMap.set(row.id, row.name?.trim() || row.id);
    });

    let stockQuery = supabase
      .from("warehouse_live_items")
      .select("warehouse_id,item_id,item_name,variant_key,net_units,item_kind")
      .in("warehouse_id", warehouseIds);

    if (search) {
      stockQuery = stockQuery.ilike("item_name", `%${search}%`);
    }

    const { data: stockRows, error: stockError } = await stockQuery;
    if (stockError) throw stockError;

    const rows = (stockRows ?? []) as Array<{
      warehouse_id: string;
      item_id: string;
      item_name: string | null;
      variant_key: string | null;
      net_units: number | null;
      item_kind: string | null;
    }>;

    const itemIds = Array.from(new Set(rows.map((row) => row.item_id).filter(Boolean)));

    const { data: variantRows, error: variantError } = itemIds.length
      ? await supabase.from("catalog_variants").select("id,item_id,active").in("item_id", itemIds)
      : { data: [], error: null };

    if (variantError) throw variantError;

    const itemsWithVariants = new Set<string>();
    (variantRows ?? []).forEach((row) => {
      if (row?.active === false) return;
      if (row?.item_id) itemsWithVariants.add(row.item_id);
    });

    const map = new Map<string, Record<string, unknown>>();
    rows.forEach((row) => {
      const kind = row.item_kind ?? "";
      if (!kinds.includes(kind)) return;
      const vKey = normalizeVariantKey(row.variant_key).toLowerCase();
      if (baseOnly && vKey !== "base") return;
      if (vKey === "base" && itemsWithVariants.has(row.item_id)) return;

      const key = `${row.warehouse_id}::${row.item_id}::${vKey}`;
      const existing = map.get(key);
      const onHandUnits = typeof row.net_units === "number" ? row.net_units : 0;

      if (existing) {
        existing.net_units = (Number(existing.net_units) || 0) + onHandUnits;
      } else {
        map.set(key, {
          warehouse_id: row.warehouse_id,
          warehouse_name: warehouseNameMap.get(row.warehouse_id) || row.warehouse_id,
          item_id: row.item_id,
          item_name: row.item_name,
          variant_key: normalizeVariantKey(row.variant_key),
          item_kind: kind,
          net_units: onHandUnits,
        });
      }
    });

    const items = Array.from(map.values()).sort((a, b) => {
      const warehouseCompare = String(a.warehouse_name ?? a.warehouse_id).localeCompare(
        String(b.warehouse_name ?? b.warehouse_id),
      );
      if (warehouseCompare !== 0) return warehouseCompare;
      return String(a.item_name ?? "").localeCompare(String(b.item_name ?? ""));
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[outlet-warehouse-balances/stock] POST failed", error);
    return NextResponse.json({ error: "Unable to load warehouse balances" }, { status: 500 });
  }
}
