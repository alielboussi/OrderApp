"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWarehouseAuth } from "../useWarehouseAuth";
import type { StockMovementRow } from "@/lib/afterten-stock-api";
import styles from "../enterprise.module.css";

const STOCK_API_SOURCE =
  "https://afterten-stock-api-896827614552.us-central1.run.app/stock/movements?type=receive";

type PurchasesApiResponse = {
  source?: string;
  source_url?: string;
  purchases?: StockMovementRow[];
  total?: number;
  error?: string;
};

function formatStamp(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export default function WarehousePurchasesPage() {
  const { status } = useWarehouseAuth();

  const [purchases, setPurchases] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const [warehouseName, setWarehouseName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const loadPurchases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (warehouseName) params.set("warehouseName", warehouseName);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (timeFrom) params.set("timeFrom", timeFrom);
      if (timeTo) params.set("timeTo", timeTo);

      const res = await fetch(`/api/warehouse-purchases?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json()) as PurchasesApiResponse;
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to load purchases");
      }
      setPurchases(data.purchases ?? []);
      setLastLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(toErrorMessage(err));
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseName, startDate, endDate, timeFrom, timeTo]);

  useEffect(() => {
    if (status !== "ok") return;
    void loadPurchases();
  }, [status, loadPurchases]);

  const warehouseOptions = useMemo(() => {
    const names = new Set<string>();
    purchases.forEach((row) => {
      if (row.warehouse_name) names.add(row.warehouse_name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [purchases]);

  const filteredPurchases = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((row) => {
      const haystack = [
        row.product_name,
        row.warehouse_name,
        row.supplier_name,
        row.operator_name,
        row.invoice_id,
        row.sku,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [purchases, productSearch]);

  if (status !== "ok") return null;

  return (
    <div>
      {error && (
        <div className={`${styles.alertBanner} ${styles.alertRed}`}>
          <span>Unable to load purchases: {error}</span>
        </div>
      )}

      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderGreen}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Purchase receipts (Afterten Stock API)
          </h3>
          <p className={styles.pageCardBody}>
            Loaded from{" "}
            <a href={STOCK_API_SOURCE} target="_blank" rel="noreferrer">
              {STOCK_API_SOURCE}
            </a>
            . Only receive movements from this API are shown.
          </p>
        </div>
        <div className={styles.summaryGrid}>
          <div className={`${styles.summaryCard} ${styles.summaryCardBlue}`}>
            <p className={styles.summaryLabel}>Status</p>
            <p className={styles.summaryValue} style={{ fontSize: 14 }}>
              {loading ? (
                <span className={styles.pillSyncing}>Loading…</span>
              ) : (
                <span className={styles.pillLive}>Live</span>
              )}
            </p>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryCardGreen}`}>
            <p className={styles.summaryLabel}>Last loaded</p>
            <p className={styles.summaryValue} style={{ fontSize: 13 }}>
              {formatStamp(lastLoadedAt)}
            </p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Rows</p>
            <p className={styles.summaryValue}>{formatNumber(filteredPurchases.length)}</p>
          </div>
        </div>
      </section>

      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderBlue}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Purchases
          </h3>
        </div>
        <div className={styles.filterBar}>
          <label className={styles.fieldLabel}>
            Warehouse
            <select
              className={styles.fieldSelect}
              value={warehouseName}
              onChange={(e) => setWarehouseName(e.target.value)}
            >
              <option value="">All warehouses</option>
              {warehouseOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.fieldLabel}>
            From date
            <input
              className={styles.fieldInput}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className={styles.fieldLabel}>
            To date
            <input
              className={styles.fieldInput}
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label className={styles.fieldLabel}>
            From time
            <input
              className={styles.fieldInput}
              type="time"
              value={timeFrom}
              onChange={(e) => setTimeFrom(e.target.value)}
            />
          </label>
          <label className={styles.fieldLabel}>
            To time
            <input
              className={styles.fieldInput}
              type="time"
              value={timeTo}
              onChange={(e) => setTimeTo(e.target.value)}
            />
          </label>
          <label className={styles.fieldLabel}>
            Product search
            <input
              className={styles.fieldInput}
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Product, supplier, invoice, SKU…"
            />
          </label>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => void loadPurchases()}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Received</th>
                <th>Warehouse</th>
                <th>Supplier</th>
                <th>Product</th>
                <th>SKU</th>
                <th>Qty</th>
                <th>Unit cost</th>
                <th>Total</th>
                <th>Operator</th>
                <th>Invoice</th>
              </tr>
            </thead>
            <tbody>
              {loading && filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={10}>Loading purchases from API…</td>
                </tr>
              ) : filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={10}>No purchases match the current filters.</td>
                </tr>
              ) : (
                filteredPurchases.map((row) => (
                  <tr key={row.movement_id}>
                    <td>{formatStamp(row.movement_at)}</td>
                    <td>{row.warehouse_name ?? "—"}</td>
                    <td>{row.supplier_name ?? "—"}</td>
                    <td>{row.product_name ?? "—"}</td>
                    <td>{row.sku ?? "—"}</td>
                    <td>{formatNumber(row.qty)}</td>
                    <td>{formatMoney(row.unit_cost)}</td>
                    <td>{formatMoney(row.total_cost)}</td>
                    <td>{row.operator_name ?? "—"}</td>
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
