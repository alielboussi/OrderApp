"use client";

import { useEffect, useMemo, useState } from "react";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import {
  type CatalogSyncEventRow,
  type HeartbeatRow,
  type OutletRow,
  formatStamp,
  isHeartbeatMonitoredOutlet,
  isPosCatalogSyncEvent,
  MIDDLEWARE_POLL_MS,
  OFFLINE_MS,
} from "./middlewareMonitorShared";
import styles from "./enterprise.module.css";

export default function MiddlewareStatusPanel() {
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const [rows, setRows] = useState<HeartbeatRow[]>([]);
  const [allOutlets, setAllOutlets] = useState<OutletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastCatalogSyncByOutlet, setLastCatalogSyncByOutlet] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const [hbRes, outRes, catalogSyncRes] = await Promise.all([
          supabase
            .from("outlet_pos_heartbeats")
            .select("outlet_id,last_seen_at,middleware_version,host_name,outlets(id,name,code)")
            .order("last_seen_at", { ascending: false }),
          supabase.from("outlets").select("id,name,code,active,has_pos_middleware,channel").order("name"),
          supabase
            .from("outlet_catalog_sync_events")
            .select("outlet_id,delivered_at,entity_type,payload")
            .eq("status", "delivered")
            .not("delivered_at", "is", null)
            .order("delivered_at", { ascending: false })
            .limit(500),
        ]);

        if (!active) return;
        if (hbRes.error) throw hbRes.error;
        if (outRes.error) throw outRes.error;

        setRows((hbRes.data as HeartbeatRow[]) ?? []);
        setAllOutlets((outRes.data as OutletRow[]) ?? []);
        if (catalogSyncRes.error) {
          setLastCatalogSyncByOutlet({});
        } else {
          const syncMap: Record<string, string> = {};
          for (const row of (catalogSyncRes.data as CatalogSyncEventRow[]) ?? []) {
            if (!isPosCatalogSyncEvent(row) || !row.delivered_at) continue;
            if (!syncMap[row.outlet_id]) {
              syncMap[row.outlet_id] = row.delivered_at;
            }
          }
          setLastCatalogSyncByOutlet(syncMap);
        }
      } catch {
        if (active) {
          setRows([]);
          setAllOutlets([]);
          setLastCatalogSyncByOutlet({});
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    const interval = window.setInterval(load, MIDDLEWARE_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [supabase]);

  const merged = useMemo(() => {
    const hbByOutlet = new Map(rows.map((r) => [r.outlet_id, r]));
    const outlets = allOutlets.filter(isHeartbeatMonitoredOutlet);
    return outlets.map((outlet) => {
      const hb = hbByOutlet.get(outlet.id);
      const lastSeen = hb?.last_seen_at ?? null;
      const offline = !lastSeen || Date.now() - new Date(lastSeen).getTime() > OFFLINE_MS;
      return {
        outlet,
        hb,
        lastSeen,
        offline,
        lastCatalogSyncAt: lastCatalogSyncByOutlet[outlet.id] ?? null,
      };
    });
  }, [rows, allOutlets, lastCatalogSyncByOutlet]);

  const offlineCount = merged.filter((m) => m.offline).length;
  const onlineCount = merged.length - offlineCount;
  const offlineOutlets = merged.filter((m) => m.offline);

  return (
    <div>
      {offlineCount > 0 ? (
        <div className={`${styles.alertBanner} ${styles.alertRed}`} style={{ marginBottom: 16 }}>
          <div>
            <strong>
              {offlineCount} outlet{offlineCount > 1 ? "s" : ""} offline
            </strong>
            <div style={{ marginTop: 6, fontSize: 13 }}>
              {offlineOutlets.map((m) => m.outlet.name).join(", ")}
            </div>
          </div>
        </div>
      ) : null}

      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderBlue}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Middleware connection monitor
          </h3>
        </div>
        <div className={styles.summaryGrid}>
          <div className={`${styles.summaryCard} ${styles.summaryCardGreen}`}>
            <p className={styles.summaryLabel}>Online</p>
            <p className={styles.summaryValue}>{onlineCount}</p>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryCardGold}`}>
            <p className={styles.summaryLabel}>Offline</p>
            <p className={styles.summaryValue}>{offlineCount}</p>
          </div>
        </div>
      </section>

      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderGreen}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Outlet middleware status
          </h3>
        </div>
        {loading && merged.length === 0 ? (
          <p className={styles.pageCardBody}>Loading middleware status…</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Outlet</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th>Last synced at</th>
                  <th>Host</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {merged.map(({ outlet, hb, lastSeen, offline, lastCatalogSyncAt }) => (
                  <tr key={outlet.id}>
                    <td>
                      <strong>{outlet.name}</strong>
                      {outlet.code ? <div style={{ fontSize: 12, color: "#5c5c5c" }}>{outlet.code}</div> : null}
                    </td>
                    <td>
                      {offline ? (
                        <span className={styles.pillOffline}>Offline</span>
                      ) : (
                        <span className={styles.pillLive}>Online</span>
                      )}
                    </td>
                    <td>{formatStamp(lastSeen)}</td>
                    <td>{formatStamp(lastCatalogSyncAt)}</td>
                    <td>{hb?.host_name ?? "—"}</td>
                    <td>{hb?.middleware_version ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
