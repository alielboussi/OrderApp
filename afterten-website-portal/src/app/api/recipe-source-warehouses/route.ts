import { NextResponse } from "next/server";
import {
  listFirestoreRecipeSourceWarehouses,
  saveFirestoreRecipeSourceWarehouses,
} from "@/lib/firestore-recipes";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim())
  );
}

function cleanUuid(value: unknown): string | null {
  if (isUuid(value)) return value.trim();
  return null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawIds = url.searchParams.get("item_ids") ?? "";
    const ids = rawIds
      .split(",")
      .map((id) => cleanUuid(id))
      .filter((id): id is string => Boolean(id));

    if (!ids.length) {
      return NextResponse.json({ selections: {} });
    }

    const selections = await listFirestoreRecipeSourceWarehouses(ids);
return NextResponse.json({ selections, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[recipe-source-warehouses] GET failed", error);
    return NextResponse.json({ error: "Unable to load recipe source warehouses" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const selections = Array.isArray(body?.selections) ? body.selections : [];

    const normalized: Array<{ item_id: string; warehouse_ids: string[] }> = [];
for (const entry of selections) {
  const itemId = cleanUuid(entry?.item_id);
  if (!itemId) continue;
  const rawWarehouseIds: unknown[] = Array.isArray(entry?.warehouse_ids) ? entry.warehouse_ids : [];
  const warehouseIds = rawWarehouseIds.map((rawId) => cleanUuid(rawId)).filter((id): id is string => Boolean(id));
  normalized.push({ item_id: itemId, warehouse_ids: warehouseIds });
}
await saveFirestoreRecipeSourceWarehouses(normalized);
return NextResponse.json({ ok: true, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[recipe-source-warehouses] PUT failed", error);
    return NextResponse.json({ error: "Unable to save recipe source warehouses" }, { status: 500 });
  }
}
