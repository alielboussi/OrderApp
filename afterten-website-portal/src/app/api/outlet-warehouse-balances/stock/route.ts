import { NextRequest, NextResponse } from "next/server";
import { getFirestoreDb } from "@/lib/firebase-server";
import { listFirestoreWarehouseLiveItems } from "@/lib/firestore-warehouse-stock";

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
    
  } catch (error) {
    console.error("[outlet-warehouse-balances/stock] POST failed", error);
    return NextResponse.json({ error: "Unable to load warehouse balances" }, { status: 500 });
  }
}
