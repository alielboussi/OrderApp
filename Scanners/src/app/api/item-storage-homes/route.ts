import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());
}

function cleanUuid(value: unknown): string | null {
  if (isUuid(value)) return value.trim();
  return null;
}

async function upsertBaseStorageHome(
  supabase: ReturnType<typeof getServiceClient>,
  itemId: string,
  warehouseId: string | null
) {
  const normalizedVariantKey = "base";
  if (!warehouseId) {
    const { error } = await supabase
      .from("item_storage_homes")
      .delete()
      .eq("item_id", itemId)
      .eq("normalized_variant_key", normalizedVariantKey);
    if (error) {
      throw new Error(error.message || "Failed to delete item_storage_homes");
    }
    return;
  }

  const { error } = await supabase
    .from("item_storage_homes")
    .upsert(
      {
        item_id: itemId,
        variant_key: normalizedVariantKey,
          normalized_variant_key: normalizedVariantKey,
        storage_warehouse_id: warehouseId,
      },
      { onConflict: "item_id,normalized_variant_key" }
    );
  if (error) {
    throw new Error(error.message || "Failed to upsert item_storage_homes");
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const itemId = cleanUuid(body.item_id);
    const storageWarehouseId = cleanUuid(body.storage_warehouse_id);

    if (!itemId) {
      return NextResponse.json({ error: "Valid item_id is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { error: updateError } = await supabase
      .from("catalog_items")
      .update({ default_warehouse_id: storageWarehouseId })
      .eq("id", itemId);
    if (updateError) {
      throw new Error(updateError.message || "Failed to update catalog_items");
    }

    await upsertBaseStorageHome(supabase, itemId, storageWarehouseId);

    return NextResponse.json({ item_id: itemId, storage_warehouse_id: storageWarehouseId });
  } catch (error) {
    console.error("[item-storage-homes] PUT failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update storage home" },
      { status: 500 }
    );
  }
}
