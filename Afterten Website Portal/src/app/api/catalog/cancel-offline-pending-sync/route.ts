import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
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
    if (useFirebaseBackend()) {
      const result = await cancelFirestorePendingCatalogSyncForOfflineOutlets(OFFLINE_MS);
      return NextResponse.json({ ok: true, ...result, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const cutoffIso = new Date(Date.now() - OFFLINE_MS).toISOString();

    const [heartbeatRes, pendingRes] = await Promise.all([
      supabase.from("outlet_pos_heartbeats").select("outlet_id,last_seen_at"),
      supabase.from("outlet_catalog_sync_events").select("id,outlet_id").eq("status", "pending"),
    ]);

    if (heartbeatRes.error) throw heartbeatRes.error;
    if (pendingRes.error) throw pendingRes.error;

    const heartbeatByOutlet = new Map(
      ((heartbeatRes.data ?? []) as HeartbeatRow[]).map((row) => [row.outlet_id, row.last_seen_at] as const),
    );

    const pending = (pendingRes.data ?? []) as PendingEventRow[];
    if (pending.length === 0) {
      return NextResponse.json({
        ok: true,
        removed: 0,
        offline_outlets: [],
      });
    }

    const offlineOutletIds = Array.from(
      new Set(
        pending
          .map((row) => row.outlet_id)
          .filter((outletId) => !isOutletOnline(heartbeatByOutlet.get(outletId), cutoffIso)),
      ),
    );

    if (offlineOutletIds.length === 0) {
      return NextResponse.json({
        ok: true,
        removed: 0,
        offline_outlets: [],
      });
    }

    const eventIdsToRemove = pending
      .filter((row) => offlineOutletIds.includes(row.outlet_id))
      .map((row) => row.id);

    const { error: deleteError } = await supabase
      .from("outlet_catalog_sync_events")
      .delete()
      .in("id", eventIdsToRemove);

    if (deleteError) throw deleteError;

    const { data: outletRows, error: outletError } = await supabase
      .from("outlets")
      .select("id,name")
      .in("id", offlineOutletIds);
    if (outletError) throw outletError;

    const outletNameById = new Map(
      ((outletRows ?? []) as OutletRow[]).map((row) => [row.id, row.name ?? row.id] as const),
    );

    return NextResponse.json({
      ok: true,
      removed: eventIdsToRemove.length,
      offline_outlets: offlineOutletIds.map((id) => ({
        outlet_id: id,
        outlet_name: outletNameById.get(id) ?? id,
      })),
    });
  } catch (error) {
    console.error("[catalog/cancel-offline-pending-sync] POST failed", error);
    return NextResponse.json({ error: "Unable to clear pending sync for offline outlets" }, { status: 500 });
  }
}
