"use client";

import { useEffect, useMemo, useState } from "react";
import { isMiddlewareCatalogSyncOutlet } from "@/lib/outletScope";
import { formatStamp } from "./middlewareMonitorShared";
import styles from "./enterprise.module.css";

const PREFS_STORAGE_KEY = "warehouse-pos-catalog-sync-prefs";

type OutletRow = {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean | null;
  has_pos_middleware?: boolean | null;
  channel?: string | null;
};

type CatalogSyncPrefs = {
  sync_products: boolean;
  sync_variants: boolean;
  sync_menu_groups: boolean;
  exclude_item_skus: string;
  exclude_variant_skus: string;
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

function toUtcIso(localDateTime: string): string | null {
  if (!localDateTime) return null;
  const parsed = new Date(localDateTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export default function PosCatalogSyncPanel() {
  const [allOutlets, setAllOutlets] = useState<OutletRow[]>([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    requested: number;
    scheduled_at?: string | null;
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [cancelOfflineBusy, setCancelOfflineBusy] = useState(false);
  const [cancelOfflineResult, setCancelOfflineResult] = useState<{
    removed: number;
    offline_outlets: Array<{ outlet_id: string; outlet_name: string }>;
  } | null>(null);
  const [selectedSyncOutletIds, setSelectedSyncOutletIds] = useState<string[]>([]);
  const [catalogSyncPrefs, setCatalogSyncPrefs] = useState<Record<string, CatalogSyncPrefs>>({});
  const [shieldExpandedOutletIds, setShieldExpandedOutletIds] = useState<Record<string, boolean>>({});
  const [syncDialogStep, setSyncDialogStep] = useState<"closed" | "choose" | "schedule">("closed");
  const [syncScheduleLocal, setSyncScheduleLocal] = useState("");

  useEffect(() => {
    setCatalogSyncPrefs(loadStoredCatalogSyncPrefs());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(catalogSyncPrefs));
  }, [catalogSyncPrefs]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch("/api/outlets?scope=middleware", { cache: "no-store" });
        if (!res.ok) throw new Error("Unable to load outlets");
        const json = await res.json();
        if (!active) return;
        setAllOutlets((json.outlets as OutletRow[]) ?? []);
      } catch {
        if (active) setAllOutlets([]);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const middlewareOutlets = useMemo(
    () =>
      allOutlets
        .filter(isMiddlewareCatalogSyncOutlet)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })),
    [allOutlets],
  );

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

  const openSyncDialog = () => {
    if (selectedSyncOutletIds.length === 0) {
      setSyncError("Select at least one outlet to sync.");
      return;
    }
    setSyncError(null);
    setSyncResult(null);
    setSyncScheduleLocal("");
    setSyncDialogStep("choose");
  };

  const runPosCatalogSync = async (scheduledAt: string | null = null) => {
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
          scheduled_at: scheduledAt,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to request POS catalog sync");
      }
      setSyncResult(json);
      setSyncDialogStep("closed");
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

  return (
    <div>
      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderBlue}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Portal/Mintpos Sync
          </h3>
          <p className={styles.pageCardBody} style={{ marginTop: 8 }}>
            Pull MintPOS catalog from selected outlets into Supabase — products, variants, and menu groups.
          </p>
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={openSyncDialog}
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
            <strong>{syncResult.scheduled_at ? "Sync scheduled." : "Request sent."}</strong>{" "}
            {syncResult.scheduled_at
              ? `POS catalog sync queued for ${syncResult.requested} outlet${syncResult.requested === 1 ? "" : "s"} at ${formatStamp(syncResult.scheduled_at)}.`
              : `Middleware sync events queued for ${syncResult.requested} outlet${syncResult.requested === 1 ? "" : "s"}.`}
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

      {syncDialogStep !== "closed" ? (
        <div className={styles.syncDialogOverlay} role="dialog" aria-modal="true">
          <div className={styles.syncDialogCard}>
            {syncDialogStep === "choose" ? (
              <>
                <h3 className={styles.syncDialogTitle}>POS catalog sync</h3>
                <p className={styles.pageCardBody} style={{ margin: 0 }}>
                  Sync now for {selectedSyncOutletIds.length} selected outlet
                  {selectedSyncOutletIds.length === 1 ? "" : "s"}, or schedule for later.
                </p>
                <div className={styles.syncDialogActions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => runPosCatalogSync(null)}
                    disabled={syncBusy}
                  >
                    Sync now
                  </button>
                  <button
                    type="button"
                    className={styles.btnGold}
                    onClick={() => setSyncDialogStep("schedule")}
                    disabled={syncBusy}
                  >
                    Schedule
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setSyncDialogStep("closed")}
                    disabled={syncBusy}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className={styles.syncDialogTitle}>Schedule POS catalog sync</h3>
                <label className={styles.pageCardBody} style={{ margin: 0, display: "block" }}>
                  Release time (local)
                  <input
                    className={styles.fieldInput}
                    type="datetime-local"
                    value={syncScheduleLocal}
                    onChange={(event) => setSyncScheduleLocal(event.target.value)}
                    style={{ display: "block", marginTop: 8, width: "100%" }}
                  />
                </label>
                <div className={styles.syncDialogActions}>
                  <button
                    type="button"
                    className={styles.btnGold}
                    onClick={() => {
                      const scheduledAt = toUtcIso(syncScheduleLocal);
                      if (!scheduledAt) {
                        setSyncError("Select a valid future date and time.");
                        return;
                      }
                      void runPosCatalogSync(scheduledAt);
                    }}
                    disabled={syncBusy || !syncScheduleLocal}
                  >
                    Schedule sync
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setSyncDialogStep("choose")}
                    disabled={syncBusy}
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
