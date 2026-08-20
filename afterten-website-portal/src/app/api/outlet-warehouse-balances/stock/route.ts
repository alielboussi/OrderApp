import { NextRequest, NextResponse } from "next/server";
import { getFirestoreDb } from "@/lib/firebase-server";
import { listFirestoreWarehouseLiveItems } from "@/lib/firestore-warehouse-stock";

/** Cache full-variant scan — previously re-read every 30s while the page was open. */
const VARIANT_CACHE_TTL_MS = 5 * 60 * 1000;
let itemsWithVariantsCache: { at: number; set: Set<string> } | null = null;

async function getItemsWithVariants(): Promise<Set<string>> {
  const now = Date.now();
  if (itemsWithVariantsCache && now - itemsWithVariantsCache.at < VARIANT_CACHE_TTL_MS) {
    return itemsWithVariantsCache.set;
  }
  const variantsSnap = await getFirestoreDb().collection("catalog_variants").get();
  const itemsWithVariants = new Set<string>();
  for (const doc of variantsSnap.docs) {
    const data = doc.data();
    if (data.active === false) continue;
    const itemId = typeof data.item_id === "string" ? data.item_id : null;
    if (itemId) itemsWithVariants.add(itemId);
  }
  itemsWithVariantsCache = { at: now, set: itemsWithVariants };
  return itemsWithVariants;
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

    const itemsWithVariants = await getItemsWithVariants();

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
