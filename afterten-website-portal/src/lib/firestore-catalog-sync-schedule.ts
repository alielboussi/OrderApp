import { Timestamp } from "firebase-admin/firestore";
import { getFirestoreDb } from "@/lib/firebase-server";
import type { CatalogSyncSchedule } from "@/lib/catalogSyncSchedule";

const GLOBAL_ID = "global";

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

export async function getFirestoreGlobalCatalogSyncSchedule(): Promise<CatalogSyncSchedule | null> {
  const snap = await getFirestoreDb().collection("middleware_catalog_schedule").doc(GLOBAL_ID).get();
  if (!snap.exists) return null;
  return {
    id: GLOBAL_ID,
    scheduled_at: timestampToIso(snap.get("scheduled_at")),
    updated_at: timestampToIso(snap.get("updated_at")),
  };
}

export async function upsertFirestoreGlobalCatalogSyncSchedule(
  scheduledAtIso: string | null,
): Promise<CatalogSyncSchedule> {
  const now = Timestamp.now();
  const payload = {
    scheduled_at: scheduledAtIso,
    updated_at: now,
  };
  const ref = getFirestoreDb().collection("middleware_catalog_schedule").doc(GLOBAL_ID);
  await ref.set(payload, { merge: true });
  return {
    id: GLOBAL_ID,
    scheduled_at: scheduledAtIso,
    updated_at: now.toDate().toISOString(),
  };
}
