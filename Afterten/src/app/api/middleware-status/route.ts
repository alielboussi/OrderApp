import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import {
  type CatalogSyncEventRow,
  type HeartbeatRow,
  type OutletRow,
  isHeartbeatMonitoredOutlet,
  isPosCatalogSyncEvent,
  OFFLINE_MS,
} from "@/app/Warehouse_Backoffice/middlewareMonitorShared";

export async function GET() {
  try {
    const supabase = getServiceClient();

    const [hbRes, outRes, catalogSyncRes, linkRes] = await Promise.all([
      supabase
        .from("outlet_pos_heartbeats")
        .select(
          "outlet_id,last_seen_at,middleware_version,host_name,pending_sales_count,unmapped_pos_skus_count,last_sync_error,last_sale_uploaded_at",
        )
        .order("last_seen_at", { ascending: false }),
      supabase.from("outlets").select("id,name,code,active,has_pos_middleware,channel").order("name"),
      supabase
        .from("outlet_catalog_sync_events")
        .select("outlet_id,delivered_at,entity_type,payload")
        .eq("status", "delivered")
        .not("delivered_at", "is", null)
        .order("delivered_at", { ascending: false })
        .limit(500),
      supabase.from("outlet_warehouses").select("outlet_id"),
    ]);

    if (hbRes.error) throw hbRes.error;
    if (outRes.error) throw outRes.error;

    const rows = (hbRes.data as HeartbeatRow[]) ?? [];
    const allOutlets = (outRes.data as OutletRow[]) ?? [];
    const linkedOutletIds = new Set(
      ((linkRes.data as { outlet_id: string }[] | null) ?? [])
        .map((row) => row.outlet_id)
        .filter(Boolean),
    );

    const lastCatalogSyncByOutlet: Record<string, string> = {};
    if (!catalogSyncRes.error) {
      for (const row of (catalogSyncRes.data as CatalogSyncEventRow[]) ?? []) {
        if (!isPosCatalogSyncEvent(row) || !row.delivered_at) continue;
        if (!lastCatalogSyncByOutlet[row.outlet_id]) {
          lastCatalogSyncByOutlet[row.outlet_id] = row.delivered_at;
        }
      }
    }

    const hbByOutlet = new Map(rows.map((r) => [r.outlet_id, r]));
    const outlets = allOutlets.filter(
      (outlet) => isHeartbeatMonitoredOutlet(outlet) || linkedOutletIds.has(outlet.id),
    );

    const merged = outlets.map((outlet) => {
      const hb = hbByOutlet.get(outlet.id);
      const lastSeen = hb?.last_seen_at ?? null;
      const offline = !lastSeen || Date.now() - new Date(lastSeen).getTime() > OFFLINE_MS;
      const pendingSales = hb?.pending_sales_count ?? null;
      const syncUnhealthy =
        !offline &&
        ((typeof pendingSales === "number" && pendingSales > 0) ||
          Boolean(hb?.last_sync_error));
      return {
        outlet,
        last_seen_at: lastSeen,
        last_catalog_sync_at: lastCatalogSyncByOutlet[outlet.id] ?? null,
        host_name: hb?.host_name ?? null,
        middleware_version: hb?.middleware_version ?? null,
        pending_sales_count: pendingSales,
        last_sync_error: hb?.last_sync_error ?? null,
        last_sale_uploaded_at: hb?.last_sale_uploaded_at ?? null,
        offline,
        sync_unhealthy: syncUnhealthy,
      };
    });

    const offlineCount = merged.filter((m) => m.offline).length;
    const onlineCount = merged.length - offlineCount;
    const syncUnhealthyCount = merged.filter((m) => m.sync_unhealthy).length;

    return NextResponse.json({
      online_count: onlineCount,
      offline_count: offlineCount,
      sync_unhealthy_count: syncUnhealthyCount,
      outlets: merged,
      debug: {
        total_outlets: allOutlets.length,
        monitored_outlets: outlets.length,
        heartbeat_rows: rows.length,
        linked_outlets: linkedOutletIds.size,
        outlet_warehouses_error: linkRes.error?.message ?? null,
      },
    });
  } catch (error) {
    console.error("[middleware-status] GET failed", error);
    return NextResponse.json({ error: "Unable to load middleware status" }, { status: 500 });
  }
}
