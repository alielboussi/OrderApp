import { NextResponse } from "next/server";
import { getFirestoreDb } from "@/lib/firebase-server";

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawIds = url.searchParams.getAll("storage_home_id");
    const storageHomeIds = rawIds.filter((id) => isUuid(id));
    if (!storageHomeIds.length) {
      return NextResponse.json({ items: [] });
    }

    const db = getFirestoreDb();
const itemIds = new Set<string>();
const snapshot = await db.collection("item_storage_homes").get();
for (const doc of snapshot.docs) {
  const data = doc.data();
  const warehouseId = data.storage_warehouse_id;
  const itemId = data.item_id;
  if (typeof warehouseId === "string" && storageHomeIds.includes(warehouseId) && typeof itemId === "string") {
    itemIds.add(itemId);
  }
}

const items: Array<Record<string, unknown> & { id: string }> = [];
for (const itemId of itemIds) {
  const snap = await db.collection("catalog_items").doc(itemId).get();
  if (!snap.exists) continue;
  const data = snap.data()!;
  if (data.item_kind !== "ingredient" || data.active === false) continue;
  items.push({ id: snap.id, ...data });
}
items.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
return NextResponse.json({ items, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[ingredient-catalog] GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load ingredient catalog" },
      { status: 500 }
    );
  }
}
