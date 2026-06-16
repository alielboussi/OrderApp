"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWarehouseAuth } from "../useWarehouseAuth";
import type { Warehouse } from "@/types/warehouse";
import type { WarehousePurchase } from "@/types/purchases";
import styles from "../enterprise.module.css";

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
  product_name: string | null;
  item_name: string | null;
  item_sku: string | null;
  variant_sku: string | null;
  sku: string | null;
  qty: number | null;
  unit_cost: number | null;
  movement_at: string | null;
  invoice_id: string | null;
  operator_name: string | null;
  status: ApiImportStatus;
  status_message?: string | null;
};

type ApiImportSummary = {
  total: number;
  imported: number;
  ready: number;
};

type ApiImportResponse = {
  ok: boolean;
  summary: ApiImportSummary;
  items: ApiImportRow[];
  error?: string | null;
};

const SYNC_INTERVAL_MS = 300_000;
const ALLOWED_WAREHOUSE_IDS = [
  "f71a25d0-9ec2-454d-a606-93cfaa3c606b",
  "0c9ddd9e-d42c-475f-9232-5e9d649b0916",
];

const STATUS_LABELS: Record<ApiImportStatus, string> = {
  ready: "Ready",
  imported: "Imported",
  duplicate: "Duplicate",
  duplicate_receipt: "Dup receipt",
  missing_item: "No match",
  missing_storage_home: "No storage",
  missing_open_period: "No period",
  missing_opening_stock: "No opening",
  invalid_qty: "Bad qty",
  error: "Error",
};

function formatStamp(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function normalizeList<T>(value: unknown, keys: string[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const nested = record[key];
      if (Array.isArray(nested)) return nested as T[];
    }
  }
  return [];
}

function matchesTimeFilter(iso: string | null | undefined, timeFrom: string, timeTo: string) {
  if (!iso || (!timeFrom && !timeTo)) return true;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (timeFrom && hhmm < timeFrom) return false;
  if (timeTo && hhmm > timeTo) return false;
  return true;
}

export default function WarehousePurchasesPage() {
  const { status } = useWarehouseAuth();
  const syncInFlight = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [importRows, setImportRows] = useState<ApiImportRow[]>([]);
  const [importSummary, setImportSummary] = useState<ApiImportSummary | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [nextSyncAt, setNextSyncAt] = useState<string | null>(null);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [purchases, setPurchases] = useState<WarehousePurchase[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [warehouseId, setWarehouseId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const runImportSync = useCallback(async () => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setImportLoading(true);
    setImportError(null);
    try {
      const response = await fetch("/api/warehouse-purchase-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false, mode: "auto" }),
      });
      const payload = (await response.json()) as ApiImportResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ? String(payload.error) : "Import failed");
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
    void runImportSync();
    syncTimer.current = setInterval(() => void runImportSync(), SYNC_INTERVAL_MS);
    setNextSyncAt(new Date(Date.now() + SYNC_INTERVAL_MS).toISOString());
    return () => {
      if (syncTimer.current) clearInterval(syncTimer.current);
    };
  }, [status, runImportSync]);

  useEffect(() => {
    if (status !== "ok") return;
    fetch("/api/warehouses")
      .then((r) => r.json())
      .then((data) => {
        const list = normalizeList<Warehouse>(data, ["warehouses", "data"]);
        setWarehouses(list.filter((w) => ALLOWED_WAREHOUSE_IDS.includes(w.id)));
      })
      .catch(() => setWarehouses([]));
  }, [status]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams();
      if (warehouseId) params.set("warehouseId", warehouseId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/warehouse-purchases?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPurchases(normalizeList<WarehousePurchase>(data, ["purchases", "data"]));
    } catch (err) {
      setHistoryError(toErrorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }, [warehouseId, startDate, endDate]);

  useEffect(() => {
    if (status !== "ok") return;
    void loadHistory();
  }, [status, loadHistory, lastSyncAt]);

  const filteredHistory = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return [...purchases]
      .filter((p) => matchesTimeFilter(p.recorded_at, timeFrom, timeTo))
      .filter((p) => {
        if (!q) return true;
        const haystack = [
          p.warehouse?.name,
          p.supplier?.name,
          p.reference_code,
          p.operator_name,
          ...(p.items ?? []).flatMap((i) => [i.item?.name, i.variant?.name, i.item_id]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const at = a.recorded_at ? new Date(a.recorded_at).getTime() : 0;
        const bt = b.recorded_at ? new Date(b.recorded_at).getTime() : 0;
        return bt - at;
      });
  }, [purchases, productSearch, timeFrom, timeTo]);

  if (status !== "ok") return null;

  return (
    <div>
      {importError && (
        <div className={`${styles.alertBanner} ${styles.alertRed}`}>
          <span>API import error: {importError}</span>
        </div>
      )}

      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderGreen}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            API intake — auto sync every 5 minutes
          </h3>
          <p className={styles.pageCardBody}>
            Pulls purchase receipts from the Afterten Stock API and posts to warehouse storage homes.
          </p>
        </div>
        <div className={styles.summaryGrid}>
          <div className={`${styles.summaryCard} ${styles.summaryCardBlue}`}>
            <p className={styles.summaryLabel}>Status</p>
            <p className={styles.summaryValue} style={{ fontSize: 14 }}>
              {importLoading ? (
                <span className={styles.pillSyncing}>Syncing…</span>
              ) : (
                <span className={styles.pillLive}>Live</span>
              )}
            </p>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryCardGreen}`}>
            <p className={styles.summaryLabel}>Last sync</p>
            <p className={styles.summaryValue} style={{ fontSize: 13 }}>
              {formatStamp(lastSyncAt)}
            </p>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryCardGold}`}>
            <p className={styles.summaryLabel}>Next sync</p>
            <p className={styles.summaryValue} style={{ fontSize: 13 }}>
              {formatStamp(nextSyncAt)}
            </p>
          </div>
          {importSummary && (
            <>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Batch total</p>
                <p className={styles.summaryValue}>{formatNumber(importSummary.total)}</p>
              </div>
              <div className={`${styles.summaryCard} ${styles.summaryCardGreen}`}>
                <p className={styles.summaryLabel}>Imported</p>
                <p className={styles.summaryValue}>{formatNumber(importSummary.imported)}</p>
              </div>
            </>
          )}
        </div>
      </section>

      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderBlue}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Purchase history (received in warehouse)
          </h3>
        </div>
        <div className={styles.filterBar}>
          <label className={styles.fieldLabel}>
            Warehouse
            <select className={styles.fieldSelect} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.fieldLabel}>
            From date
            <input className={styles.fieldInput} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            To date
            <input className={styles.fieldInput} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            From time
            <input className={styles.fieldInput} type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            To time
            <input className={styles.fieldInput} type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            Product search
            <input
              className={styles.fieldInput}
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Item, variant, supplier…"
            />
          </label>
          <button type="button" className={styles.btnSecondary} onClick={() => void loadHistory()} disabled={historyLoading}>
            {historyLoading ? "Loading…" : "Refresh history"}
          </button>
        </div>
        {historyError && <p style={{ color: "#b91c1c", margin: "0 0 12px" }}>{historyError}</p>}
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Received</th>
                <th>Warehouse</th>
                <th>Supplier</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Operator</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading && filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7}>Loading purchase history…</td>
                </tr>
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7}>No purchases match the current filters.</td>
                </tr>
              ) : (
                filteredHistory.flatMap((p) =>
                  (p.items?.length ? p.items : [{ id: p.id, qty: 0, item: null, variant: null }]).map((item, idx) => (
                    <tr key={`${p.id}-${item.id}-${idx}`}>
                      <td>{formatStamp(p.recorded_at)}</td>
                      <td>{p.warehouse?.name ?? "—"}</td>
                      <td>{p.supplier?.name ?? "—"}</td>
                      <td>
                        {item.item?.name ?? "—"}
                        {item.variant?.name ? ` · ${item.variant.name}` : ""}
                      </td>
                      <td>{formatNumber(item.qty)}</td>
                      <td>{p.operator_name ?? "—"}</td>
                      <td>{p.reference_code ?? "—"}</td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderGold}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Latest API movements (current batch)
          </h3>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Received</th>
                <th>SKU</th>
                <th>Invoice</th>
              </tr>
            </thead>
            <tbody>
              {importRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>No movements in the latest sync batch.</td>
                </tr>
              ) : (
                importRows.map((row) => (
                  <tr key={row.movement_id}>
                    <td>{row.product_name ?? row.item_name ?? "—"}</td>
                    <td>{formatNumber(row.qty)}</td>
                    <td>
                      <span
                        className={
                          row.status === "imported"
                            ? styles.pillLive
                            : row.status === "ready"
                              ? styles.pillSyncing
                              : styles.pillOffline
                        }
                      >
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td>{formatStamp(row.movement_at)}</td>
                    <td>{row.item_sku ?? row.variant_sku ?? row.sku ?? "—"}</td>
                    <td>{row.invoice_id ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
