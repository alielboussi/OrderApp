import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());
}

function cleanUuid(value: unknown): string | null {
  if (isUuid(value)) return value.trim();
  return null;
}

function normalizeStorageHomeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanUuid).filter((id): id is string => Boolean(id));
}

function buildStorageHomeIds(primaryId: string | null, extraIds: string[]): string[] {
  if (!extraIds.length && primaryId) return [primaryId];
  if (!primaryId) return extraIds;
  return extraIds.includes(primaryId) ? extraIds : [primaryId, ...extraIds];
}

async function syncBaseStorageHomes(
  supabase: ReturnType<typeof getServiceClient>,
  itemId: string,
  warehouseIds: string[]
) {
  const normalizedVariantKey = "base";
  const uniqueIds = Array.from(new Set(warehouseIds.filter(Boolean)));
  if (!uniqueIds.length) {
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

  const { data: existingRows, error: existingError } = await supabase
    .from("item_storage_homes")
    .select("storage_warehouse_id")
    .eq("item_id", itemId)
    .eq("normalized_variant_key", normalizedVariantKey);
  if (existingError) {
    throw new Error(existingError.message || "Failed to load item_storage_homes");
  }

  const existingIds = new Set(
    (Array.isArray(existingRows) ? existingRows : [])
      .map((row) => row?.storage_warehouse_id)
      .filter((id): id is string => Boolean(id))
  );
  const toDelete = Array.from(existingIds).filter((id) => !uniqueIds.includes(id));
  if (toDelete.length) {
    const { error } = await supabase
      .from("item_storage_homes")
      .delete()
      .eq("item_id", itemId)
      .eq("normalized_variant_key", normalizedVariantKey)
      .in("storage_warehouse_id", toDelete);
    if (error) {
      throw new Error(error.message || "Failed to delete item_storage_homes");
    }
  }

  const toInsert = uniqueIds.filter((id) => !existingIds.has(id));
  if (toInsert.length) {
    const { error } = await supabase
      .from("item_storage_homes")
      .upsert(
        toInsert.map((warehouseId) => ({
          item_id: itemId,
          variant_key: normalizedVariantKey,
          storage_warehouse_id: warehouseId,
        })),
        { onConflict: "item_id,normalized_variant_key,storage_warehouse_id" }
      );
    if (error) {
      throw new Error(error.message || "Failed to upsert item_storage_homes");
    }
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const itemId = cleanUuid(body.item_id);
    const storageWarehouseId =
      cleanUuid(body.storage_warehouse_id) ?? cleanUuid(body.storage_home_id) ?? cleanUuid(body.default_warehouse_id);
    const storageWarehouseIds = normalizeStorageHomeIds(body.storage_warehouse_ids ?? body.storage_home_ids);
    const defaultWarehouseId = storageWarehouseId ?? storageWarehouseIds[0] ?? null;
    const resolvedStorageHomeIds = buildStorageHomeIds(defaultWarehouseId, storageWarehouseIds);

    if (!itemId) {
      return NextResponse.json({ error: "Valid item_id is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { error: updateError } = await supabase
      .from("catalog_items")
      .update({ default_warehouse_id: defaultWarehouseId })
      .eq("id", itemId);
    if (updateError) {
      throw new Error(updateError.message || "Failed to update catalog_items");
    }

    await syncBaseStorageHomes(supabase, itemId, resolvedStorageHomeIds);

    return NextResponse.json({
      item_id: itemId,
      storage_warehouse_id: defaultWarehouseId,
      storage_warehouse_ids: resolvedStorageHomeIds,
    });
  } catch (error) {
    console.error("[item-storage-homes] PUT failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update storage home" },
      { status: 500 }
    );
  }
}
