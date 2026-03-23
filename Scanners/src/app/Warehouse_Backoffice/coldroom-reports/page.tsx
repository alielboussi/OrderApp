"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import styles from "../reports/reports.module.css";
import { buildColdroomReportPdfHtml } from "./coldroom-report-pdf";
import { COLDROOM_CHILDREN, COLDROOM_CHILD_IDS, COLDROOM_PARENT_ID, COLDROOM_WAREHOUSES } from "@/lib/coldrooms";

type WarehouseOption = {
  id: string;
  name: string | null;
  code: string | null;
};

type WarehouseItem = {
  warehouse_id: string;
  item_id: string;
  item_name: string | null;
  variant_key: string | null;
  unit_cost: number | null;
  item_kind: string | null;
};

type LedgerRow = {
  warehouse_id: string | null;
  item_id: string | null;
  variant_key: string | null;
  delta_units: number | null;
};

type ReportRow = {
  item_id: string;
  item_name: string;
  variant_key: string;
  item_kind: string;
  total_units: number;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function toDateInputValue(date: Date): string {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

function normalizeVariantKey(value?: string | null): string {
  const raw = value?.trim().toLowerCase() ?? "";
  return raw.length ? raw : "base";
}

function makeKey(itemId: string, variantKey?: string | null): string {
  return `${itemId}|${normalizeVariantKey(variantKey)}`.toLowerCase();
}

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatVariantLabel(value: string): string {
  return value === "base" ? "Base" : value;
}

async function loadLogoDataUrl(): Promise<string | undefined> {
  try {
    const candidates = ["/afterten-logo.png", "/afterten_logo.png"];
    let blob: Blob | null = null;
    for (const path of candidates) {
      const response = await fetch(path, { cache: "force-cache" });
      if (response.ok) {
        blob = await response.blob();
        break;
      }
    }
    if (!blob) return undefined;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read logo"));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export default function ColdroomReportsPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);

  const today = useMemo(() => new Date(), []);
  const lastWeek = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }, []);

  const [warehouses] = useState<WarehouseOption[]>(
    COLDROOM_WAREHOUSES.map((warehouse) => ({ id: warehouse.id, name: warehouse.name, code: warehouse.code }))
  );
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(COLDROOM_PARENT_ID);
  const [startDate, setStartDate] = useState(toDateInputValue(lastWeek));
  const [endDate, setEndDate] = useState(toDateInputValue(today));
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [childTotals, setChildTotals] = useState<Array<{ label: string; total: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportAt, setReportAt] = useState<string | null>(null);
  const [hasAutoRun, setHasAutoRun] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  const selectedWarehouseLabel = useMemo(() => {
    const match = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId);
    return match?.name ?? match?.code ?? match?.id ?? "Select a warehouse";
  }, [warehouses, selectedWarehouseId]);

  const rangeLabel = useMemo(() => {
    if (!startDate && !endDate) return "All dates";
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    return `Through ${endDate}`;
  }, [startDate, endDate]);

  const totalUnits = useMemo(() => rows.reduce((sum, row) => sum + row.total_units, 0), [rows]);

  const runReport = useCallback(async () => {
    if (status !== "ok") return;
    if (!selectedWarehouseId) {
      setError("Select a warehouse before running the report.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const warehouseIds = selectedWarehouseId === COLDROOM_PARENT_ID ? COLDROOM_CHILD_IDS : [selectedWarehouseId];
      if (!warehouseIds.length) {
        setRows([]);
        return;
      }

      const searchTerm = search.trim().toLowerCase();
      const matchingItemIds = new Set<string>();
      const matchingVariantKeys = new Set<string>();

      if (searchTerm) {
        const [{ data: itemMatches, error: itemError }, { data: variantMatches, error: variantError }] = await Promise.all([
          supabase
            .from("catalog_items")
            .select("id,name,sku,supplier_sku")
            .or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%,supplier_sku.ilike.%${searchTerm}%`),
          supabase
            .from("catalog_variants")
            .select("id,item_id,name,sku,supplier_sku")
            .or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%,supplier_sku.ilike.%${searchTerm}%`),
        ]);

        if (!itemError) {
          (itemMatches ?? []).forEach((item) => {
            if (item?.id) matchingItemIds.add(item.id);
          });
        }

        if (!variantError) {
          (variantMatches ?? []).forEach((variant) => {
            if (variant?.id) matchingVariantKeys.add(normalizeVariantKey(variant.id));
            if (variant?.item_id) matchingItemIds.add(variant.item_id);
          });
        }
      }

      const itemResponses = await Promise.all(
        warehouseIds.map((warehouseId) =>
          supabase.rpc("list_warehouse_items", {
            p_warehouse_id: warehouseId,
            p_outlet_id: null,
            p_search: null,
          })
        )
      );

      const itemsByKey = new Map<string, WarehouseItem>();
      itemResponses.forEach((response) => {
        if (response.error) throw response.error;
        (response.data ?? []).forEach((item: WarehouseItem) => {
          if (!item?.item_id) return;
          const name = (item.item_name ?? "").toLowerCase();
          const variantKey = normalizeVariantKey(item.variant_key);
          const matchesSearch =
            !searchTerm ||
            name.includes(searchTerm) ||
            matchingItemIds.has(item.item_id) ||
            matchingVariantKeys.has(variantKey);
          if (!matchesSearch) return;
          const key = makeKey(item.item_id, item.variant_key);
          if (!itemsByKey.has(key)) itemsByKey.set(key, item);
        });
      });

      const itemIds = Array.from(new Set(Array.from(itemsByKey.values()).map((item) => item.item_id)));
      if (!itemIds.length) {
        setRows([]);
        setReportAt(new Date().toLocaleString());
        return;
      }

      let ledgerQuery = supabase
        .from("stock_ledger")
        .select("warehouse_id,item_id,variant_key,delta_units")
        .eq("location_type", "warehouse")
        .in("warehouse_id", warehouseIds)
        .in("item_id", itemIds);

      if (startDate) {
        const startIso = new Date(`${startDate}T00:00:00`).toISOString();
        ledgerQuery = ledgerQuery.gte("occurred_at", startIso);
      }

      if (endDate) {
        const end = new Date(`${endDate}T00:00:00`);
        end.setDate(end.getDate() + 1);
        ledgerQuery = ledgerQuery.lt("occurred_at", end.toISOString());
      }

      const { data: ledgerRows, error: ledgerError } = await ledgerQuery;
      if (ledgerError) throw ledgerError;

      const totals = new Map<string, number>();
      const childTotalsMap = new Map<string, number>();
      ((ledgerRows ?? []) as LedgerRow[]).forEach((row) => {
        if (!row?.item_id) return;
        const key = makeKey(row.item_id, row.variant_key);
        if (!itemsByKey.has(key)) return;
        const delta = Number(row.delta_units ?? 0);
        if (!Number.isFinite(delta)) return;
        totals.set(key, (totals.get(key) ?? 0) + delta);
        if (selectedWarehouseId === COLDROOM_PARENT_ID && row?.warehouse_id) {
          childTotalsMap.set(row.warehouse_id, (childTotalsMap.get(row.warehouse_id) ?? 0) + delta);
        }
      });

      const nextRows: ReportRow[] = Array.from(itemsByKey.values()).map((item) => {
        const key = makeKey(item.item_id, item.variant_key);
        return {
          item_id: item.item_id,
          item_name: item.item_name ?? "Item",
          variant_key: normalizeVariantKey(item.variant_key),
          item_kind: item.item_kind ?? "unknown",
          total_units: totals.get(key) ?? 0,
        };
      });

      nextRows.sort((a, b) => a.item_name.localeCompare(b.item_name) || a.variant_key.localeCompare(b.variant_key));

      setRows(nextRows);
      if (selectedWarehouseId === COLDROOM_PARENT_ID) {
        setChildTotals(
          COLDROOM_CHILDREN.map((child) => ({
            label: child.name,
            total: childTotalsMap.get(child.id) ?? 0,
          }))
        );
      } else {
        setChildTotals([]);
      }
      setReportAt(new Date().toLocaleString());
    } catch (err) {
      setError(toErrorMessage(err));
      setRows([]);
      setChildTotals([]);
    } finally {
      setLoading(false);
    }
  }, [status, supabase, selectedWarehouseId, startDate, endDate, search]);

  const downloadPdf = useCallback(async () => {
    if (loading || pdfBusy) return;
    setPdfBusy(true);
    try {
      const logoDataUrl = await loadLogoDataUrl();
      const periodText = rangeLabel;
      const totalsLabel = selectedWarehouseId === COLDROOM_PARENT_ID
        ? "Coldrooms total (all children)"
        : "Total";

      const html = buildColdroomReportPdfHtml({
        warehouseText: selectedWarehouseLabel,
        periodText,
        logoDataUrl,
        totalsLabel,
        childTotals: selectedWarehouseId === COLDROOM_PARENT_ID ? childTotals : [],
        rows: rows.map((row) => ({
          item_label: row.item_name,
          variant_label: formatVariantLabel(row.variant_key),
          item_kind: row.item_kind,
          accrued_units: row.total_units,
        })),
      });

      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.setAttribute("aria-hidden", "true");
      document.body.appendChild(frame);

      const doc = frame.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(frame);
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      const cleanup = () => {
        if (frame.parentNode) {
          frame.parentNode.removeChild(frame);
        }
      };

      setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(cleanup, 1000);
      }, 400);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setPdfBusy(false);
    }
  }, [loading, pdfBusy, rangeLabel, rows, selectedWarehouseId, selectedWarehouseLabel, childTotals]);

  useEffect(() => {
    if (status !== "ok" || !selectedWarehouseId || hasAutoRun) return;
    setHasAutoRun(true);
    void runReport();
  }, [status, selectedWarehouseId, hasAutoRun, runReport]);

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Coldroom Reports</h1>
            <p className={styles.subtitle}>
              Review accrued coldroom movement by date, product, and warehouse.
            </p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={handleBackOne} className={styles.backButton}>Back</button>
            <button onClick={handleBack} className={styles.backButton}>Back to Dashboard</button>
          </div>
        </header>

        {error && <p className={styles.error}>{error}</p>}

        <section className={styles.filtersGrid}>
          <div className={styles.filterCard}>
            <div className={styles.filterHeader}>
              <h2 className={styles.filterTitle}>Warehouse</h2>
            </div>
            <label className={styles.inputLabel}>
              Select warehouse
              <select
                className={styles.textInput}
                value={selectedWarehouseId}
                onChange={(event) => setSelectedWarehouseId(event.target.value)}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name ?? warehouse.code ?? warehouse.id}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.smallNote}>
              {selectedWarehouseId === COLDROOM_PARENT_ID
                ? `Aggregates ${COLDROOM_CHILD_IDS.length} coldrooms.`
                : "Coldroom children only."}
            </p>
          </div>

          <div className={styles.filterCard}>
            <div className={styles.filterHeader}>
              <h2 className={styles.filterTitle}>Date range</h2>
            </div>
            <label className={styles.inputLabel}>
              Start date
              <input
                type="date"
                className={styles.textInput}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className={styles.inputLabel}>
              End date
              <input
                type="date"
                className={styles.textInput}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <p className={styles.smallNote}>Totals include movement on every day in the range.</p>
          </div>

          <div className={styles.filterCard}>
            <div className={styles.filterHeader}>
              <h2 className={styles.filterTitle}>Search</h2>
            </div>
            <label className={styles.inputLabel}>
              Product name or SKU
              <input
                className={styles.textInput}
                placeholder="Search products or SKU"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className={styles.actionsRow}>
              <button className={styles.primaryButton} onClick={runReport} disabled={loading || !selectedWarehouseId}>
                {loading ? "Loading..." : "Run report"}
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => setSearch("")}
                disabled={loading || search.length === 0}
              >
                Clear search
              </button>
              <button
                className={styles.secondaryButton}
                onClick={downloadPdf}
                disabled={loading || pdfBusy || rows.length === 0}
              >
                {pdfBusy ? "Preparing PDF..." : "Download PDF"}
              </button>
            </div>
            {reportAt && <p className={styles.smallNote}>Last updated {reportAt}</p>}
          </div>
        </section>

        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Warehouse</p>
            <p className={styles.summaryValue}>{selectedWarehouseLabel}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Products</p>
            <p className={styles.summaryValue}>{rows.length}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total accrued units</p>
            <p className={styles.summaryValue}>{formatQty(totalUnits)}</p>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <h2 className={styles.tableTitle}>Coldroom accrued stock</h2>
              <p className={styles.tableNote}>
                {rangeLabel} · Warehouse: {selectedWarehouseLabel}
              </p>
            </div>
            <p className={styles.tableNote}>{rows.length} products</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Variant</th>
                  <th>Kind</th>
                  <th className={styles.rightAlign}>Accrued units</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyState}>
                      Loading report...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyState}>
                      No products matched this filter.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={`${row.item_id}-${row.variant_key}`}>
                      <td>{row.item_name}</td>
                      <td>{formatVariantLabel(row.variant_key)}</td>
                      <td className={styles.kindCell}>{row.item_kind}</td>
                      <td className={styles.rightAlign}>{formatQty(row.total_units)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
