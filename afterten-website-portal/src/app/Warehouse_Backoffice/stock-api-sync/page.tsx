"use client";

import { useCallback, useEffect, useState } from "react";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "../enterprise.module.css";

type SyncSummary = {
  api_products: number;
  created_items: number;
  updated_items: number;
  updated_variants: number;
  warehouses_upserted: number;
  deactivated_items: number;
  deactivated_variants: number;
  deleted_items: number;
  deleted_variants: number;
  deleted_related_docs: number;
  skipped_invalid_uuid: number;
  skipped_portal_only: number;
  outlet_catalog_refreshed: number;
};

type SyncReport = {
  ok: boolean;
  generated_at: string;
  catalog_generated_at: string | null;
  summary: SyncSummary;
};

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function StockApiSyncPage() {
  const { status, readOnly } = useWarehouseAuth();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [scheduledEnabled, setScheduledEnabled] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/catalog/stock-api-sync");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load sync status");
      setScheduledEnabled(Boolean(json.enabled));
      setReport((json.report ?? null) as SyncReport | null);
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to load sync status",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "ok") return;
    void loadStatus();
  }, [status, loadStatus]);

  const runSync = async () => {
    if (readOnly) {
      setMessage({ ok: false, text: "Read-only access: sync is disabled." });
      return;
    }

    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/catalog/stock-api-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Stock catalog sync failed");

      setScheduledEnabled(Boolean(json.enabled));
      setReport((json.report ?? null) as SyncReport | null);
      const summary = (json.report as SyncReport | undefined)?.summary;
      setMessage({
        ok: true,
        text: summary
          ? `Sync complete — ${summary.updated_items} items updated, ${summary.created_items} created, ${summary.updated_variants} variants updated.`
          : "Sync complete.",
      });
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Stock catalog sync failed",
      });
    } finally {
      setSyncing(false);
    }
  };

  if (status !== "ok") {
    return null;
  }

  const summary = report?.summary;

  return (
    <section className={styles.pageCard}>
      <div className={styles.sectionHeaderBlue}>
        <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
          Stock API catalog sync
        </h3>
        <p className={styles.pageCardBody}>
          Pull products from the Afterten Stock API into the portal catalog. Run this only when products
          change in stock control — automatic background sync is turned off to keep cloud costs low.
        </p>
      </div>

      {loading ? (
        <p className={styles.pageCardBody}>Loading sync status…</p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <p className={styles.pageCardBody} style={{ margin: 0 }}>
            Automatic Firebase scheduler:{" "}
            <strong style={{ color: scheduledEnabled ? "#c41e3a" : "#1a7f37" }}>
              {scheduledEnabled ? "ENABLED — disable in Cloud Scheduler to save costs" : "Off (manual only)"}
            </strong>
          </p>

          {!scheduledEnabled ? (
            <p className={styles.pageCardBody} style={{ margin: 0, color: "#c41e3a", fontWeight: 700 }}>
              Manual sync is locked in code (billing safety). Unlock only for a one-off sync, then lock again.
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={styles.btnAdd}
              onClick={() => void runSync()}
              disabled={syncing || readOnly || !scheduledEnabled}
            >
              {syncing ? "Syncing from Stock API…" : "Sync catalog now"}
            </button>
            <button
              type="button"
              className={styles.btnDeduct}
              onClick={() => void loadStatus()}
              disabled={syncing || loading}
            >
              Refresh status
            </button>
          </div>

          {report ? (
            <div className={styles.pageCardBody} style={{ margin: 0 }}>
              <p style={{ margin: "0 0 8px" }}>
                Last sync: <strong>{formatStamp(report.generated_at)}</strong>
              </p>
              {report.catalog_generated_at ? (
                <p style={{ margin: "0 0 8px" }}>
                  Stock API catalog timestamp: <strong>{formatStamp(report.catalog_generated_at)}</strong>
                </p>
              ) : null}
              {summary ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>API products: {summary.api_products}</li>
                  <li>Created items: {summary.created_items}</li>
                  <li>Updated items: {summary.updated_items}</li>
                  <li>Updated variants: {summary.updated_variants}</li>
                  <li>Outlet catalogs refreshed: {summary.outlet_catalog_refreshed}</li>
                  <li>Skipped (portal-only): {summary.skipped_portal_only}</li>
                </ul>
              ) : null}
            </div>
          ) : (
            <p className={styles.pageCardBody} style={{ margin: 0 }}>
              No sync has been recorded yet. Click <strong>Sync catalog now</strong> when you need to pull
              changes from stock control.
            </p>
          )}

          {message ? (
            <p
              className={styles.pageCardBody}
              style={{ margin: 0, color: message.ok ? "#1a7f37" : "#c41e3a" }}
            >
              {message.text}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
