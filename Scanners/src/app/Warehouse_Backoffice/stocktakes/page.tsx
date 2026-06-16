"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import eb from "../enterprise.module.css";
import styles from "./outlet-stocktake.module.css";
import { downloadVariancePdf } from "./outletStocktakePdf";

const POLL_MS = 30_000;

type OutletWarehouse = {
  outlet_id: string;
  outlet_name: string;
  warehouse_id: string;
  warehouse_name: string;
};

type LiveBalanceRow = {
  outlet_id: string;
  warehouse_id: string;
  warehouse_name: string;
  item_id: string;
  item_name: string;
  item_sku: string | null;
  variant_key: string;
  net_units: number;
};

type StockPeriod = {
  id: string;
  warehouse_id: string;
  outlet_id: string | null;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  stocktake_number: string | null;
  note: string | null;
};

type CountRow = {
  item_id: string;
  variant_key: string;
  counted_qty: number;
  kind: string;
};

type ItemNameRow = { id: string; name: string | null };

type VarianceApiRow = {
  item_id?: string | null;
  item_name: string | null;
  variant_key: string | null;
  variant_label?: string | null;
  opening_qty: number | null;
  transfer_qty: number | null;
  damage_qty: number | null;
  sales_qty: number | null;
  closing_qty: number | null;
  expected_qty: number | null;
  variance_qty: number | null;
  unit_cost?: number | null;
  variance_cost: number | null;
  variant_amount?: number | null;
};

function formatQty(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value % 1 === 0 ? String(value) : value.toFixed(2);
}

function formatStamp(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}

export default function StocktakesPage() {
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);

  const [outletWarehouses, setOutletWarehouses] = useState<OutletWarehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [liveBalances, setLiveBalances] = useState<LiveBalanceRow[]>([]);
  const [periods, setPeriods] = useState<StockPeriod[]>([]);
  const [openPeriod, setOpenPeriod] = useState<StockPeriod | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [countItemNames, setCountItemNames] = useState<Map<string, string>>(new Map());
  const [varianceRows, setVarianceRows] = useState<VarianceApiRow[]>([]);
  const [includeSales, setIncludeSales] = useState(true);
  const [loading, setLoading] = useState(true);
  const [varianceLoading, setVarianceLoading] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const selectedOutlet = useMemo(
    () => outletWarehouses.find((row) => row.warehouse_id === selectedWarehouseId) ?? null,
    [outletWarehouses, selectedWarehouseId]
  );

  const closedPeriods = useMemo(() => periods.filter((p) => p.status === "closed"), [periods]);

  const loadOutletWarehouses = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("v_outlet_warehouses")
      .select("outlet_id,outlet_name,warehouse_id,warehouse_name")
      .eq("show_in_stocktake", true)
      .order("outlet_name");
    if (loadError) throw loadError;
    const rows = (data as OutletWarehouse[]) ?? [];
    setOutletWarehouses(rows);
    setSelectedWarehouseId((current) => current || rows[0]?.warehouse_id || "");
  }, [supabase]);

  const loadLiveBalances = useCallback(
    async (warehouseId: string, outletId: string) => {
      if (!warehouseId || !outletId) {
        setLiveBalances([]);
        return;
      }
      const { data, error: loadError } = await supabase
        .from("v_outlet_warehouse_ledger_balances")
        .select("*")
        .eq("outlet_id", outletId)
        .eq("warehouse_id", warehouseId)
        .order("item_name");
      if (loadError) throw loadError;
      setLiveBalances((data as LiveBalanceRow[]) ?? []);
      setLastRefreshed(new Date().toISOString());
    },
    [supabase]
  );

  const loadPeriods = useCallback(
    async (warehouseId: string) => {
      if (!warehouseId) {
        setPeriods([]);
        setOpenPeriod(null);
        return;
      }
      const res = await fetch(`/api/warehouse-periods?warehouseId=${encodeURIComponent(warehouseId)}&limit=24`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Unable to load stocktake periods");
      const json = await res.json();
      const list = (json.periods as StockPeriod[]) ?? [];
      setPeriods(list);
      const open = list.find((p) => p.status === "open") ?? null;
      setOpenPeriod(open);
      setSelectedPeriodId((current) => {
        if (current && list.some((p) => p.id === current)) return current;
        return open?.id ?? list.find((p) => p.status === "closed")?.id ?? null;
      });
    },
    []
  );

  const loadCounts = useCallback(
    async (periodId: string | null) => {
      if (!periodId) {
        setCounts([]);
        setCountItemNames(new Map());
        return;
      }
      const { data, error: loadError } = await supabase
        .from("warehouse_stock_counts")
        .select("item_id,variant_key,counted_qty,kind")
        .eq("period_id", periodId)
        .in("kind", ["opening", "closing"]);
      if (loadError) throw loadError;
      const rows = (data as CountRow[]) ?? [];
      setCounts(rows);

      const itemIds = [...new Set(rows.map((r) => r.item_id).filter(Boolean))];
      if (itemIds.length === 0) {
        setCountItemNames(new Map());
        return;
      }
      const { data: items, error: itemError } = await supabase
        .from("catalog_items")
        .select("id,name")
        .in("id", itemIds);
      if (itemError) throw itemError;
      const nameMap = new Map<string, string>();
      ((items as ItemNameRow[]) ?? []).forEach((row) => {
        if (row.id) nameMap.set(row.id, row.name ?? row.id.slice(0, 8));
      });
      setCountItemNames(nameMap);
    },
    [supabase]
  );

  const loadVariance = useCallback(async (periodId: string) => {
    setVarianceLoading(true);
    try {
      const res = await fetch(`/api/stocktake-variance?period_id=${encodeURIComponent(periodId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Unable to load variance");
      const json = await res.json();
      setIncludeSales(json.include_sales !== false);
      setVarianceRows((json.rows as VarianceApiRow[]) ?? []);
    } finally {
      setVarianceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadOutletWarehouses();
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load outlets");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [status, loadOutletWarehouses]);

  useEffect(() => {
    if (!selectedWarehouseId || !selectedOutlet) return;
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    const refresh = async () => {
      try {
        await Promise.all([
          loadLiveBalances(selectedWarehouseId, selectedOutlet.outlet_id),
          loadPeriods(selectedWarehouseId),
        ]);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Refresh failed");
      }
    };

    refresh();
    timer = setInterval(refresh, POLL_MS);
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [selectedWarehouseId, selectedOutlet, loadLiveBalances, loadPeriods]);

  useEffect(() => {
    if (!selectedPeriodId) {
      setCounts([]);
      setVarianceRows([]);
      return;
    }
    loadCounts(selectedPeriodId);
    const period = periods.find((p) => p.id === selectedPeriodId);
    if (period?.status === "closed") {
      loadVariance(selectedPeriodId);
    } else {
      setVarianceRows([]);
    }
  }, [selectedPeriodId, periods, loadCounts, loadVariance]);

  const openingCounts = counts.filter((c) => c.kind === "opening");
  const closingCounts = counts.filter((c) => c.kind === "closing");

  const labelForCount = (row: CountRow) => {
    const name = countItemNames.get(row.item_id) ?? row.item_id.slice(0, 8);
    const variant = row.variant_key === "base" ? "" : ` · ${row.variant_key}`;
    return `${name}${variant}`;
  };

  const handlePdf = async (period: StockPeriod) => {
    if (period.status !== "closed") return;
    try {
      setPdfBusyId(period.id);
      await downloadVariancePdf({
        periodId: period.id,
        warehouseLabel: `${selectedOutlet?.outlet_name ?? "Outlet"} — ${selectedOutlet?.warehouse_name ?? "Warehouse"}`,
        periodLabel: period.stocktake_number || period.id.slice(0, 8),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF failed");
    } finally {
      setPdfBusyId(null);
    }
  };

  if (status !== "ok") {
    return (
      <section className={eb.pageCard}>
        <p className={eb.pageCardBody}>Not authorized for stocktakes.</p>
      </section>
    );
  }

  return (
    <div className={styles.shell}>
      <section className={eb.pageCard}>
        <div className={eb.sectionHeaderBlue}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            Outlet warehouse stocktakes
          </h3>
          <p className={eb.pageCardBody}>
            Live ledger balance per outlet warehouse. Opening and closing counts are captured in the Afterten Orders app;
            transfers, damages, and POS sales flow from middleware into the variance automatically when a period closes.
          </p>
        </div>
        <p className={styles.formula}>
          Expected = Opening + Order transfers + Damages − Sales · Variance = Expected − Closing · Variance value = Cost ×
          Variance qty
        </p>
      </section>

      <section className={eb.pageCard}>
        <div className={styles.toolbar}>
          <label className={styles.field}>
            <span className={styles.label}>Outlet warehouse</span>
            <select
              className={styles.select}
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
            >
              {outletWarehouses.map((row) => (
                <option key={row.warehouse_id} value={row.warehouse_id}>
                  {row.outlet_name} — {row.warehouse_name}
                </option>
              ))}
            </select>
          </label>
          {lastRefreshed && (
            <span className={styles.muted}>Live balance refreshed {formatStamp(lastRefreshed)}</span>
          )}
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </section>

      {loading ? (
        <section className={eb.pageCard}>
          <p className={eb.pageCardBody}>Loading…</p>
        </section>
      ) : (
        <>
          <section className={eb.pageCard}>
            <div className={eb.sectionHeaderGreen}>
              <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
                Live balance
              </h3>
              <p className={eb.pageCardBody}>Physical stock on hand from the warehouse ledger (polls every 30s).</p>
            </div>
            {liveBalances.length === 0 ? (
              <p className={styles.muted}>No ledger movements yet for this outlet warehouse.</p>
            ) : (
              <div className={eb.tableWrap}>
                <table className={eb.dataTable}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Variant</th>
                      <th>SKU</th>
                      <th>On hand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveBalances.map((row) => (
                      <tr key={`${row.item_id}-${row.variant_key}`}>
                        <td>{row.item_name}</td>
                        <td>{row.variant_key === "base" ? "—" : row.variant_key}</td>
                        <td>{row.item_sku ?? "—"}</td>
                        <td>{formatQty(row.net_units)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={eb.pageCard}>
            <div className={eb.sectionHeaderGold}>
              <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
                Stocktake periods
              </h3>
              <p className={eb.pageCardBody}>
                {openPeriod
                  ? `Open period ${openPeriod.stocktake_number ?? openPeriod.id.slice(0, 8)} — capture closing in the app to auto-close and roll forward opening.`
                  : "No open period. Start one from the Afterten Orders app."}
              </p>
            </div>

            <div className={styles.periodGrid}>
              {periods.length === 0 ? (
                <p className={styles.muted}>No periods yet.</p>
              ) : (
                periods.map((period) => {
                  const isSelected = period.id === selectedPeriodId;
                  const isClosed = period.status === "closed";
                  return (
                    <article
                      key={period.id}
                      className={`${styles.periodCard} ${isSelected ? styles.periodCardActive : ""}`}
                    >
                      <div className={styles.periodHeader}>
                        <div>
                          <p className={styles.periodTitle}>{period.stocktake_number ?? period.id.slice(0, 8)}</p>
                          <p className={styles.periodMeta}>
                            {period.status.toUpperCase()} · Opened {formatStamp(period.opened_at)}
                            {period.closed_at ? ` · Closed ${formatStamp(period.closed_at)}` : ""}
                          </p>
                        </div>
                        <div className={styles.periodActions}>
                          {isClosed && (
                            <button
                              type="button"
                              className={styles.pdfBtn}
                              title="Download variance PDF"
                              disabled={pdfBusyId === period.id}
                              onClick={() => handlePdf(period)}
                            >
                              {pdfBusyId === period.id ? "…" : "PDF"}
                            </button>
                          )}
                          <button
                            type="button"
                            className={eb.btnSecondary}
                            onClick={() => setSelectedPeriodId(period.id)}
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          {selectedPeriodId && (
            <section className={eb.pageCard}>
              <div className={eb.sectionHeaderBlue}>
                <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
                  Period detail
                </h3>
              </div>
              <div className={styles.countGrid}>
                <div className={styles.countBlock}>
                  <h4 className={styles.countTitle}>Opening ({openingCounts.length})</h4>
                  {openingCounts.length === 0 ? (
                    <p className={styles.muted}>No opening counts yet.</p>
                  ) : (
                    <ul className={styles.countList}>
                      {openingCounts.slice(0, 12).map((row) => (
                        <li key={`o-${row.item_id}-${row.variant_key}`}>
                          {labelForCount(row)}: {formatQty(row.counted_qty)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className={styles.countBlock}>
                  <h4 className={styles.countTitle}>Closing ({closingCounts.length})</h4>
                  {closingCounts.length === 0 ? (
                    <p className={styles.muted}>Closing counts appear when the period is closed in the app.</p>
                  ) : (
                    <ul className={styles.countList}>
                      {closingCounts.slice(0, 12).map((row) => (
                        <li key={`c-${row.item_id}-${row.variant_key}`}>
                          {labelForCount(row)}: {formatQty(row.counted_qty)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {periods.find((p) => p.id === selectedPeriodId)?.status === "closed" && (
                <>
                  <h4 className={styles.countTitle} style={{ marginTop: 16 }}>
                    Variance report
                  </h4>
                  {varianceLoading ? (
                    <p className={styles.muted}>Calculating variance…</p>
                  ) : varianceRows.length === 0 ? (
                    <p className={styles.muted}>No variance rows for this period.</p>
                  ) : (
                    <div className={eb.tableWrap}>
                      <table className={eb.dataTable}>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Opening</th>
                            <th>Transfers</th>
                            <th>Damages</th>
                            {includeSales && <th>Sales</th>}
                            <th>Expected</th>
                            <th>Closing</th>
                            <th>Variance</th>
                            <th>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {varianceRows.map((row) => (
                            <tr key={`${row.item_id}-${row.variant_key}`}>
                              <td>{row.variant_label ?? row.item_name ?? row.item_id}</td>
                              <td>{formatQty(row.opening_qty)}</td>
                              <td>{formatQty(row.transfer_qty)}</td>
                              <td>{formatQty(row.damage_qty)}</td>
                              {includeSales && <td>{formatQty(row.sales_qty)}</td>}
                              <td>{formatQty(row.expected_qty)}</td>
                              <td>{formatQty(row.closing_qty)}</td>
                              <td>{formatQty(row.variance_qty)}</td>
                              <td>{formatQty(row.variance_cost ?? row.variant_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {closedPeriods.length > 0 && (
            <section className={eb.pageCard}>
              <p className={styles.muted}>
                When a period closes, the next period opens automatically with opening stock equal to the previous
                closing snapshot. Use the PDF button on any closed period for the variance report.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
