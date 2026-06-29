"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "../reports/reports.module.css";

type OutletOption = { id: string; name: string };

type LogRow = {
  id: string;
  created_at: string;
  action: string | null;
  details: Record<string, unknown> | null;
};

type ShortageRow = {
  key: string;
  outlet_id: string | null;
  outlet_name: string;
  item_id: string | null;
  item_name: string;
  kind: "order" | "recipe";
  warehouse_id: string | null;
  warehouse_name: string;
  shortage_total: number;
  event_count: number;
  latest_at: string;
};

type WhoAmIRoles = {
  outlets: Array<{ outlet_id: string; outlet_name: string }> | null;
};

type OutletRow = { id: string; name: string | null };

type WarehouseRow = { id: string; name: string | null };

type CatalogItem = { id: string; name: string | null };

type RawShortageRow = {
  created_at: string;
  outlet_id: string | null;
  outlet_name: string;
  item_id: string | null;
  item_name: string;
  kind: "order" | "recipe";
  warehouse_id: string | null;
  warehouse_name: string;
  shortage_qty: number;
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

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export default function OutletShortageDetailsPage() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
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
  const [includeOrder, setIncludeOrder] = useState(true);
  const [includeRecipe, setIncludeRecipe] = useState(true);
  const [itemSearch, setItemSearch] = useState("");
  const [shortageMin, setShortageMin] = useState("0");
  const [rows, setRows] = useState<ShortageRow[]>([]);
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

      const actions: string[] = [];
      if (includeOrder) actions.push("order_negative_balance");
      if (includeRecipe) actions.push("recipe_negative_balance");

      if (actions.length === 0) {
        setRows([]);
        return;
      }

      let query = supabase
        .from("warehouse_backoffice_logs")
        .select("id,created_at,action,details")
        .order("created_at", { ascending: false })
        .limit(2000)
        .in("action", actions);

      if (startDate) {
        const startIso = new Date(`${startDate}T00:00:00`).toISOString();
        query = query.gte("created_at", startIso);
      }

      if (endDate) {
        const end = new Date(`${endDate}T00:00:00`);
        end.setDate(end.getDate() + 1);
        query = query.lt("created_at", end.toISOString());
      }

      const { data: logData, error: logError } = await query;
      if (logError) throw logError;

      const logs = (logData ?? []) as LogRow[];
      if (logs.length === 0) {
        setRows([]);
        setReportAt(new Date().toLocaleString());
        return;
      }

      const outletIds = new Set<string>();
      const warehouseIds = new Set<string>();
      const itemIds = new Set<string>();

      logs.forEach((log) => {
        const details = log.details ?? {};
        const outletId = getString(details.outlet_id);
        const warehouseId = getString(details.warehouse_id);
        const itemId = getString(details.product_id) ?? getString(details.component_id);
        if (outletId) outletIds.add(outletId);
        if (warehouseId) warehouseIds.add(warehouseId);
        if (itemId) itemIds.add(itemId);
        const recipeForId = getString(details.recipe_for);
        if (recipeForId) itemIds.add(recipeForId);
      });

      const [outletRes, warehouseRes, itemRes] = await Promise.all([
        outletIds.size > 0
          ? supabase.from("outlets").select("id,name").in("id", Array.from(outletIds))
          : Promise.resolve({ data: [], error: null }),
        warehouseIds.size > 0
          ? supabase.from("warehouses").select("id,name").in("id", Array.from(warehouseIds))
          : Promise.resolve({ data: [], error: null }),
        itemIds.size > 0
          ? supabase.from("catalog_items").select("id,name").in("id", Array.from(itemIds))
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (outletRes.error) throw outletRes.error;
      if (warehouseRes.error) throw warehouseRes.error;
      if (itemRes.error) throw itemRes.error;

      const outletMap = new Map((outletRes.data ?? []).map((outlet: OutletRow) => [outlet.id, outlet.name ?? outlet.id]));
      const warehouseMap = new Map(
        (warehouseRes.data ?? []).map((warehouse: WarehouseRow) => [warehouse.id, warehouse.name ?? warehouse.id])
      );
      const itemMap = new Map((itemRes.data ?? []).map((item: CatalogItem) => [item.id, item.name ?? item.id]));

      const rawRows: RawShortageRow[] = logs.map((log) => {
        const details = log.details ?? {};
        const action = log.action ?? "";
        const outletId = getString(details.outlet_id);
        const warehouseId = getString(details.warehouse_id);
        const itemId = getString(details.product_id) ?? getString(details.component_id);
        const recipeForId = getString(details.recipe_for);
        const itemName = itemId ? itemMap.get(itemId) ?? itemId : "Unknown";

        const requestedQty = toNumber(details.requested_qty ?? details.qty ?? details.component_qty);
        const availableQty = details.available == null ? null : toNumber(details.available);
        const remainingQty = toNumber(details.remaining_qty);
        const shortage = action === "order_negative_balance"
          ? Math.max(requestedQty - (availableQty ?? 0), 0)
          : remainingQty;

        const kind = action === "order_negative_balance" ? "order" : "recipe";

        return {
          created_at: new Date(log.created_at).toLocaleString(),
          outlet_id: outletId,
          outlet_name: outletId ? outletMap.get(outletId) ?? outletId : "Unknown",
          item_id: recipeForId ?? itemId,
          item_name: recipeForId ? itemMap.get(recipeForId) ?? recipeForId : itemName,
          kind,
          warehouse_id: warehouseId,
          warehouse_name: warehouseId ? warehouseMap.get(warehouseId) ?? warehouseId : "Unknown",
          shortage_qty: shortage,
        };
      });

      const minShortage = Math.max(0, toNumber(shortageMin));
      const itemQuery = itemSearch.trim().toLowerCase();

      const filteredRaw = rawRows.filter((row) => {
        if (selectedOutletIds.length > 0 && row.outlet_id && !selectedOutletIds.includes(row.outlet_id)) return false;
        if (itemQuery && !row.item_name.toLowerCase().includes(itemQuery)) return false;
        return true;
      });

      const grouped = new Map<string, ShortageRow>();
      filteredRaw.forEach((row) => {
        const key = `${row.outlet_id ?? "unknown"}|${row.item_id ?? "unknown"}|${row.kind}|${row.warehouse_id ?? "unknown"}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.shortage_total += row.shortage_qty;
          existing.event_count += 1;
          if (new Date(row.created_at) > new Date(existing.latest_at)) {
            existing.latest_at = row.created_at;
          }
        } else {
          grouped.set(key, {
            key,
            outlet_id: row.outlet_id,
            outlet_name: row.outlet_name,
            item_id: row.item_id,
            item_name: row.item_name,
            kind: row.kind,
            warehouse_id: row.warehouse_id,
            warehouse_name: row.warehouse_name,
            shortage_total: row.shortage_qty,
            event_count: 1,
            latest_at: row.created_at,
          });
        }
      });

      const aggregated = Array.from(grouped.values())
        .filter((row) => row.shortage_total >= minShortage)
        .sort((a, b) => b.shortage_total - a.shortage_total);

      setRows(aggregated);
      setReportAt(new Date().toLocaleString());
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    let shortageTotal = 0;
    const outletSet = new Set<string>();
    rows.forEach((row) => {
      shortageTotal += row.shortage_total;
      if (row.outlet_id) outletSet.add(row.outlet_id);
    });
    return {
      totalShortage: shortageTotal,
      outlets: outletSet.size,
      rows: rows.length,
    };
  }, [rows]);

  const downloadCsv = () => {
    if (!rows.length) return;
    const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const outletText = selectedOutletIds.length ? `Selected outlets (${selectedOutletIds.length})` : "All outlets";
    const rangeText = startDate && endDate ? `${startDate} to ${endDate}` : "All dates";
    const typeLabel = [includeOrder ? "order" : null, includeRecipe ? "recipe" : null].filter(Boolean).join(", ");
    const minShortage = Math.max(0, toNumber(shortageMin));

    const metaLines = [
      ["Report", "Outlet Shortage Details"],
      ["Outlets", outletText],
      ["Date range", rangeText],
      ["Types", typeLabel || "none"],
      ["Min shortage", minShortage.toLocaleString()],
      [
        "Totals",
        `Rows ${totals.rows}`,
        `Outlets ${totals.outlets}`,
        `Shortage ${formatQty(totals.totalShortage)}`,
      ],
      [""],
    ].map((line) => line.map(csvEscape).join(","));

    const headers = [
      "Outlet",
      "Item",
      "Type",
      "Warehouse",
      "Events",
      "Total Shortage",
      "Latest",
    ];

    const lines = rows.map((row) => [
      row.outlet_name,
      row.item_name,
      row.kind,
      row.warehouse_name,
      row.event_count.toString(),
      row.shortage_total.toString(),
      row.latest_at,
    ].map(csvEscape).join(","));

    const csv = [...metaLines, headers.map(csvEscape).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `outlet-shortage-details-${startDate || "all"}-to-${endDate || "all"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (status !== "ok" || booting || selectedOutletIds.length === 0) return;
    void runReport();
  }, [status, booting, selectedOutletIds.length, startDate, endDate, includeOrder, includeRecipe, itemSearch, shortageMin]);

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Outlet Shortage Details</h1>
            <p className={styles.subtitle}>Summarize shortages by outlet, item, and warehouse.</p>
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
            <h2 className={styles.filterTitle}>Types</h2>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={includeOrder} onChange={(event) => setIncludeOrder(event.target.checked)} />
              <span>Order shortages</span>
            </label>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={includeRecipe} onChange={(event) => setIncludeRecipe(event.target.checked)} />
              <span>Recipe shortages</span>
            </label>
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
              Minimum shortage total
              <input
                className={styles.textInput}
                type="number"
                min="0"
                step="0.001"
                value={shortageMin}
                onChange={(event) => setShortageMin(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className={styles.actionsRow}>
          <button className={styles.primaryButton} onClick={runReport} disabled={loading || selectedOutletIds.length === 0}>
            {loading ? "Running..." : "Run Report"}
          </button>
          <button className={styles.secondaryButton} onClick={downloadCsv} disabled={rows.length === 0}>
            Download CSV
          </button>
          <span className={styles.muted}>{reportAt ? `Last run: ${reportAt}` : ""}</span>
          <span className={styles.muted}>Results limited to 2,000 logs.</span>
        </section>

        {error ? <p className={styles.error}>Error: {error}</p> : null}

        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Rows</p>
            <p className={styles.summaryValue}>{totals.rows}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Outlets</p>
            <p className={styles.summaryValue}>{totals.outlets}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total Shortage</p>
            <p className={styles.summaryValue}>{formatQty(totals.totalShortage)}</p>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Shortage Summary</h2>
            <p className={styles.tableNote}>{rows.length} rows matched filters</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Outlet</th>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Warehouse</th>
                  <th className={styles.rightAlign}>Events</th>
                  <th className={styles.rightAlign}>Total Shortage</th>
                  <th>Latest</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.emptyState}>
                      {loading ? "Loading report..." : "No shortages match the current filters."}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.outlet_name}</td>
                      <td>{row.item_name}</td>
                      <td className={styles.kindCell}>{row.kind}</td>
                      <td>{row.warehouse_name}</td>
                      <td className={styles.rightAlign}>{row.event_count}</td>
                      <td className={styles.rightAlign}>{formatQty(row.shortage_total)}</td>
                      <td>{row.latest_at}</td>
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
