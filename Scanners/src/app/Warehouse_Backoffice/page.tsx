"use client";

import { useEffect, useMemo, useState } from "react";
import { useWarehouseAuth } from "./useWarehouseAuth";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { isPosMiddlewareOutlet } from "@/lib/outletScope";
import OutletLiveBalancesPanel from "./OutletLiveBalancesPanel";
import styles from "./enterprise.module.css";

type HeartbeatRow = {
  outlet_id: string;
  last_seen_at: string;
  middleware_version: string | null;
  host_name: string | null;
  outlets: Array<{ id: string; name: string; code?: string | null }> | null;
};

type OutletRow = {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean | null;
  has_pos_middleware?: boolean | null;
  channel?: string | null;
};

type MiddlewareScheduleRow = {
  id: string;
  scheduled_at: string | null;
  updated_at?: string | null;
};

const OFFLINE_MS = 10 * 60 * 1000;
const POLL_MS = 60_000;

function formatStamp(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function minutesAgo(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 60_000);
}

function formatCountdown(targetIso: string | null, nowMs: number) {
  if (!targetIso) return "Immediate";
  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) return "Immediate";
  const diffMs = target.getTime() - nowMs;
  if (diffMs <= 0) return "Due now";

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function WarehouseBackofficeDashboard() {
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const [rows, setRows] = useState<HeartbeatRow[]>([]);
  const [allOutlets, setAllOutlets] = useState<OutletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<MiddlewareScheduleRow | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#outlet-live-balances") return;
    const timer = window.setTimeout(() => {
      document.getElementById("outlet-live-balances")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status !== "ok") return;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const [hbRes, outRes, scheduleRes] = await Promise.all([
          supabase
            .from("outlet_pos_heartbeats")
            .select("outlet_id,last_seen_at,middleware_version,host_name,outlets(id,name,code)")
            .order("last_seen_at", { ascending: false }),
          supabase.from("outlets").select("id,name,code,active,has_pos_middleware,channel").order("name"),
          fetch("/api/middleware-catalog-schedule"),
        ]);

        if (!active) return;
        if (hbRes.error) throw hbRes.error;
        if (outRes.error) throw outRes.error;

        setRows((hbRes.data as HeartbeatRow[]) ?? []);
        setAllOutlets((outRes.data as OutletRow[]) ?? []);
        if (scheduleRes.ok) {
          const json = await scheduleRes.json();
          setSchedule((json.schedule ?? null) as MiddlewareScheduleRow | null);
        } else {
          setSchedule(null);
        }
        setLastChecked(new Date().toISOString());
      } catch {
        if (active) {
          setRows([]);
          setAllOutlets([]);
          setSchedule(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    const interval = window.setInterval(load, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [status, supabase]);

  const merged = useMemo(() => {
    const hbByOutlet = new Map(rows.map((r) => [r.outlet_id, r]));
    const outlets = allOutlets.filter(isPosMiddlewareOutlet);
    return outlets.map((outlet) => {
      const hb = hbByOutlet.get(outlet.id);
      const lastSeen = hb?.last_seen_at ?? null;
      const offline = !lastSeen || Date.now() - new Date(lastSeen).getTime() > OFFLINE_MS;
      return {
        outlet,
        hb,
        lastSeen,
        offline,
        minsAgo: minutesAgo(lastSeen),
      };
    });
  }, [rows, allOutlets]);

  const offlineCount = merged.filter((m) => m.offline).length;
  const onlineCount = merged.length - offlineCount;
  const countdown = formatCountdown(schedule?.scheduled_at ?? null, nowMs);

  if (status !== "ok") {
    return null;
  }

  return (
    <div>
      {offlineCount > 0 && (
        <div className={`${styles.alertBanner} ${styles.alertRed}`}>
          <div>
            <strong>{offlineCount} outlet{offlineCount > 1 ? "s" : ""} offline</strong>
            <div style={{ marginTop: 6, fontSize: 13 }}>
              {merged
                .filter((m) => m.offline)
                .map((m) => m.outlet.name)
                .join(", ")}
            </div>
          </div>
        </div>
      )}

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
          <div className={`${styles.summaryCard} ${styles.summaryCardBlue}`}>
            <p className={styles.summaryLabel}>Last checked</p>
            <p className={styles.summaryValue} style={{ fontSize: 13 }}>
              {formatStamp(lastChecked)}
            </p>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryCardBlue}`}>
            <p className={styles.summaryLabel}>Scheduled release</p>
            <p className={styles.summaryValue} style={{ fontSize: 13 }}>
              {countdown}
            </p>
            <p className={styles.pageCardBody} style={{ margin: "6px 0 0", fontSize: 12 }}>
              {schedule?.scheduled_at ? formatStamp(schedule.scheduled_at) : "No schedule set"}
            </p>
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
                  <th>Minutes ago</th>
                  <th>Host</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {merged.map(({ outlet, hb, lastSeen, offline, minsAgo }) => (
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
                    <td>{minsAgo != null ? minsAgo : "—"}</td>
                    <td>{hb?.host_name ?? "—"}</td>
                    <td>{hb?.middleware_version ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <OutletLiveBalancesPanel />
    </div>
  );
}
