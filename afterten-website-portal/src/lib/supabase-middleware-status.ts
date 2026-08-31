import "server-only";

import {
  OFFLINE_MS,
  isHeartbeatMonitoredOutlet,
} from "@/app/Warehouse_Backoffice/middlewareMonitorShared";
import { cloudBackendMeta } from "@/lib/cloud-backend";
import { getSupabaseAdmin } from "@/lib/supabase-server";

async function getLastCatalogSyncByOutlet(): Promise<Record<string, string>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("outlet_catalog_sync_events")
    .select("outlet_id,entity_type,payload,delivered_at,status")
    .eq("status", "delivered")
    .order("delivered_at", { ascending: false })
    .limit(500);

  if (error) {
    console.warn("[middleware-status] catalog sync lookup failed", error.message);
    return {};
  }

  const lastByOutlet: Record<string, string> = {};
  for (const row of data ?? []) {
    const outletId = String(row.outlet_id ?? "");
    const deliveredAt =
      typeof row.delivered_at === "string" && row.delivered_at.trim() ? row.delivered_at : null;
    const entityType = String(row.entity_type ?? "");
    const payload =
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : null;
    const command = payload?.command;
    const isPosCatalogSync = entityType === "sync_pos_catalog" || command === "sync_pos_catalog";
    if (!outletId || !deliveredAt || !isPosCatalogSync) continue;
    if (!lastByOutlet[outletId]) {
      lastByOutlet[outletId] = deliveredAt;
    }
  }
  return lastByOutlet;
}

export async function getSupabaseMiddlewareStatus() {
  const supabase = getSupabaseAdmin();

  const [heartbeatResult, outletResult, lastCatalogSyncByOutlet] = await Promise.all([
    supabase
      .from("outlet_pos_heartbeats")
      .select("outlet_id,last_seen_at,middleware_version,host_name"),
    supabase.from("outlets").select("id,name,code,active,has_pos_middleware,channel"),
    getLastCatalogSyncByOutlet(),
  ]);

  if (heartbeatResult.error) throw new Error(heartbeatResult.error.message);
  if (outletResult.error) throw new Error(outletResult.error.message);

  const hbByOutlet = new Map<
    string,
    { last_seen_at: string | null; middleware_version: string | null; host_name: string | null }
  >();
  for (const row of heartbeatResult.data ?? []) {
    const outletId = String(row.outlet_id);
    hbByOutlet.set(outletId, {
      last_seen_at: typeof row.last_seen_at === "string" ? row.last_seen_at : null,
      middleware_version:
        typeof row.middleware_version === "string" ? row.middleware_version : null,
      host_name: typeof row.host_name === "string" ? row.host_name : null,
    });
  }

  const allOutlets = (outletResult.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "Outlet"),
    code: typeof row.code === "string" ? row.code : null,
    active: row.active !== false,
    has_pos_middleware: row.has_pos_middleware === true,
    channel: typeof row.channel === "string" ? row.channel : null,
  }));

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
    ...cloudBackendMeta(),
    debug: {
      total_outlets: allOutlets.length,
      monitored_outlets: outlets.length,
      heartbeat_rows: heartbeatResult.data?.length ?? 0,
      linked_outlets: 0,
      outlet_warehouses_error: null,
    },
  };
}
