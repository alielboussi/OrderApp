"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "../reports/reports.module.css";

type OutletOption = { id: string; name: string };

type WarehouseRow = { id: string; name: string | null };

type OutletWarehouseRow = { outlet_id: string; warehouse_id: string; show_in_stocktake: boolean };

type StockPeriodRow = {
  id: string;
  warehouse_id: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  stocktake_number: string | null;
  closing_snapshot: unknown | null;
  opening_snapshot: unknown | null;
  note: string | null;
};

type StockCountRow = { period_id: string; kind: string };

type MissingOpenRow = {
  warehouse_id: string;
  warehouse_name: string;
  outlet_names: string[];
  last_closed_at: string | null;
};

type MissingClosingRow = {
  period_id: string;
  warehouse_name: string;
  stocktake_number: string;
  opened_at: string;
  closed_at: string;
  note: string | null;
};

type WhoAmIRoles = {
  outlets: Array<{ outlet_id: string; outlet_name: string }> | null;
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

function isSnapshotEmpty(snapshot: unknown): boolean {
  if (!snapshot) return true;
  if (Array.isArray(snapshot)) return snapshot.length === 0;
  return false;
}

export default function StockPeriodExceptionsPage() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const { status } = useWarehouseAuth();

  const today = useMemo(() => new Date(), []);
  const lastMonth = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  }, []);

  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(toDateInputValue(lastMonth));
  const [endDate, setEndDate] = useState(toDateInputValue(today));
  const [missingOpen, setMissingOpen] = useState<MissingOpenRow[]>([]);
  const [missingClosing, setMissingClosing] = useState<MissingClosingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportAt, setReportAt] = useState<string | null>(null);

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadOutlets = async () => {
      try {
        setBooting(true);
        setError(null);

        const { data: whoami, error: whoamiError } = await supabase.rpc("whoami_roles");
        if (whoamiError) throw whoamiError;

        const record = (whoami?.[0] ?? null) as WhoAmIRoles | null;
        const outletList = record?.outlets ?? [];
        const mapped = outletList
          .filter((outlet) => outlet?.outlet_id)
          .map((outlet) => ({ id: outlet.outlet_id, name: outlet.outlet_name }));

        if (!active) return;

        if (mapped.length === 0) {
          const { data: fallback, error: fallbackError } = await supabase.rpc("whoami_outlet");
          if (fallbackError) throw fallbackError;
          const fallbackOutlet = fallback?.[0] as { outlet_id: string; outlet_name: string } | undefined;
          if (fallbackOutlet?.outlet_id) {
            mapped.push({ id: fallbackOutlet.outlet_id, name: fallbackOutlet.outlet_name });
          }
        }

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
  }, [status, supabase, selectedOutletIds.length]);

  const toggleOutlet = (id: string) => {
    setSelectedOutletIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const selectAllOutlets = () => {
    setSelectedOutletIds(outlets.map((outlet) => outlet.id));
  };

  const clearOutlets = () => {
    setSelectedOutletIds([]);
  };

  const runReport = async () => {
    if (status !== "ok") return;

    try {
      setLoading(true);
      setError(null);

      if (selectedOutletIds.length === 0) {
        setMissingOpen([]);
        setMissingClosing([]);
        return;
      }

      const { data: outletWarehouseRows, error: outletWarehouseError } = await supabase
        .from("outlet_warehouses")
        .select("outlet_id,warehouse_id,show_in_stocktake")
        .in("outlet_id", selectedOutletIds)
        .eq("show_in_stocktake", true);

      if (outletWarehouseError) throw outletWarehouseError;
      const outletWarehouses = (outletWarehouseRows ?? []) as OutletWarehouseRow[];

      const warehouseIds = Array.from(new Set(outletWarehouses.map((row) => row.warehouse_id)));
      if (warehouseIds.length === 0) {
        setMissingOpen([]);
        setMissingClosing([]);
        setReportAt(new Date().toLocaleString());
        return;
      }

      const [warehouseRes, periodRes] = await Promise.all([
        supabase.from("warehouses").select("id,name").in("id", warehouseIds),
        supabase
          .from("warehouse_stock_periods")
          .select("id,warehouse_id,status,opened_at,closed_at,stocktake_number,closing_snapshot,opening_snapshot,note")
          .in("warehouse_id", warehouseIds),
      ]);

      if (warehouseRes.error) throw warehouseRes.error;
      if (periodRes.error) throw periodRes.error;

      const warehouseMap = new Map(
        (warehouseRes.data ?? []).map((row: WarehouseRow) => [row.id, row.name ?? row.id])
      );

      const openPeriods = (periodRes.data ?? []).filter((row: StockPeriodRow) => row.status === "open");
      const closedPeriods = (periodRes.data ?? []).filter((row: StockPeriodRow) => row.status === "closed");

      const openWarehouseSet = new Set(openPeriods.map((row) => row.warehouse_id));
      const outletNamesById = new Map(outlets.map((outlet) => [outlet.id, outlet.name]));
      const outletNamesByWarehouse = new Map<string, string[]>();

      outletWarehouses.forEach((row) => {
        const list = outletNamesByWarehouse.get(row.warehouse_id) ?? [];
        const name = outletNamesById.get(row.outlet_id) ?? row.outlet_id;
        if (!list.includes(name)) list.push(name);
        outletNamesByWarehouse.set(row.warehouse_id, list);
      });

      const lastClosedByWarehouse = new Map<string, string>();
      closedPeriods.forEach((row) => {
        if (!row.closed_at) return;
        const existing = lastClosedByWarehouse.get(row.warehouse_id);
        if (!existing || new Date(row.closed_at) > new Date(existing)) {
          lastClosedByWarehouse.set(row.warehouse_id, row.closed_at);
        }
      });

      const missingOpenRows = warehouseIds
        .filter((warehouseId) => !openWarehouseSet.has(warehouseId))
        .map((warehouseId) => ({
          warehouse_id: warehouseId,
          warehouse_name: warehouseMap.get(warehouseId) ?? warehouseId,
          outlet_names: outletNamesByWarehouse.get(warehouseId) ?? [],
          last_closed_at: lastClosedByWarehouse.get(warehouseId) ?? null,
        }));

      const startIso = startDate ? new Date(`${startDate}T00:00:00`).toISOString() : null;
      const endIso = endDate ? new Date(`${endDate}T00:00:00`).toISOString() : null;

      const closedInRange = closedPeriods.filter((period) => {
        if (!period.closed_at) return false;
        if (startIso && period.closed_at < startIso) return false;
        if (endIso) {
          const end = new Date(endIso);
          end.setDate(end.getDate() + 1);
          if (period.closed_at > end.toISOString()) return false;
        }
        return true;
      });

      const closedIds = closedInRange.map((row) => row.id);
      const { data: countRows, error: countError } = closedIds.length
        ? await supabase.from("warehouse_stock_counts").select("period_id,kind").in("period_id", closedIds)
        : { data: [] as StockCountRow[] };

      if (countError) throw countError;

      const closingSet = new Set(
        (countRows ?? []).filter((row) => row.kind === "closing").map((row) => row.period_id)
      );

      const missingClosingRows = closedInRange
        .filter((period) => !closingSet.has(period.id) && isSnapshotEmpty(period.closing_snapshot))
        .map((period) => ({
          period_id: period.id,
          warehouse_name: warehouseMap.get(period.warehouse_id) ?? period.warehouse_id,
          stocktake_number: period.stocktake_number ?? period.id.slice(0, 8),
          opened_at: new Date(period.opened_at).toLocaleString(),
          closed_at: period.closed_at ? new Date(period.closed_at).toLocaleString() : "-",
          note: period.note,
        }));

      setMissingOpen(missingOpenRows);
      setMissingClosing(missingClosingRows);
      setReportAt(new Date().toLocaleString());
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status !== "ok" || booting || selectedOutletIds.length === 0) return;
    void runReport();
  }, [status, booting, selectedOutletIds.length, startDate, endDate]);

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Stock Period Exceptions</h1>
            <p className={styles.subtitle}>Find missing open periods and closed periods without closing counts.</p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={handleBackOne} className={styles.backButton}>Back</button>
            <button onClick={handleBack} className={styles.backButton}>Back to Dashboard</button>
          </div>
        </header>

        <section className={styles.filtersGrid}>
          <div className={styles.filterCard}>
            <div className={styles.filterHeader}>
              <h2 className={styles.filterTitle}>Outlets</h2>
              <div className={styles.filterActions}>
                <button type="button" className={styles.ghostButton} onClick={selectAllOutlets}>Select all</button>
                <button type="button" className={styles.ghostButton} onClick={clearOutlets}>Clear</button>
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
            <h2 className={styles.filterTitle}>Closed Period Range</h2>
            <label className={styles.inputLabel}>
              Start date
              <input className={styles.textInput} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className={styles.inputLabel}>
              End date
              <input className={styles.textInput} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
        </section>

        <section className={styles.actionsRow}>
          <button className={styles.primaryButton} onClick={runReport} disabled={loading || selectedOutletIds.length === 0}>
            {loading ? "Running..." : "Run Report"}
          </button>
          <span className={styles.muted}>{reportAt ? `Last run: ${reportAt}` : ""}</span>
        </section>

        {error ? <p className={styles.error}>Error: {error}</p> : null}

        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Missing Open Period</p>
            <p className={styles.summaryValue}>{missingOpen.length}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Missing Closing Counts</p>
            <p className={styles.summaryValue}>{missingClosing.length}</p>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Warehouses Without Open Periods</h2>
            <p className={styles.tableNote}>{missingOpen.length} warehouses missing open periods</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Warehouse</th>
                  <th>Outlets</th>
                  <th>Last Closed</th>
                </tr>
              </thead>
              <tbody>
                {missingOpen.length === 0 ? (
                  <tr>
                    <td colSpan={3} className={styles.emptyState}>
                      {loading ? "Loading report..." : "No missing open periods found."}
                    </td>
                  </tr>
                ) : (
                  missingOpen.map((row) => (
                    <tr key={row.warehouse_id}>
                      <td>{row.warehouse_name}</td>
                      <td>{row.outlet_names.join(", ") || "-"}</td>
                      <td>{row.last_closed_at ? new Date(row.last_closed_at).toLocaleString() : "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Closed Periods Missing Closing Counts</h2>
            <p className={styles.tableNote}>{missingClosing.length} periods missing closing counts</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Stocktake</th>
                  <th>Warehouse</th>
                  <th>Opened</th>
                  <th>Closed</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {missingClosing.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyState}>
                      {loading ? "Loading report..." : "No closed periods missing closing counts."}
                    </td>
                  </tr>
                ) : (
                  missingClosing.map((row) => (
                    <tr key={row.period_id}>
                      <td>{row.stocktake_number}</td>
                      <td>{row.warehouse_name}</td>
                      <td>{row.opened_at}</td>
                      <td>{row.closed_at}</td>
                      <td>{row.note ?? "-"}</td>
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
button {
  background: none;
  border: none;
}

button:hover {
  transform: translateY(-2px);
}
`;
