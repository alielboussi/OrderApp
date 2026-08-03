import {
  OFFLINE_MS,
  isHeartbeatMonitoredOutlet,
  type OutletRow,
} from "@/app/Warehouse_Backoffice/middlewareMonitorShared";
import { getFirestoreDb } from "@/lib/firebase-server";
import { getLastCatalogSyncByOutlet } from "@/lib/firestore-catalog-sync";
import { Timestamp } from "firebase-admin/firestore";

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

async function loadLastCatalogSyncByOutlet(): Promise<Record<string, string>> {
  try {
    return await getLastCatalogSyncByOutlet();
  } catch (error) {
    console.warn("[middleware-status] catalog sync lookup failed", error);
    return {};
  }
}

export async function getFirestoreMiddlewareStatus() {
  const db = getFirestoreDb();

  const [heartbeatSnap, outletSnap, lastCatalogSyncByOutlet] = await Promise.all([
    db.collection("outlet_heartbeats").get(),
    db.collection("outlets").get(),
    loadLastCatalogSyncByOutlet(),
  ]);

  const hbByOutlet = new Map<
    string,
    { last_seen_at: string | null; middleware_version: string | null; host_name: string | null }
  >();
  for (const doc of heartbeatSnap.docs) {
    const data = doc.data();
    hbByOutlet.set(doc.id, {
      last_seen_at: timestampToIso(data.lastSeenAt),
      middleware_version:
        typeof data.middlewareVersion === "string" ? data.middlewareVersion : null,
      host_name: typeof data.hostName === "string" ? data.hostName : null,
    });
  }

  const allOutlets: OutletRow[] = outletSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: String(data.name ?? "Outlet"),
      code: null,
      active: data.active !== false,
      has_pos_middleware: data.hasPosMiddleware === true,
      channel: null,
    };
  });

  const outlets = allOutlets.filter((outlet) => isHeartbeatMonitoredOutlet(outlet));

  const merged = outlets.map((outlet) => {
    const hb = hbByOutlet.get(outlet.id);
    const lastSeen = hb?.last_seen_at ?? null;
    const offline = !lastSeen || Date.now() - new Date(lastSeen).getTime() > OFFLINE_MS;
    return {
      outlet,
      last_seen_at: lastSeen,
      last_catalog_sync_at: lastCatalogSyncByOutlet[outlet.id] ?? null,
      host_name: hb?.host_name ?? null,
      middleware_version: hb?.middleware_version ?? null,
      offline,
    };
  });

  const offlineCount = merged.filter((m) => m.offline).length;

  return {
    online_count: merged.length - offlineCount,
    offline_count: offlineCount,
    outlets: merged,
    cloud_backend: "firebase",
    debug: {
      total_outlets: allOutlets.length,
      monitored_outlets: outlets.length,
      heartbeat_rows: heartbeatSnap.size,
      linked_outlets: 0,
      outlet_warehouses_error: null,
    },
  };
}
