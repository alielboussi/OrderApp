import { NextResponse } from "next/server";
import {
  cancelFirestorePendingCatalogSyncForOfflineOutlets,
} from "@/lib/firestore-catalog-sync";
import { OFFLINE_MS } from "@/app/Warehouse_Backoffice/middlewareMonitorShared";

type HeartbeatRow = {
  outlet_id: string;
  last_seen_at: string | null;
};

type PendingEventRow = {
  id: string;
  outlet_id: string;
};

type OutletRow = {
  id: string;
  name: string | null;
};

function isOutletOnline(lastSeenAt: string | null | undefined, cutoffIso: string): boolean {
  if (!lastSeenAt) return false;
  return lastSeenAt >= cutoffIso;
}

export async function POST() {
  try {
    const result = await cancelFirestorePendingCatalogSyncForOfflineOutlets(OFFLINE_MS);
return NextResponse.json({ ok: true, ...result, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[catalog/cancel-offline-pending-sync] POST failed", error);
    return NextResponse.json({ error: "Unable to clear pending sync for offline outlets" }, { status: 500 });
  }
}
