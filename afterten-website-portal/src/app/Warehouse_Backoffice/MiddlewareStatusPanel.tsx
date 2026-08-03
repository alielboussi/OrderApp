"use client";

import { useEffect, useState } from "react";
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
  offline: boolean;
};

type MiddlewareStatusResponse = {
  online_count: number;
  offline_count: number;
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
        setLoadError(json.error ?? null);
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

  return (
    <div>
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
            <code>link_outlets_to_warehouses</code> in Firestore outlet records, then confirm outlets have{" "}
            <strong>has_pos_middleware = true</strong> or an <strong>outlet_warehouses</strong> link.
          </p>
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
                {merged.map(({ outlet, last_seen_at, offline, last_catalog_sync_at, host_name, middleware_version }) => (
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
                    <td>{formatStamp(last_seen_at)}</td>
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
