import "server-only";

import { enqueueFirestoreCatalogSyncForOutlet } from "@/lib/firestore-catalog-sync";

export async function enqueueCatalogSyncForOutlet(
  outletId: string,
  entityType: "item" | "variant" | "menu_group" | "delete" | "sync_pos_catalog",
  entityId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  return enqueueFirestoreCatalogSyncForOutlet(outletId, entityType, entityId, payload);
}
