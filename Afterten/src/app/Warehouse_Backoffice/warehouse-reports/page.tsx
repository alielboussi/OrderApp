"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import styles from "../reports/reports.module.css";

type WarehouseOption = {
  id: string;
  name: string | null;
  code: string | null;
  active?: boolean | null;
};

type WarehouseItem = {
  warehouse_id: string;
  item_id: string;
  item_name: string | null;
  variant_key: string | null;
  net_units: number | null;
  unit_cost: number | null;
  item_kind: string | null;
  image_url: string | null;
  has_recipe: boolean | null;
};

type LedgerRow = {
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

export default function WarehouseReportsPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);

  const today = useMemo(() => new Date(), []);
  const lastWeek = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }, []);

  const [outletIds, setOutletIds] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [startDate, setStartDate] = useState(toDateInputValue(lastWeek));
  const [endDate, setEndDate] = useState(toDateInputValue(today));
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportAt, setReportAt] = useState<string | null>(null);
  const [hasAutoRun, setHasAutoRun] = useState(false);

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  const selectedWarehouseLabel = useMemo(() => {
    const match = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId);
    if (!match) return "Select a warehouse";
    return match.name ?? match.code ?? match.id;
  }, [warehouses, selectedWarehouseId]);

  const rangeLabel = useMemo(() => {
    if (!startDate && !endDate) return "All dates";
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    return `Through ${endDate}`;
  }, [startDate, endDate]);

  const totalUnits = useMemo(() => rows.reduce((sum, row) => sum + row.total_units, 0), [rows]);

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
          .map((outlet) => outlet?.outlet_id)
          .filter((outletId): outletId is string => Boolean(outletId));

        if (mapped.length === 0) {
          const { data: fallback, error: fallbackError } = await supabase.rpc("whoami_outlet");
          if (fallbackError) throw fallbackError;
          const fallbackOutlet = fallback?.[0] as { outlet_id: string; outlet_name: string } | undefined;
          if (fallbackOutlet?.outlet_id) {
            mapped.push(fallbackOutlet.outlet_id);
          }
        }

        if (!active) return;
        setOutletIds(mapped);
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
        setOutletIds([]);
      } finally {
        if (active) setBooting(false);
      }
    };

    loadOutlets();

    return () => {
      active = false;
    };
  }, [status, supabase]);

  useEffect(() => {
    if (status !== "ok") return;
    if (outletIds.length === 0) {
      setWarehouses([]);
      setSelectedWarehouseId("");
      return;
    }

    let active = true;
    const loadWarehouses = async () => {
      try {
        setError(null);

        const { data: outletWarehouseRows, error: outletWarehouseError } = await supabase
          .from("outlet_warehouses")
          .select("warehouse_id")
          .in("outlet_id", outletIds)
          .eq("show_in_stocktake", true);

        if (outletWarehouseError) throw outletWarehouseError;

        const warehouseIds = Array.from(
          new Set((outletWarehouseRows ?? []).map((row) => row?.warehouse_id).filter(Boolean))
        ) as string[];

        if (!warehouseIds.length) {
          if (!active) return;
          setWarehouses([]);
          setSelectedWarehouseId("");
          return;
        }

        const { data: warehouseRows, error: warehouseError } = await supabase
          .from("warehouses")
          .select("id,name,code,active")
          .in("id", warehouseIds)
          .order("name", { ascending: true });

        if (warehouseError) throw warehouseError;
        if (!active) return;

        const filtered = (warehouseRows ?? []).filter((row) => row?.active ?? true) as WarehouseOption[];
        setWarehouses(filtered);
        if (!selectedWarehouseId || !filtered.some((warehouse) => warehouse.id === selectedWarehouseId)) {
          setSelectedWarehouseId(filtered[0]?.id ?? "");
        }
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
        setWarehouses([]);
        setSelectedWarehouseId("");
      }
    };

    loadWarehouses();

    return () => {
      active = false;
    };
  }, [status, supabase, outletIds, selectedWarehouseId]);

  const runReport = useCallback(async () => {
    if (status !== "ok") return;
    if (!selectedWarehouseId) {
      setError("Select a warehouse before running the report.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const searchTerm = search.trim();
      const { data: listItems, error: listError } = await supabase.rpc("list_warehouse_items", {
        p_warehouse_id: selectedWarehouseId,
        p_outlet_id: null,
        p_search: searchTerm || null,
      });

      if (listError) throw listError;

      const items = ((listItems ?? []) as WarehouseItem[]).filter((item) => item?.item_id);
      const itemsByKey = new Map<string, WarehouseItem>();
      items.forEach((item) => {
        const key = makeKey(item.item_id, item.variant_key);
        if (!itemsByKey.has(key)) itemsByKey.set(key, item);
      });

      let ledgerQuery = supabase
        .from("stock_ledger")
        .select("item_id,variant_key,delta_units")
        .eq("location_type", "warehouse")
        .eq("warehouse_id", selectedWarehouseId);

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
      ((ledgerRows ?? []) as LedgerRow[]).forEach((row) => {
        if (!row?.item_id) return;
        const key = makeKey(row.item_id, row.variant_key);
        if (!itemsByKey.has(key)) return;
        const delta = Number(row.delta_units ?? 0);
        if (!Number.isFinite(delta)) return;
        totals.set(key, (totals.get(key) ?? 0) + delta);
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
      setReportAt(new Date().toLocaleString());
    } catch (err) {
      setError(toErrorMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, supabase, selectedWarehouseId, startDate, endDate, search]);

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
            <h1 className={styles.title}>Warehouse Reports</h1>
            <p className={styles.subtitle}>
              Review assigned products and accrued warehouse movement totals for a specific date range.
            </p>
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
                disabled={booting || warehouses.length === 0}
              >
                <option value="">Select warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name ?? warehouse.code ?? warehouse.id}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.smallNote}>Only warehouses linked to your outlets are listed.</p>
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
              Product name
              <input
                className={styles.textInput}
                placeholder="Search products"
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
              <h2 className={styles.tableTitle}>Assigned products</h2>
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
