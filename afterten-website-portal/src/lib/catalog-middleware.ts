import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { enqueueFirestoreCatalogSyncForOutlet } from "@/lib/firestore-catalog-sync";

export async function enqueueCatalogSyncForOutlet(  supabase: SupabaseClient | null,
  outletId: string,
  entityType: "item" | "variant" | "menu_group" | "delete" | "sync_pos_catalog",
  entityId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  if (useFirebaseBackend()) {
    return enqueueFirestoreCatalogSyncForOutlet(outletId, entityType, entityId, payload);
  }

  if (!supabase) {
    throw new Error("Supabase client is required when CLOUD_BACKEND is not firebase");
  }

  const { data, error } = await supabase
    .from("outlet_catalog_sync_events")
    .insert({
      outlet_id: outletId,
      entity_type: entityType,
      entity_id: entityId,
      payload,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(error.message || "Failed to enqueue catalog sync for outlet");
  }
  if (!data?.id) {
    throw new Error("Failed to enqueue catalog sync for outlet");
  }
  return String(data.id);
}
