import { getServiceClient } from "@/lib/supabase-server";

export type CatalogSyncSchedule = {
  id: string;
  scheduled_at: string | null;
  updated_at?: string | null;
};

const SCHEDULE_TABLE = "middleware_catalog_schedule";
const GLOBAL_ID = "global";

export async function getGlobalCatalogSyncSchedule(): Promise<CatalogSyncSchedule | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from(SCHEDULE_TABLE)
    .select("id,scheduled_at,updated_at")
    .eq("id", GLOBAL_ID)
    .maybeSingle();

  if (error) {
    return null;
  }

  if (!data) {
    return null;
  }

  return data as CatalogSyncSchedule;
}

export async function upsertGlobalCatalogSyncSchedule(scheduledAtIso: string | null) {
  const supabase = getServiceClient();
  const payload = {
    id: GLOBAL_ID,
    scheduled_at: scheduledAtIso,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(SCHEDULE_TABLE)
    .upsert(payload, { onConflict: "id" })
    .select("id,scheduled_at,updated_at")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to save middleware schedule");
  }

  return data as CatalogSyncSchedule;
}

export function normalizeFutureScheduledAt(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.getTime() > Date.now() ? parsed.toISOString() : null;
}
