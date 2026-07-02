"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./enterprise.module.css";
import { formatStamp, MIDDLEWARE_POLL_MS, OFFLINE_MS } from "./middlewareMonitorShared";

type MiddlewareOutletRow = {
  outlet: {
    id: string;
    name: string;
    code?: string | null;
  };
  last_seen_at: string | null;
  last_catalog_sync_at: string | null;
  host_name: string | null;
  middleware_version: string | null;
  pending_sales_count: number | null;
  last_sync_error: string | null;
  last_sale_uploaded_at: string | null;
  offline: boolean;
  sync_unhealthy: boolean;
};

type MiddlewareStatusResponse = {
  online_count: number;
  offline_count: number;
  sync_unhealthy_count?: number;
  outlets: MiddlewareOutletRow[];
};

export default function MiddlewareStatusPanel() {
  const [merged, setMerged] = useState<MiddlewareOutletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/middleware-status", { cache: "no-store" });
        const json = (await res.json()) as MiddlewareStatusResponse & { error?: string };
        if (!res.ok) throw new Error(json.error || "Unable to load middleware status");
        if (!active) return;
        setMerged(json.outlets ?? []);
        setLoadError(null);
      } catch (err) {
        if (active) {
          setMerged([]);
          setLoadError(err instanceof Error ? err.message : "Unable to load middleware status");
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
  }, []);

  const offlineCount = merged.filter((m) => m.offline).length;
  const onlineCount = merged.length - offlineCount;
  const offlineOutlets = merged.filter((m) => m.offline);
  const syncUnhealthyOutlets = merged.filter((m) => m.sync_unhealthy);

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

      {syncUnhealthyOutlets.length > 0 ? (
        <div className={`${styles.alertBanner} ${styles.alertRed}`} style={{ marginBottom: 16 }}>
          <div>
            <strong>
              {syncUnhealthyOutlets.length} outlet{syncUnhealthyOutlets.length > 1 ? "s" : ""} with sync backlog or errors
            </strong>
            <div style={{ marginTop: 6, fontSize: 13 }}>
              {syncUnhealthyOutlets.map((m) => {
                const detail =
                  typeof m.pending_sales_count === "number" && m.pending_sales_count > 0
                    ? `${m.pending_sales_count} pending`
                    : m.last_sync_error
                      ? "sync error"
                      : "check queue";
                return `${m.outlet.name} (${detail})`;
              }).join(", ")}
            </div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              Review <a href="/Warehouse_Backoffice/pos-sync-failures">POS sync failures</a> and confirm each outlet PC runs the latest SCPGT.
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
        {loadError ? (
          <p className={styles.pageCardBody} style={{ color: "#b42318" }}>
            {loadError}
          </p>
        ) : loading && merged.length === 0 ? (
          <p className={styles.pageCardBody}>Loading middleware status…</p>
        ) : merged.length === 0 ? (
          <p className={styles.pageCardBody}>
            No middleware outlets found. Run <code>recreate_warehouses_core.sql</code> and{" "}
            <code>link_outlets_to_warehouses.sql</code> in Supabase, then confirm outlets have{" "}
            <strong>has_pos_middleware = true</strong> or an <strong>outlet_warehouses</strong> link.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Outlet</th>
                  <th>Status</th>
                  <th>Pending sales</th>
                  <th>Last seen</th>
                  <th>Last sale upload</th>
                  <th>Last catalog pull</th>
                  <th>Host</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {merged.map(
                  ({
                    outlet,
                    last_seen_at,
                    offline,
                    sync_unhealthy,
                    last_catalog_sync_at,
                    host_name,
                    middleware_version,
                    pending_sales_count,
                    last_sync_error,
                    last_sale_uploaded_at,
                  }) => (
                  <tr key={outlet.id}>
                    <td>
                      <strong>{outlet.name}</strong>
                      {outlet.code ? <div style={{ fontSize: 12, color: "#5c5c5c" }}>{outlet.code}</div> : null}
                      {last_sync_error ? (
                        <div style={{ fontSize: 12, color: "#b42318", marginTop: 4 }} title={last_sync_error}>
                          Sync error
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {offline ? (
                        <span className={styles.pillOffline}>Offline</span>
                      ) : sync_unhealthy ? (
                        <span className={styles.pillOffline}>Sync backlog</span>
                      ) : (
                        <span className={styles.pillLive}>Healthy</span>
                      )}
                    </td>
                    <td>{typeof pending_sales_count === "number" ? pending_sales_count : "—"}</td>
                    <td>{formatStamp(last_seen_at)}</td>
                    <td>{formatStamp(last_sale_uploaded_at)}</td>
                    <td>{formatStamp(last_catalog_sync_at)}</td>
                    <td>{host_name ?? "—"}</td>
                    <td>{middleware_version ?? "—"}</td>
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
