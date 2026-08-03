import { NextResponse } from "next/server";
import { getFirestoreDb } from "@/lib/firebase-server";
import { syncFirestoreBaseStorageHomes } from "@/lib/firestore-catalog-store";

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value);
}

function cleanUuid(value: unknown): string | null {
  if (typeof value === "string" && isUuid(value)) return value.trim();
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

    await getFirestoreDb()
      .collection("catalog_items")
      .doc(itemId)
      .set({ default_warehouse_id: defaultWarehouseId, updated_at: new Date().toISOString() }, { merge: true });
    await syncFirestoreBaseStorageHomes(itemId, resolvedStorageHomeIds);
    return NextResponse.json({
      item_id: itemId,
      storage_warehouse_id: defaultWarehouseId,
      storage_warehouse_ids: resolvedStorageHomeIds,
      cloud_backend: "firebase",
    });
  } catch (error) {
    console.error("[item-storage-homes] PUT failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update storage home" },
      { status: 500 },
    );
  }
}
