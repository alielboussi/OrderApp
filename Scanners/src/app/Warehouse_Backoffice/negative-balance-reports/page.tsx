"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "../reports/reports.module.css";
import { buildNegativeBalancePdfHtml } from "./reportpdf";

type OutletOption = { id: string; name: string };

type LogRow = {
  id: string;
  created_at: string;
  action: string | null;
  details: Record<string, unknown> | null;
};

type NegativeRow = {
  id: string;
  created_at: string;
  created_at_iso: string;
  created_at_epoch: number;
  outlet_id: string | null;
  outlet_name: string;
  kind: "order" | "recipe";
  item_id: string | null;
  item_name: string;
  order_id: string | null;
  order_number: string | null;
  recipe_for_id: string | null;
  related_label: string;
  warehouse_id: string | null;
  warehouse_name: string;
  requested_qty: number;
  available_qty: number | null;
  shortage_qty: number;
};

type WhoAmIRoles = {
  outlets: Array<{ outlet_id: string; outlet_name: string }> | null;
};

type OutletRow = { id: string; name: string | null };

type WarehouseRow = { id: string; name: string | null };

type CatalogItem = { id: string; name: string | null };

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

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
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

export default function NegativeBalanceReportsPage() {
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
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [shortageMin, setShortageMin] = useState("0");
  const [rows, setRows] = useState<NegativeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
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

  const clearFilters = () => {
    setStartDate(toDateInputValue(lastWeek));
    setEndDate(toDateInputValue(today));
    setIncludeOrder(true);
    setIncludeRecipe(true);
    setItemSearch("");
    setWarehouseSearch("");
    setShortageMin("0");
    setSelectedOutletIds(outlets.map((outlet) => outlet.id));
    setTimeout(() => {
      void runReport();
    }, 0);
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

      const mapped = logs.map((log) => {
        const details = log.details ?? {};
        const action = log.action ?? "";
        const outletId = getString(details.outlet_id);
        const warehouseId = getString(details.warehouse_id);
        const itemId = getString(details.product_id) ?? getString(details.component_id);
        const orderId = getString(details.order_id);
        const orderNumber = getString(details.order_number);
        const recipeForId = getString(details.recipe_for);
        const recipeForName = recipeForId ? itemMap.get(recipeForId) ?? recipeForId : null;

        const requestedQty = toNumber(details.requested_qty ?? details.qty ?? details.component_qty);
        const availableQty = details.available == null ? null : toNumber(details.available);
        const remainingQty = toNumber(details.remaining_qty);
        const shortage = action === "order_negative_balance"
          ? Math.max(requestedQty - (availableQty ?? 0), 0)
          : remainingQty;

        const kind = action === "order_negative_balance" ? "order" : "recipe";
        const itemName = itemId ? itemMap.get(itemId) ?? itemId : "Unknown";
        const relatedLabel = kind === "order"
          ? `Order ${orderNumber ?? "-"}`
          : `Recipe for ${recipeForName ?? recipeForId ?? "-"}`;

        return {
          id: log.id,
          created_at: new Date(log.created_at).toLocaleString(),
          created_at_iso: log.created_at,
          created_at_epoch: new Date(log.created_at).getTime(),
          outlet_id: outletId,
          outlet_name: outletId ? outletMap.get(outletId) ?? outletId : "Unknown",
          kind,
          item_id: itemId,
          item_name: itemName,
          order_id: orderId,
          order_number: orderNumber,
          recipe_for_id: recipeForId,
          related_label: relatedLabel,
          warehouse_id: warehouseId,
          warehouse_name: warehouseId ? warehouseMap.get(warehouseId) ?? warehouseId : "Unknown",
          requested_qty: requestedQty,
          available_qty: availableQty,
          shortage_qty: shortage,
        } as NegativeRow;
      });

      setRows(mapped);
      setReportAt(new Date().toLocaleString());
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const itemQuery = itemSearch.trim().toLowerCase();
    const warehouseQuery = warehouseSearch.trim().toLowerCase();
    const minShortage = Math.max(0, toNumber(shortageMin));

    return rows.filter((row) => {
      if (selectedOutletIds.length > 0 && row.outlet_id && !selectedOutletIds.includes(row.outlet_id)) return false;
      if (itemQuery && !row.item_name.toLowerCase().includes(itemQuery)) return false;
      if (warehouseQuery && !row.warehouse_name.toLowerCase().includes(warehouseQuery)) return false;
      if (minShortage > 0 && row.shortage_qty < minShortage) return false;
      return true;
    });
  }, [rows, selectedOutletIds, itemSearch, warehouseSearch, shortageMin]);

  const totals = useMemo(() => {
    let orderCount = 0;
    let recipeCount = 0;
    let shortageTotal = 0;

    filteredRows.forEach((row) => {
      if (row.kind === "order") orderCount += 1;
      if (row.kind === "recipe") recipeCount += 1;
      shortageTotal += row.shortage_qty;
    });

    return {
      count: filteredRows.length,
      orderCount,
      recipeCount,
      shortageTotal,
    };
  }, [filteredRows]);

  const downloadCsv = () => {
    if (!filteredRows.length) return;
    const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const minShortage = Math.max(0, toNumber(shortageMin));
    const outletText = selectedOutletIds.length ? `Selected outlets (${selectedOutletIds.length})` : "All outlets";
    const rangeText = startDate && endDate ? `${startDate} to ${endDate}` : "All dates";
    const typeLabel = [includeOrder ? "order" : null, includeRecipe ? "recipe" : null].filter(Boolean).join(", ");

    const metaLines = [
      ["Report", "Negative Balance Alerts"],
      ["Outlets", outletText],
      ["Date range", rangeText],
      ["Types", typeLabel || "none"],
      ["Min shortage", minShortage.toLocaleString()],
      [
        "Totals",
        `Alerts ${totals.count}`,
        `Order ${totals.orderCount}`,
        `Recipe ${totals.recipeCount}`,
        `Shortage ${formatQty(totals.shortageTotal)}`,
      ],
      [""],
    ].map((line) => line.map(csvEscape).join(","));

    const headers = [
      "Time",
      "Outlet",
      "Type",
      "Item",
      "Related",
      "Warehouse",
      "Requested",
      "Available",
      "Shortage",
    ];
    const lines = filteredRows.map((row) => [
      row.created_at,
      row.outlet_name,
      row.kind,
      row.item_name,
      row.related_label,
      row.warehouse_name,
      row.requested_qty.toString(),
      row.available_qty == null ? "" : row.available_qty.toString(),
      row.shortage_qty.toString(),
    ].map(csvEscape).join(","));

    const csv = [...metaLines, headers.map(csvEscape).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `negative-balances-${startDate || "all"}-to-${endDate || "all"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdfReport = async () => {
    if (!filteredRows.length || pdfBusy) return;
    try {
      setPdfBusy(true);
      const outletText = selectedOutletIds.length ? `Selected outlets (${selectedOutletIds.length})` : "All outlets";
      const rangeText = startDate && endDate ? `${startDate} to ${endDate}` : "All dates";
      const minShortage = Math.max(0, toNumber(shortageMin));
      const typeLabel = [includeOrder ? "order" : null, includeRecipe ? "recipe" : null].filter(Boolean).join(", ");
      const filtersText = `Types: ${typeLabel || "none"} · Min shortage: ${minShortage.toLocaleString()}`;
      const logoDataUrl = await loadLogoDataUrl();

      const html = buildNegativeBalancePdfHtml({
        outletText,
        rangeText,
        filtersText,
        logoDataUrl,
        rows: filteredRows.map((row) => ({
          created_at: row.created_at,
          outlet_name: row.outlet_name,
          kind: row.kind,
          item_name: row.item_name,
          related_label: row.related_label,
          warehouse_name: row.warehouse_name,
          requested_qty: row.requested_qty,
          available_qty: row.available_qty,
          shortage_qty: row.shortage_qty,
        })),
        totals,
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
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      };

      setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(cleanup, 1000);
      }, 400);
    } finally {
      setPdfBusy(false);
    }
  };

  const openContext = (row: NegativeRow) => {
    if (row.kind === "order") {
      const params = new URLSearchParams();
      if (row.outlet_id) params.set("outletId", row.outlet_id);
      if (row.order_number) params.set("orderNumber", row.order_number);
      if (row.order_id) params.set("orderId", row.order_id);
      if (row.created_at_iso) params.set("date", row.created_at_iso.slice(0, 10));
      router.push(`/Warehouse_Backoffice/outlet-orders?${params.toString()}`);
      return;
    }

    const targetId = row.recipe_for_id ?? row.item_id;
    if (targetId) {
      const params = new URLSearchParams();
      params.set("mode", "finished");
      params.set("finishedId", targetId);
      router.push(`/Warehouse_Backoffice/recipes?${params.toString()}`);
    }
  };

  useEffect(() => {
    if (status !== "ok" || booting || selectedOutletIds.length === 0) return;
    void runReport();
  }, [status, booting, selectedOutletIds.length, includeOrder, includeRecipe, startDate, endDate]);

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Negative Balance Alerts</h1>
            <p className={styles.subtitle}>Track recipe and order shortages logged during deductions.</p>
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
              Warehouse contains
              <input
                className={styles.textInput}
                placeholder="Search warehouse"
                value={warehouseSearch}
                onChange={(event) => setWarehouseSearch(event.target.value)}
              />
            </label>
          </div>

          <div className={styles.filterCard}>
            <h2 className={styles.filterTitle}>Shortage Threshold</h2>
            <label className={styles.inputLabel}>
              Minimum shortage quantity
              <input
                className={styles.textInput}
                type="number"
                min="0"
                step="0.001"
                value={shortageMin}
                onChange={(event) => setShortageMin(event.target.value)}
              />
            </label>
            <p className={styles.smallNote}>Use 0 to show all rows.</p>
          </div>
        </section>

        <section className={styles.actionsRow}>
          <button className={styles.primaryButton} onClick={runReport} disabled={loading || selectedOutletIds.length === 0}>
            {loading ? "Running..." : "Run Report"}
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => void downloadPdfReport()}
            disabled={filteredRows.length === 0 || pdfBusy}
          >
            {pdfBusy ? "Preparing PDF..." : "Download PDF"}
          </button>
          <button className={styles.secondaryButton} onClick={downloadCsv} disabled={filteredRows.length === 0}>
            Download CSV
          </button>
          <button className={styles.ghostButton} type="button" onClick={clearFilters}>
            Clear filters
          </button>
          <span className={styles.muted}>{reportAt ? `Last run: ${reportAt}` : ""}</span>
          <span className={styles.muted}>Results limited to 2,000 logs.</span>
        </section>

        {error ? <p className={styles.error}>Error: {error}</p> : null}

        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Alerts</p>
            <p className={styles.summaryValue}>{totals.count}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Order Shortages</p>
            <p className={styles.summaryValue}>{totals.orderCount}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Recipe Shortages</p>
            <p className={styles.summaryValue}>{totals.recipeCount}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total Shortage</p>
            <p className={styles.summaryValue}>{formatQty(totals.shortageTotal)}</p>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Shortage Details</h2>
            <p className={styles.tableNote}>{filteredRows.length} rows matched filters</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Outlet</th>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Related</th>
                  <th>Warehouse</th>
                  <th className={styles.rightAlign}>Requested</th>
                  <th className={styles.rightAlign}>Available</th>
                  <th className={styles.rightAlign}>Shortage</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className={styles.emptyState}>
                      {loading ? "Loading report..." : "No shortages match the current filters."}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.created_at}</td>
                      <td>{row.outlet_name}</td>
                      <td className={styles.kindCell}>{row.kind}</td>
                      <td>{row.item_name}</td>
                      <td>{row.related_label}</td>
                      <td>{row.warehouse_name}</td>
                      <td className={styles.rightAlign}>{formatQty(row.requested_qty)}</td>
                      <td className={styles.rightAlign}>{row.available_qty == null ? "-" : formatQty(row.available_qty)}</td>
                      <td className={styles.rightAlign}>{formatQty(row.shortage_qty)}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.ghostButton}
                          onClick={() => openContext(row)}
                          disabled={row.kind === "order" ? !row.order_number && !row.order_id : !row.recipe_for_id && !row.item_id}
                        >
                          Open
                        </button>
                      </td>
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
