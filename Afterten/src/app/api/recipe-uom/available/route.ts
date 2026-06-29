import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

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
    const supabase = getServiceClient();

    const { data, error } = await supabase.rpc("recipe_uom_available_qty", {
      p_warehouse_id: warehouseId,
      p_item_id: itemId,
      p_variant_key: variantKey,
    });

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    return NextResponse.json({ row: rows[0] ?? null });
  } catch (error) {
    console.error("[recipe-uom] available failed", error);
    return NextResponse.json({ error: "Unable to load recipe UOM availability" }, { status: 500 });
  }
}
