"use client";

import { useEffect, useMemo, useState } from "react";
import { useWarehouseAuth } from "./useWarehouseAuth";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { isMiddlewareCatalogSyncOutlet, isStoreroomLabel } from "@/lib/outletScope";
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
const EXCLUDED_HEARTBEAT_OUTLET_IDS = new Set<string>([
  "24709409-08de-4906-b8ad-5b8d01db4a0b", // Ingredients Storeroom
  "5b6934d6-a22d-424e-a257-c1a867edd3df", // Flour Potatoes Storeroom
  "a497b8e7-31be-412d-817e-2b1ac9dda1d3", // Soyola Storeroom
  "efb641b2-e3ed-4b04-924e-44b1c21d6213", // Coldrooms Storerooms
]);

function formatStamp(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

const PREFS_STORAGE_KEY = "warehouse-pos-catalog-sync-prefs";

type CatalogSyncPrefs = {
  sync_products: boolean;
  sync_variants: boolean;
  sync_menu_groups: boolean;
  exclude_item_skus: string;
  exclude_variant_skus: string;
};

type CatalogSyncEventRow = {
  outlet_id: string;
  delivered_at: string | null;
  entity_type: string | null;
  payload: { command?: string | null } | null;
};

function defaultCatalogSyncPrefs(): CatalogSyncPrefs {
  return {
    sync_products: true,
    sync_variants: true,
    sync_menu_groups: true,
    exclude_item_skus: "",
    exclude_variant_skus: "",
  };
}

function parseSkuCsv(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function loadStoredCatalogSyncPrefs(): Record<string, CatalogSyncPrefs> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<CatalogSyncPrefs>>;
    const next: Record<string, CatalogSyncPrefs> = {};
    for (const [outletId, prefs] of Object.entries(parsed)) {
      next[outletId] = { ...defaultCatalogSyncPrefs(), ...prefs };
    }
    return next;
  } catch {
    return {};
  }
}

function isPosCatalogSyncEvent(row: CatalogSyncEventRow): boolean {
  return (
    row.entity_type === "sync_pos_catalog" ||
    row.payload?.command === "sync_pos_catalog"
  );
}

function isCatalogSyncOutlet(outlet: OutletRow): boolean {
  return isMiddlewareCatalogSyncOutlet(outlet);
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

function isHeartbeatMonitoredOutlet(outlet: OutletRow): boolean {
  if (outlet.active === false) return false;
  if (EXCLUDED_HEARTBEAT_OUTLET_IDS.has(outlet.id)) return false;

  const label = `${outlet.name ?? ""} ${outlet.code ?? ""}`.toLowerCase();
  if (isStoreroomLabel(label)) return false;

  if (outlet.has_pos_middleware === true) return true;

  const channel = (outlet.channel ?? "").trim().toLowerCase();
  return channel === "point of sale" || channel === "pos";
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
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    requested: number;
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [cancelOfflineBusy, setCancelOfflineBusy] = useState(false);
  const [cancelOfflineResult, setCancelOfflineResult] = useState<{
    removed: number;
    offline_outlets: Array<{ outlet_id: string; outlet_name: string }>;
  } | null>(null);
  const [lastCatalogSyncByOutlet, setLastCatalogSyncByOutlet] = useState<Record<string, string>>({});
  const [selectedSyncOutletIds, setSelectedSyncOutletIds] = useState<string[]>([]);
  const [catalogSyncPrefs, setCatalogSyncPrefs] = useState<Record<string, CatalogSyncPrefs>>({});
  const [shieldExpandedOutletIds, setShieldExpandedOutletIds] = useState<Record<string, boolean>>({});
  const [syncOutletsInitialized, setSyncOutletsInitialized] = useState(false);

  useEffect(() => {
    setCatalogSyncPrefs(loadStoredCatalogSyncPrefs());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(catalogSyncPrefs));
  }, [catalogSyncPrefs]);

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
        const [hbRes, outRes, scheduleRes, catalogSyncRes] = await Promise.all([
          supabase
            .from("outlet_pos_heartbeats")
            .select("outlet_id,last_seen_at,middleware_version,host_name,outlets(id,name,code)")
            .order("last_seen_at", { ascending: false }),
          supabase.from("outlets").select("id,name,code,active,has_pos_middleware,channel").order("name"),
          fetch("/api/middleware-catalog-schedule"),
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
          setLastCatalogSyncByOutlet({});
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

  const middlewareOutlets = useMemo(
    () => allOutlets.filter(isCatalogSyncOutlet),
    [allOutlets],
  );

  useEffect(() => {
    if (syncOutletsInitialized || middlewareOutlets.length === 0) return;
    setSelectedSyncOutletIds(middlewareOutlets.map((outlet) => outlet.id));
    setSyncOutletsInitialized(true);
  }, [middlewareOutlets, syncOutletsInitialized]);

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

  const allSyncOutletsSelected =
    middlewareOutlets.length > 0 &&
    middlewareOutlets.every((outlet) => selectedSyncOutletIds.includes(outlet.id));

  const toggleSyncOutlet = (outletId: string) => {
    setSelectedSyncOutletIds((prev) =>
      prev.includes(outletId) ? prev.filter((id) => id !== outletId) : [...prev, outletId],
    );
  };

  const toggleSelectAllSyncOutlets = (checked: boolean) => {
    setSelectedSyncOutletIds(checked ? middlewareOutlets.map((outlet) => outlet.id) : []);
  };

  const updateCatalogSyncPrefs = (outletId: string, patch: Partial<CatalogSyncPrefs>) => {
    setCatalogSyncPrefs((prev) => ({
      ...prev,
      [outletId]: { ...defaultCatalogSyncPrefs(), ...prev[outletId], ...patch },
    }));
  };

  const toggleShieldPanel = (outletId: string) => {
    setShieldExpandedOutletIds((prev) => ({ ...prev, [outletId]: !prev[outletId] }));
  };

  const outletPrefs = (outletId: string) => catalogSyncPrefs[outletId] ?? defaultCatalogSyncPrefs();

  const offlineCount = merged.filter((m) => m.offline).length;
  const onlineCount = merged.length - offlineCount;
  const countdown = formatCountdown(schedule?.scheduled_at ?? null, nowMs);

  const runPosCatalogSync = async () => {
    if (selectedSyncOutletIds.length === 0) {
      setSyncError("Select at least one outlet to sync.");
      return;
    }

    setSyncBusy(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const outlet_options: Record<
        string,
        {
          sync_products: boolean;
          sync_variants: boolean;
          sync_menu_groups: boolean;
          exclude_item_skus: string[];
          exclude_variant_skus: string[];
        }
      > = {};

      for (const outletId of selectedSyncOutletIds) {
        const prefs = outletPrefs(outletId);
        if (!prefs.sync_products && !prefs.sync_variants && !prefs.sync_menu_groups) {
          throw new Error("Each selected outlet needs at least one sync scope enabled in its shield settings.");
        }
        outlet_options[outletId] = {
          sync_products: prefs.sync_products,
          sync_variants: prefs.sync_variants,
          sync_menu_groups: prefs.sync_menu_groups,
          exclude_item_skus: parseSkuCsv(prefs.exclude_item_skus),
          exclude_variant_skus: parseSkuCsv(prefs.exclude_variant_skus),
        };
      }

      const res = await fetch("/api/catalog/request-pos-catalog-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_ids: selectedSyncOutletIds,
          outlet_options,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to request POS catalog sync");
      }
      setSyncResult(json);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Failed to request POS catalog sync");
    } finally {
      setSyncBusy(false);
    }
  };

  const cancelOfflinePendingSync = async () => {
    setCancelOfflineBusy(true);
    setSyncError(null);
    setCancelOfflineResult(null);
    try {
      const res = await fetch("/api/catalog/cancel-offline-pending-sync", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to clear pending sync for offline outlets");
      }
      setCancelOfflineResult(json);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Failed to clear pending sync for offline outlets");
    } finally {
      setCancelOfflineBusy(false);
    }
  };

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

      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderBlue}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            POS {"->"} Supabase catalog sync
          </h3>
          <p className={styles.pageCardBody} style={{ marginTop: 8 }}>
            Request selected middleware outlets to pull local MintPOS catalog and sync variant SKUs and menu groups to
            Supabase. Use each outlet shield to choose products, variants, and menu groups to include. Website catalog
            changes still flow outbound via Send updates on the catalog menu.
          </p>
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={runPosCatalogSync}
            disabled={syncBusy || selectedSyncOutletIds.length === 0}
          >
            {syncBusy ? "Requesting..." : "Sync POS catalog now"}
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={cancelOfflinePendingSync}
            disabled={cancelOfflineBusy || syncBusy}
          >
            {cancelOfflineBusy ? "Clearing..." : "Clear pending sync for offline outlets"}
          </button>
        </div>

        <div className={styles.syncOutletPanel}>
          <label className={styles.syncOutletSelectAll}>
            <input
              type="checkbox"
              checked={allSyncOutletsSelected}
              onChange={(event) => toggleSelectAllSyncOutlets(event.target.checked)}
              disabled={middlewareOutlets.length === 0}
            />
            <span>Select all outlets</span>
          </label>

          {middlewareOutlets.length === 0 ? (
            <p className={styles.pageCardBody} style={{ margin: 0 }}>
              No active middleware outlets found.
            </p>
          ) : (
            <div className={styles.syncOutletList}>
              {middlewareOutlets.map((outlet) => {
                const selected = selectedSyncOutletIds.includes(outlet.id);
                const prefs = outletPrefs(outlet.id);
                const shieldOpen = Boolean(shieldExpandedOutletIds[outlet.id]);
                return (
                  <div key={outlet.id} className={styles.syncOutletRow}>
                    <div className={styles.syncOutletRowHeader}>
                      <label className={styles.syncOutletLabel}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSyncOutlet(outlet.id)}
                        />
                        <span>
                          <strong>{outlet.name}</strong>
                          {outlet.code ? <span className={styles.syncOutletCode}> · {outlet.code}</span> : null}
                        </span>
                      </label>
                      {selected ? (
                        <button
                          type="button"
                          className={styles.syncShieldButton}
                          onClick={() => toggleShieldPanel(outlet.id)}
                          aria-expanded={shieldOpen}
                          title="Outlet sync shield"
                        >
                          <span aria-hidden="true">🛡</span>
                          <span>Sync shield</span>
                        </button>
                      ) : null}
                    </div>

                    {selected && shieldOpen ? (
                      <div className={styles.syncShieldPanel}>
                        <p className={styles.syncShieldIntro}>
                          Choose what this outlet should push from MintPOS to Supabase.
                        </p>
                        <div className={styles.syncShieldToggles}>
                          <label className={styles.syncShieldToggle}>
                            <input
                              type="checkbox"
                              checked={prefs.sync_products}
                              onChange={(event) =>
                                updateCatalogSyncPrefs(outlet.id, { sync_products: event.target.checked })
                              }
                            />
                            Products
                          </label>
                          <label className={styles.syncShieldToggle}>
                            <input
                              type="checkbox"
                              checked={prefs.sync_variants}
                              onChange={(event) =>
                                updateCatalogSyncPrefs(outlet.id, { sync_variants: event.target.checked })
                              }
                            />
                            Variants
                          </label>
                          <label className={styles.syncShieldToggle}>
                            <input
                              type="checkbox"
                              checked={prefs.sync_menu_groups}
                              onChange={(event) =>
                                updateCatalogSyncPrefs(outlet.id, { sync_menu_groups: event.target.checked })
                              }
                            />
                            Menu groups
                          </label>
                        </div>
                        <div className={styles.syncShieldFields}>
                          <label className={styles.syncShieldField}>
                            <span>Exclude product SKUs</span>
                            <textarea
                              rows={2}
                              value={prefs.exclude_item_skus}
                              placeholder="Comma or line separated item SKUs to skip"
                              onChange={(event) =>
                                updateCatalogSyncPrefs(outlet.id, { exclude_item_skus: event.target.value })
                              }
                            />
                          </label>
                          <label className={styles.syncShieldField}>
                            <span>Exclude variant SKUs</span>
                            <textarea
                              rows={2}
                              value={prefs.exclude_variant_skus}
                              placeholder="Comma or line separated variant SKUs to skip"
                              onChange={(event) =>
                                updateCatalogSyncPrefs(outlet.id, { exclude_variant_skus: event.target.value })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {syncError ? (
          <div className={styles.alertBanner} style={{ marginTop: 12 }}>
            <strong>Sync failed:</strong> {syncError}
          </div>
        ) : null}
        {syncResult ? (
          <div className={styles.pageCardBody} style={{ marginTop: 12 }}>
            <strong>Request sent.</strong> Middleware sync events queued for {syncResult.requested} outlet
            {syncResult.requested === 1 ? "" : "s"}.
          </div>
        ) : null}
        {cancelOfflineResult ? (
          <div className={styles.pageCardBody} style={{ marginTop: 12 }}>
            <strong>Offline queue cleared.</strong> Removed {cancelOfflineResult.removed} pending event
            {cancelOfflineResult.removed === 1 ? "" : "s"}
            {cancelOfflineResult.offline_outlets.length > 0
              ? ` for ${cancelOfflineResult.offline_outlets.map((row) => row.outlet_name).join(", ")}.`
              : "."}
          </div>
        ) : null}
      </section>

      <OutletLiveBalancesPanel />
    </div>
  );
}
