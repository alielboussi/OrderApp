"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "./purchase-entry.module.css";

type ApiImportStatus =
  | "ready"
  | "imported"
  | "duplicate"
  | "duplicate_receipt"
  | "missing_item"
  | "missing_storage_home"
  | "missing_open_period"
  | "missing_opening_stock"
  | "invalid_qty"
  | "error";

type ApiImportRow = {
  movement_id: string;
  lot_id: string | null;
  product_id: string | null;
  product_name: string | null;
  item_sku: string | null;
  variant_sku: string | null;
  sku: string | null;
  qty: number | null;
  unit_cost: number | null;
  total_cost: number | null;
  movement_at: string | null;
  invoice_id: string | null;
  operator_name: string | null;
  api_warehouse_id: string | null;
  api_warehouse_name: string | null;
  item_id: string | null;
  item_name: string | null;
  variant_key: string | null;
  variant_name: string | null;
  storage_warehouse_id: string | null;
  storage_warehouse_name: string | null;
  receipt_reference: string | null;
  receipt_id: string | null;
  status: ApiImportStatus;
  status_message?: string | null;
};

type ApiImportSummary = {
  total: number;
  imported: number;
  ready: number;
  duplicates: number;
  missing_item: number;
  missing_storage_home: number;
  missing_open_period: number;
  missing_opening_stock: number;
  invalid_qty: number;
  errors: number;
};

type ApiImportResponse = {
  ok: boolean;
  summary: ApiImportSummary;
  items: ApiImportRow[];
};

const SYNC_INTERVAL_MS = 300_000;


function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

const IMPORT_STATUS_LABELS: Record<ApiImportStatus, string> = {
  ready: "Ready to import",
  imported: "Imported",
  duplicate: "Already imported",
  duplicate_receipt: "Receipt already exists",
  missing_item: "No catalog match",
  missing_storage_home: "No storage home",
  missing_open_period: "No open stock period",
  missing_opening_stock: "Opening stock missing",
  invalid_qty: "Invalid qty",
  error: "Import error",
};

const IMPORT_STATUS_TONE: Record<ApiImportStatus, string> = {
  ready: "statusReady",
  imported: "statusSuccess",
  duplicate: "statusMuted",
  duplicate_receipt: "statusMuted",
  missing_item: "statusWarn",
  missing_storage_home: "statusWarn",
  missing_open_period: "statusWarn",
  missing_opening_stock: "statusWarn",
  invalid_qty: "statusWarn",
  error: "statusError",
};

function formatStamp(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return value.toLocaleString();
}

export default function WarehousePurchaseEntryPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const syncInFlight = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [importRows, setImportRows] = useState<ApiImportRow[]>([]);
  const [importSummary, setImportSummary] = useState<ApiImportSummary | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [nextSyncAt, setNextSyncAt] = useState<string | null>(null);
  const [importSearch, setImportSearch] = useState("");
  const [importStatusFilter, setImportStatusFilter] = useState<"all" | ApiImportStatus>("all");

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  const runImportSync = useCallback(async (mode: "auto" | "manual") => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setImportLoading(true);
    setImportError(null);

    try {
      const response = await fetch("/api/warehouse-purchase-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false, mode }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
      const payload = (await response.json()) as ApiImportResponse;
      if (!payload.ok) {
        throw new Error("Import failed");
      }
      setImportRows(payload.items ?? []);
      setImportSummary(payload.summary ?? null);
      setLastSyncAt(new Date().toISOString());
    } catch (err) {
      setImportError(toErrorMessage(err));
    } finally {
      syncInFlight.current = false;
      setImportLoading(false);
      setNextSyncAt(new Date(Date.now() + SYNC_INTERVAL_MS).toISOString());
    }
  }, []);

  useEffect(() => {
    if (status !== "ok") return;

    void runImportSync("auto");
    if (syncTimer.current) {
      window.clearInterval(syncTimer.current);
    }
    syncTimer.current = window.setInterval(() => {
      void runImportSync("auto");
    }, SYNC_INTERVAL_MS);
    setNextSyncAt(new Date(Date.now() + SYNC_INTERVAL_MS).toISOString());

    return () => {
      if (syncTimer.current) {
        window.clearInterval(syncTimer.current);
      }
      syncTimer.current = null;
    };
  }, [status, runImportSync]);

  const filteredImportRows = useMemo(() => {
    const term = importSearch.trim().toLowerCase();
    return importRows.filter((row) => {
      if (importStatusFilter !== "all" && row.status !== importStatusFilter) return false;
      if (!term) return true;
      const haystack = [
        row.product_name,
        row.sku,
        row.product_id,
        row.item_name,
        row.item_sku,
        row.invoice_id,
        row.movement_id,
        row.variant_sku,
        row.api_warehouse_name,
        row.storage_warehouse_name,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [importRows, importSearch, importStatusFilter]);

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Purchase Entry</h1>
            <p className={styles.subtitle}>Record beverages storeroom purchase receipts.</p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={handleBackOne} className={styles.backButton}>
              Back
            </button>
            <button onClick={handleBack} className={styles.backButton}>
              Back to Dashboard
            </button>
          </div>
        </header>

        {importError && <p className={styles.errorBanner}>API import: {importError}</p>}

        <section className={styles.syncGrid}>
          <div className={styles.syncCard}>
            <div className={styles.panelHeaderRow}>
              <h2 className={styles.panelTitle}>API intake</h2>
              <span className={styles.syncPill}>{importLoading ? "Syncing" : "Live"}</span>
            </div>
            <p className={styles.syncHint}>
              Pulling purchase receipts from Afterten Stock API every 5 minutes. Movements post to the product storage home.
            </p>
            <div className={styles.syncMetaGrid}>
              <div>
                <p className={styles.syncMetaLabel}>Last sync</p>
                <p className={styles.syncMetaValue}>{formatStamp(lastSyncAt)}</p>
              </div>
              <div>
                <p className={styles.syncMetaLabel}>Next sync</p>
                <p className={styles.syncMetaValue}>{formatStamp(nextSyncAt)}</p>
              </div>
            </div>
            <div className={styles.syncActions}>
              <button type="button" className={styles.primaryButton} onClick={() => runImportSync("manual")} disabled={importLoading}>
                {importLoading ? "Syncing..." : "Sync now"}
              </button>
              <button type="button" className={styles.outlineButton} onClick={() => setImportStatusFilter("ready")}>
                Show ready
              </button>
            </div>
          </div>

          <div className={styles.syncCard}>
            <h2 className={styles.panelTitle}>Import rules</h2>
            <ul className={styles.ruleList}>
              <li>Match by productId to variants first, then base items. SKU fallback supported when provided.</li>
              <li>Receipt posts to the storage home (default warehouse or item storage homes).</li>
              <li>Opening stock must exist in the latest open period before a line can import.</li>
              <li>Duplicate prevention uses source movement IDs and receipt reference per warehouse.</li>
            </ul>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeaderRow}>
            <h2 className={styles.panelTitle}>Incoming movements</h2>
            <div className={styles.filterRow}>
              <input
                className={styles.input}
                value={importSearch}
                onChange={(event) => setImportSearch(event.target.value)}
                placeholder="Search product, invoice, SKU"
              />
              <select
                className={styles.select}
                value={importStatusFilter}
                onChange={(event) => setImportStatusFilter(event.target.value as "all" | ApiImportStatus)}
                aria-label="Import status filter"
              >
                <option value="all">All statuses</option>
                {Object.entries(IMPORT_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {importSummary && (
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Total</p>
                <p className={styles.summaryValue}>{formatNumber(importSummary.total)}</p>
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Imported</p>
                <p className={styles.summaryValue}>{formatNumber(importSummary.imported)}</p>
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Ready</p>
                <p className={styles.summaryValue}>{formatNumber(importSummary.ready)}</p>
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Blocked</p>
                <p className={styles.summaryValue}>
                  {formatNumber(
                    importSummary.missing_item +
                      importSummary.missing_storage_home +
                      importSummary.missing_open_period +
                      importSummary.missing_opening_stock +
                      importSummary.invalid_qty
                  )}
                </p>
              </div>
            </div>
          )}

          {filteredImportRows.length === 0 ? (
            <p className={styles.helperText}>No movements found for the current filters.</p>
          ) : (
            <div className={styles.importList}>
              {filteredImportRows.map((row) => (
                <div key={row.movement_id} className={styles.importRow}>
                  <div className={styles.importMain}>
                    <div>
                      <p className={styles.cartTitle}>{row.product_name ?? row.item_name ?? row.product_id ?? "Unknown product"}</p>
                      <p className={styles.cartMeta}>
                        Movement {row.movement_id} • Invoice {row.invoice_id ?? "--"} • Qty {formatNumber(row.qty)}
                      </p>
                      <p className={styles.cartMeta}>
                        Storage home: {row.storage_warehouse_name ?? row.storage_warehouse_id ?? "--"}
                      </p>
                      {row.status_message && <p className={styles.cartMeta}>{row.status_message}</p>}
                    </div>
                    <div className={styles.importSide}>
                      <span className={`${styles.statusBadge} ${styles[IMPORT_STATUS_TONE[row.status]]}`}>
                        {IMPORT_STATUS_LABELS[row.status]}
                      </span>
                      <p className={styles.cartMeta}>Received {formatStamp(row.movement_at)}</p>
                      <p className={styles.cartMeta}>Unit cost {formatNumber(row.unit_cost)}</p>
                    </div>
                  </div>
                  <div className={styles.importFooter}>
                    <span>API warehouse: {row.api_warehouse_name ?? row.api_warehouse_id ?? "--"}</span>
                    <span>Operator: {row.operator_name ?? "--"}</span>
                    <span>Variant: {row.variant_name ?? row.variant_key ?? "Base"}</span>
                    <span>Variant SKU: {row.variant_sku ?? "--"}</span>
                    <span>Item SKU: {row.item_sku ?? "--"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

button {
  background: none;
  border: none;
}

button:hover {
  transform: translateY(-2px);
}
`;
