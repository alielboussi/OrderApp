import { NextResponse } from "next/server";
import { getFirestoreRecipeUomAvailableQty } from "@/lib/firestore-recipes";

const normalizeVariantKey = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length ? trimmed : "base";
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

const cleanUuid = (value: unknown) => (isUuid(value) ? value.trim() : null);

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const warehouseId = cleanUuid(payload.warehouse_id);
    const itemId = cleanUuid(payload.item_id);
    if (!warehouseId || !itemId) {
      return NextResponse.json({ error: "warehouse_id and item_id are required" }, { status: 400 });
    }

    const variantKey = normalizeVariantKey(payload.variant_key);

    const row = await getFirestoreRecipeUomAvailableQty(warehouseId, itemId, variantKey);
return NextResponse.json({ row, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[recipe-uom] available failed", error);
    return NextResponse.json({ error: "Unable to load recipe UOM availability" }, { status: 500 });
  }
}
