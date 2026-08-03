"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import { fetchSellingOutlets } from "@/lib/warehouse-outlet-api";
import styles from "../reports/reports.module.css";
import { buildFlowTracePdfHtml } from "./reportpdf";

type OutletOption = {
  id: string;
  name: string;
};

type FlowTraceRow = {
  id: string;
  created_at: string;
  flow_batch_id: string | null;
  outlet_id: string | null;
  level: string;
  item_id: string;
  variant_key: string | null;
  warehouse_id: string | null;
  context: Record<string, unknown> | null;
};

type FlowTraceStep = {
  trace_id: string;
  occurred_at: string;
  delta_units: number | null;
  available_units: number | null;
  negative: boolean | null;
};

type CatalogItem = { id: string; name: string | null; item_kind: string | null };

type WarehouseRow = { id: string; name: string | null };

type OutletRow = { id: string; name: string | null };

type AggregatedTrace = {
  id: string;
  created_at: string;
  created_at_epoch: number;
  flow_batch_id: string | null;
  outlet_id: string | null;
  outlet_name: string;
  level: string;
  item_id: string;
  item_name: string;
  variant_key: string;
  variant_label: string;
  warehouse_id: string | null;
  warehouse_name: string;
  total_delta: number;
  available_units: number | null;
  negative: boolean;
};

type BatchSummary = {
  batch_key: string;
  batch_id: string | null;
  created_at: string;
  created_at_epoch: number;
  outlet_name: string;
  trace_count: number;
  total_delta: number;
  negative: boolean;
  levels: string;
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

function parseNumber(value: number | null): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return value;
}

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatBatchId(value: string | null): string {
  if (!value) return "Unbatched";
  return value.length <= 10 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;
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

export default function FlowTraceReportsPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();

  const today = useMemo(() => new Date(), []);
  const lastWeek = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }, []);

  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(toDateInputValue(lastWeek));
  const [endDate, setEndDate] = useState(toDateInputValue(today));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [includeFinished, setIncludeFinished] = useState(true);
  const [includeIngredient, setIncludeIngredient] = useState(true);
  const [includeRaw, setIncludeRaw] = useState(true);
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [batchSearch, setBatchSearch] = useState("");
  const [groupByBatch, setGroupByBatch] = useState(false);
  const [selectedBatchKey, setSelectedBatchKey] = useState<string | null>(null);
  const [rows, setRows] = useState<AggregatedTrace[]>([]);
  const [variantNameMap, setVariantNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportAt, setReportAt] = useState<string | null>(null);
  const [hasAutoRun, setHasAutoRun] = useState(false);

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadOutlets = async () => {
      try {
        setBooting(true);
        setError(null);

        const mapped = await fetchSellingOutlets("selling");

        if (!active) return;

        setOutlets(mapped);
        if (mapped.length > 0 && selectedOutletIds.length === 0) {
          setSelectedOutletIds(mapped.map((outlet) => outlet.id));
        }
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      } finally {
        if (active) setBooting(false);
      }
    };

    loadOutlets();

    return () => {
      active = false;
    };
  }, [status, selectedOutletIds.length]);

  const toggleOutlet = (id: string) => {
    setSelectedOutletIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const selectAllOutlets = () => {
    setSelectedOutletIds(outlets.map((outlet) => outlet.id));
  };

  const clearOutlets = () => {
    setSelectedOutletIds([]);
  };

  const selectedOutletNames = useMemo(() => {
    if (selectedOutletIds.length === 0) return "All outlets";
    const nameMap = new Map(outlets.map((outlet) => [outlet.id, outlet.name]));
    return selectedOutletIds
      .map((id) => nameMap.get(id) ?? id)
      .filter(Boolean)
      .join(", ");
  }, [outlets, selectedOutletIds]);

  const downloadCsv = () => {
    if (!filteredRows.length) return;
    const headers = [
      "Time",
      "Batch",
      "Outlet",
      "Level",
      "Item",
      "Variant",
      "Warehouse",
      "Total Delta",
      "Available",
      "Negative"
    ];
    const lines = filteredRows.map((row) => [
      row.created_at,
      row.flow_batch_id ?? "",
      row.outlet_name,
      row.level,
      row.item_name,
      row.variant_label,
      row.warehouse_name,
      row.total_delta.toString(),
      row.available_units == null ? "" : row.available_units.toString(),
      row.negative ? "YES" : ""
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));

    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `flow-traces-${startDate || "all"}-to-${endDate || "all"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdfReport = async () => {
    if (!filteredRows.length) return;
    const outletText = selectedOutletNames || "All outlets";
    const rangeText = startDate && endDate ? `${startDate} to ${endDate}` : "All dates";
    const timeText = startTime || endTime ? `${startTime || "00:00"} to ${endTime || "23:59"}` : "All day";
    const logoDataUrl = await loadLogoDataUrl();

    const html = buildFlowTracePdfHtml({
      outletText,
      rangeText,
      timeText,
      logoDataUrl,
      rows: filteredRows.map((row) => ({
        flow_batch_id: row.flow_batch_id,
        created_at: row.created_at,
        outlet_name: row.outlet_name,
        level: row.level,
        item_name: row.item_name,
        variant_label: row.variant_label,
        warehouse_name: row.warehouse_name,
        total_delta: row.total_delta,
        available_units: row.available_units,
        negative: row.negative,
      })),
      totals: filteredRows.reduce(
        (acc, row) => ({
          count: acc.count + 1,
          negativeCount: acc.negativeCount + (row.negative ? 1 : 0),
          totalDelta: acc.totalDelta + row.total_delta,
        }),
        { count: 0, negativeCount: 0, totalDelta: 0 }
      ),
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
  };

  const runReport = useCallback(async () => {
    if (status !== "ok") return;

    try {
      setLoading(true);
      setError(null);

      const levels: string[] = [];
      if (includeFinished) levels.push("finished");
      if (includeIngredient) levels.push("ingredient");
      if (includeRaw) levels.push("raw");

      if (levels.length === 0) {
        setRows([]);
        return;
      }

      const params = new URLSearchParams();
      selectedOutletIds.forEach((id) => params.append("outlet_id", id));
      levels.forEach((level) => params.append("level", level));
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      if (startTime) params.set("start_time", startTime);
      if (endTime) params.set("end_time", endTime);

      const res = await fetch(`/api/flow-traces?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as {
        rows?: AggregatedTrace[];
        variant_names?: Record<string, string>;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Unable to load flow traces");

      setRows(json.rows ?? []);
      setVariantNameMap(json.variant_names ?? {});
      setReportAt(new Date().toLocaleString());
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, selectedOutletIds, startDate, startTime, endDate, endTime, includeFinished, includeIngredient, includeRaw]);

  useEffect(() => {
    if (status !== "ok" || booting || selectedOutletIds.length === 0 || hasAutoRun) return;
    setHasAutoRun(true);
    void runReport();
  }, [status, booting, selectedOutletIds.length, hasAutoRun, runReport]);

  const baseFilteredRows = useMemo(() => {
    const itemQuery = itemSearch.trim().toLowerCase();
    const warehouseQuery = warehouseSearch.trim().toLowerCase();
    const batchQuery = batchSearch.trim().toLowerCase();

    return rows.filter((row) => {
      if (negativeOnly && !row.negative) return false;
      if (itemQuery && !row.item_name.toLowerCase().includes(itemQuery)) return false;
      if (warehouseQuery && !row.warehouse_name.toLowerCase().includes(warehouseQuery)) return false;
      if (batchQuery) {
        const batchId = (row.flow_batch_id ?? "").toLowerCase();
        if (!batchId.includes(batchQuery)) return false;
      }
      return true;
    });
  }, [rows, itemSearch, warehouseSearch, batchSearch, negativeOnly]);

  const filteredRows = useMemo(() => {
    if (!groupByBatch || !selectedBatchKey) return baseFilteredRows;
    if (selectedBatchKey === "__unbatched__") {
      return baseFilteredRows.filter((row) => !row.flow_batch_id);
    }
    return baseFilteredRows.filter((row) => row.flow_batch_id === selectedBatchKey);
  }, [baseFilteredRows, groupByBatch, selectedBatchKey]);

  const batchSummaries = useMemo(() => {
    if (!groupByBatch) return [] as BatchSummary[];
    const buckets = new Map<string, BatchSummary & { outlets: Set<string>; levelCounts: Record<string, number> }>();

    baseFilteredRows.forEach((row) => {
      const batchKey = row.flow_batch_id ?? "__unbatched__";
      const summary = buckets.get(batchKey) ?? {
        batch_key: batchKey,
        batch_id: row.flow_batch_id ?? null,
        created_at: row.created_at,
        created_at_epoch: row.created_at_epoch,
        outlet_name: row.outlet_name,
        trace_count: 0,
        total_delta: 0,
        negative: false,
        levels: "",
        outlets: new Set<string>(),
        levelCounts: { finished: 0, ingredient: 0, raw: 0 },
      };

      summary.trace_count += 1;
      summary.total_delta += row.total_delta;
      summary.negative = summary.negative || row.negative;
      summary.created_at_epoch = Math.max(summary.created_at_epoch, row.created_at_epoch);
      summary.created_at = summary.created_at_epoch === row.created_at_epoch ? row.created_at : summary.created_at;
      summary.outlets.add(row.outlet_name);
      summary.levelCounts[row.level] = (summary.levelCounts[row.level] ?? 0) + 1;

      buckets.set(batchKey, summary);
    });

    return Array.from(buckets.values())
      .map((summary) => {
        const outletName = summary.outlets.size > 1 ? "Multiple outlets" : Array.from(summary.outlets)[0] ?? summary.outlet_name;
        const levelParts = [
          summary.levelCounts.finished ? `Finished ${summary.levelCounts.finished}` : null,
          summary.levelCounts.ingredient ? `Ingredient ${summary.levelCounts.ingredient}` : null,
          summary.levelCounts.raw ? `Raw ${summary.levelCounts.raw}` : null,
        ].filter(Boolean);
        return {
          batch_key: summary.batch_key,
          batch_id: summary.batch_id,
          created_at: summary.created_at,
          created_at_epoch: summary.created_at_epoch,
          outlet_name: outletName,
          trace_count: summary.trace_count,
          total_delta: summary.total_delta,
          negative: summary.negative,
          levels: levelParts.join(" | ") || "-",
        } as BatchSummary;
      })
      .sort((a, b) => b.created_at_epoch - a.created_at_epoch);
  }, [baseFilteredRows, groupByBatch]);

  const totals = useMemo(() => {
    let totalDelta = 0;
    let negativeCount = 0;

    filteredRows.forEach((row) => {
      totalDelta += row.total_delta;
      if (row.negative) negativeCount += 1;
    });

    return { count: filteredRows.length, negativeCount, totalDelta };
  }, [filteredRows]);

  const batchFocusLabel = useMemo(() => {
    if (!groupByBatch || !selectedBatchKey) return "";
    if (selectedBatchKey === "__unbatched__") return "Unbatched";
    return formatBatchId(selectedBatchKey);
  }, [groupByBatch, selectedBatchKey]);

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Flow Trace Reports</h1>
            <p className={styles.subtitle}>Audit finished, ingredient, and raw deductions with structured negative stock tracking.</p>
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

        <section className={styles.filtersGrid}>
          <div className={styles.filterCard}>
            <div className={styles.filterHeader}>
              <h2 className={styles.filterTitle}>Outlets</h2>
              <div className={styles.filterActions}>
                <button type="button" className={styles.ghostButton} onClick={selectAllOutlets}>
                  Select all
                </button>
                <button type="button" className={styles.ghostButton} onClick={clearOutlets}>
                  Clear
                </button>
              </div>
            </div>
            <div className={styles.outletList}>
              {outlets.length === 0 ? (
                <p className={styles.muted}>No outlets found.</p>
              ) : (
                outlets.map((outlet) => (
                  <label key={outlet.id} className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={selectedOutletIds.includes(outlet.id)}
                      onChange={() => toggleOutlet(outlet.id)}
                    />
                    <span>{outlet.name}</span>
                  </label>
                ))
              )}
            </div>
            <p className={styles.smallNote}>Selected: {selectedOutletIds.length}</p>
          </div>

          <div className={styles.filterCard}>
            <h2 className={styles.filterTitle}>Date Range</h2>
            <label className={styles.inputLabel}>
              Start date
              <input className={styles.textInput} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className={styles.inputLabel}>
              End date
              <input className={styles.textInput} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>

          <div className={styles.filterCard}>
            <h2 className={styles.filterTitle}>Time Range</h2>
            <label className={styles.inputLabel}>
              Start time
              <input className={styles.textInput} type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
            <label className={styles.inputLabel}>
              End time
              <input className={styles.textInput} type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </label>
            <p className={styles.smallNote}>Leave time blank to include the full day.</p>
          </div>

          <div className={styles.filterCard}>
            <h2 className={styles.filterTitle}>Levels</h2>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={includeFinished} onChange={(event) => setIncludeFinished(event.target.checked)} />
              <span>Finished</span>
            </label>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={includeIngredient} onChange={(event) => setIncludeIngredient(event.target.checked)} />
              <span>Ingredient</span>
            </label>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={includeRaw} onChange={(event) => setIncludeRaw(event.target.checked)} />
              <span>Raw</span>
            </label>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={negativeOnly} onChange={(event) => setNegativeOnly(event.target.checked)} />
              <span>Negative only</span>
            </label>
          </div>

          <div className={styles.filterCard}>
            <h2 className={styles.filterTitle}>Flow Batches</h2>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={groupByBatch} onChange={(event) => {
                setGroupByBatch(event.target.checked);
                setSelectedBatchKey(null);
              }} />
              <span>Group by batch</span>
            </label>
            <label className={styles.inputLabel}>
              Batch id contains
              <input
                className={styles.textInput}
                placeholder="Search flow batch id"
                value={batchSearch}
                onChange={(event) => setBatchSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => setSelectedBatchKey(null)}
              disabled={!selectedBatchKey}
            >
              Clear batch focus
            </button>
            {selectedBatchKey ? <p className={styles.smallNote}>Focused: {batchFocusLabel}</p> : null}
          </div>

          <div className={styles.filterCard}>
            <h2 className={styles.filterTitle}>Search</h2>
            <label className={styles.inputLabel}>
              Item name contains
              <input
                className={styles.textInput}
                placeholder="Search item name"
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
              />
            </label>
            <label className={styles.inputLabel}>
              Warehouse contains
              <input
                className={styles.textInput}
                placeholder="Search warehouse"
                value={warehouseSearch}
                onChange={(event) => setWarehouseSearch(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className={styles.actionsRow}>
          <button className={styles.primaryButton} onClick={runReport} disabled={loading || selectedOutletIds.length === 0}>
            {loading ? "Running..." : "Run Report"}
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => void downloadPdfReport()}
            disabled={filteredRows.length === 0}
          >
            Download PDF
          </button>
          <button className={styles.secondaryButton} onClick={downloadCsv} disabled={filteredRows.length === 0}>
            Download CSV
          </button>
          <span className={styles.muted}>{reportAt ? `Last run: ${reportAt}` : ""}</span>
          <span className={styles.muted}>Results limited to 2,000 traces.</span>
          {groupByBatch && selectedBatchKey ? (
            <span className={styles.focusBadge}>Batch: {batchFocusLabel}</span>
          ) : null}
        </section>

        {error ? <p className={styles.error}>Error: {error}</p> : null}

        <section className={styles.summaryGrid}>
          {groupByBatch ? (
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Batches</p>
              <p className={styles.summaryValue}>{batchSummaries.length}</p>
            </div>
          ) : null}
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Traces</p>
            <p className={styles.summaryValue}>{totals.count}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Negative Traces</p>
            <p className={styles.summaryValue}>{totals.negativeCount}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total Delta</p>
            <p className={styles.summaryValue}>{formatQty(totals.totalDelta)}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Rows</p>
            <p className={styles.summaryValue}>{filteredRows.length}</p>
          </div>
        </section>

        {groupByBatch ? (
          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h2 className={styles.tableTitle}>Batch Overview</h2>
              <p className={styles.tableNote}>{batchSummaries.length} batches matched filters</p>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Batch</th>
                    <th>Outlet</th>
                    <th>Levels</th>
                    <th className={styles.rightAlign}>Traces</th>
                    <th className={styles.rightAlign}>Delta</th>
                    <th>Neg</th>
                  </tr>
                </thead>
                <tbody>
                  {batchSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={styles.emptyState}>
                        {loading ? "Loading report..." : "No batches match the current filters."}
                      </td>
                    </tr>
                  ) : (
                    batchSummaries.map((batch) => (
                      <tr
                        key={batch.batch_key}
                        className={`${styles.clickableRow} ${selectedBatchKey === batch.batch_key ? styles.selectedRow : ""}`}
                        onClick={() => setSelectedBatchKey(batch.batch_key)}
                      >
                        <td>{batch.created_at}</td>
                        <td>{formatBatchId(batch.batch_id)}</td>
                        <td>{batch.outlet_name}</td>
                        <td>{batch.levels}</td>
                        <td className={styles.rightAlign}>{batch.trace_count}</td>
                        <td className={styles.rightAlign}>{formatQty(batch.total_delta)}</td>
                        <td>{batch.negative ? "YES" : ""}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Trace Details</h2>
            <p className={styles.tableNote}>{filteredRows.length} rows matched filters</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Batch</th>
                  <th>Outlet</th>
                  <th>Level</th>
                  <th>Item</th>
                  <th>Variant</th>
                  <th>Warehouse</th>
                  <th className={styles.rightAlign}>Delta</th>
                  <th className={styles.rightAlign}>Available</th>
                  <th>Neg</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className={styles.emptyState}>
                      {loading ? "Loading report..." : "No traces match the current filters."}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.created_at}</td>
                      <td>{formatBatchId(row.flow_batch_id)}</td>
                      <td>{row.outlet_name}</td>
                      <td className={styles.kindCell}>{row.level}</td>
                      <td>{row.item_name}</td>
                      <td>{row.variant_label}</td>
                      <td>{row.warehouse_name}</td>
                      <td className={styles.rightAlign}>{formatQty(row.total_delta)}</td>
                      <td className={styles.rightAlign}>{row.available_units == null ? "-" : formatQty(row.available_units)}</td>
                      <td>{row.negative ? "YES" : ""}</td>
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
