"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import styles from "./reports.module.css";
import { buildReportPdfHtml } from "./reportpdf";

type OutletOption = {
  id: string;
  name: string;
};

type SalesRow = {
  id: string;
  outlet_id: string;
  item_id: string;
  variant_key: string | null;
  qty_units: number | null;
  sold_at: string;
  sale_price: number | null;
  vat_exc_price: number | null;
  flavour_price: number | null;
  catalog_items?: { name: string | null; item_kind: string | null } | null;
  outlets?: { name: string | null } | null;
};

type RawSalesRow = Omit<SalesRow, "catalog_items" | "outlets"> & {
  catalog_items?: { name: string | null; item_kind: string | null }[] | { name: string | null; item_kind: string | null } | null;
  outlets?: { name: string | null }[] | { name: string | null } | null;
};

type ProductOption = {
  id: string;
  name: string | null;
  item_kind: string | null;
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

type AggregatedRow = {
  item_id: string;
  item_name: string;
  item_kind: string;
  variant_key: string;
  qty_units: number;
  before_tax: number;
  after_tax: number;
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

function parseNumber(value: number | null): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return value;
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
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

export default function WarehouseSalesReportsPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);

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
  const [itemSearch, setItemSearch] = useState("");
  const [variantSearch, setVariantSearch] = useState("");
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportAt, setReportAt] = useState<string | null>(null);
  const [hasAutoRun, setHasAutoRun] = useState(false);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productOpen, setProductOpen] = useState(false);

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

    const loadProducts = async () => {
      try {
        const { data, error: productError } = await supabase
          .from("catalog_items")
          .select("id,name,item_kind")
          .order("name", { ascending: true });

        if (productError) throw productError;
        if (!active) return;

        setProductOptions((data ?? []) as ProductOption[]);
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      }
    };

    loadProducts();

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

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const selectAllProducts = () => {
    setSelectedProductIds(productOptions.map((product) => product.id));
  };

  const clearProducts = () => {
    setSelectedProductIds([]);
  };

  const selectedOutletNames = useMemo(() => {
    if (selectedOutletIds.length === 0) return "All outlets";
    const nameMap = new Map(outlets.map((outlet) => [outlet.id, outlet.name]));
    return selectedOutletIds
      .map((id) => nameMap.get(id) ?? id)
      .filter(Boolean)
      .join(", ");
  }, [outlets, selectedOutletIds]);

  const downloadPdfReport = async () => {
    const outletText = selectedOutletNames || "All outlets";
    const rangeText = startDate && endDate ? `${startDate} to ${endDate}` : "All dates";
    const timeText = startTime || endTime ? `${startTime || "00:00"} to ${endTime || "23:59"}` : "All day";
    const logoDataUrl = await loadLogoDataUrl();

    const html = buildReportPdfHtml({
      outletText,
      rangeText,
      timeText,
      logoDataUrl,
      rows: aggregated.map((row) => ({
        item_name: row.item_name,
        qty_units: row.qty_units,
        before_tax: row.before_tax,
        after_tax: row.after_tax,
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

  const runReport = async () => {
    if (status !== "ok") return;

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("outlet_sales")
        .select(
          "id,outlet_id,item_id,variant_key,qty_units,sold_at,sale_price,vat_exc_price,flavour_price,catalog_items:catalog_items!outlet_sales_item_id_fkey(name,item_kind),outlets:outlets!outlet_sales_outlet_id_fkey(name)"
        )
        .order("sold_at", { ascending: false })
        .limit(5000);

      if (selectedOutletIds.length > 0) {
        query = query.in("outlet_id", selectedOutletIds);
      }

      if (startDate) {
        const startIso = new Date(`${startDate}T${startTime || "00:00"}:00`).toISOString();
        query = query.gte("sold_at", startIso);
      }

      if (endDate) {
        if (endTime) {
          const endIso = new Date(`${endDate}T${endTime}:00`).toISOString();
          query = query.lte("sold_at", endIso);
        } else {
          const end = new Date(`${endDate}T00:00:00`);
          end.setDate(end.getDate() + 1);
          query = query.lt("sold_at", end.toISOString());
        }
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      const normalized = ((data ?? []) as RawSalesRow[]).map((row) => ({
        ...row,
        catalog_items: normalizeRelation(row.catalog_items),
        outlets: normalizeRelation(row.outlets),
      }));
      setRows(normalized);
      setReportAt(new Date().toLocaleString());
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status !== "ok" || booting || selectedOutletIds.length === 0 || hasAutoRun) return;
    setHasAutoRun(true);
    void runReport();
  }, [status, booting, selectedOutletIds.length, hasAutoRun]);

  const filteredRows = useMemo(() => {
    const includeKinds: string[] = [];
    if (includeFinished) includeKinds.push("finished");
    if (includeIngredient) includeKinds.push("ingredient");
    if (includeRaw) includeKinds.push("raw");

    const hasKindFilter = includeKinds.length > 0 && includeKinds.length < 3;
    const itemQuery = itemSearch.trim().toLowerCase();
    const variantQuery = variantSearch.trim().toLowerCase();

    return rows.filter((row) => {
      const itemName = row.catalog_items?.name ?? "";
      const itemKind = (row.catalog_items?.item_kind ?? "finished").toLowerCase();
      const variantKey = (row.variant_key ?? "base").toLowerCase();

      if (itemQuery && !itemName.toLowerCase().includes(itemQuery)) return false;
      if (variantQuery && !variantKey.includes(variantQuery)) return false;
      if (hasKindFilter && !includeKinds.includes(itemKind)) return false;
      if (selectedProductIds.length > 0 && !selectedProductIds.includes(row.item_id)) return false;

      return true;
    });
  }, [rows, includeFinished, includeIngredient, includeRaw, itemSearch, variantSearch, selectedProductIds]);

  const aggregated = useMemo(() => {
    const map = new Map<string, AggregatedRow>();

    filteredRows.forEach((row) => {
      const qty = parseNumber(row.qty_units);
      if (qty === 0) return;

      const afterUnit = parseNumber(row.sale_price) || parseNumber(row.flavour_price) || parseNumber(row.vat_exc_price);
      const beforeUnit = parseNumber(row.vat_exc_price) || parseNumber(row.sale_price) || parseNumber(row.flavour_price);

      const after = roundCurrency(afterUnit * qty);
      const before = beforeUnit * qty;

      const key = `${row.item_id}|${row.variant_key ?? "base"}`;
      const existing = map.get(key);
      if (existing) {
        existing.qty_units += qty;
        existing.before_tax += before;
        existing.after_tax += after;
        return;
      }

      map.set(key, {
        item_id: row.item_id,
        item_name: row.catalog_items?.name ?? "Unknown item",
        item_kind: row.catalog_items?.item_kind ?? "finished",
        variant_key: row.variant_key ?? "base",
        qty_units: qty,
        before_tax: before,
        after_tax: after,
      });
    });

    return Array.from(map.values()).sort((a, b) => b.after_tax - a.after_tax);
  }, [filteredRows]);

  const totals = useMemo(() => {
    let qty = 0;
    let before = 0;
    let after = 0;

    aggregated.forEach((row) => {
      qty += row.qty_units;
      before += row.before_tax;
      after += row.after_tax;
    });

    return { qty, before, after: roundCurrency(after) };
  }, [aggregated]);

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Outlet Sales Reports</h1>
            <p className={styles.subtitle}>Filter sales by outlet, date, and product type. Totals use outlet_sales sale and VAT exclusive prices.</p>
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
            <div className={styles.filterHeader}>
              <h2 className={styles.filterTitle}>Products</h2>
              <div className={styles.filterActions}>
                <button type="button" className={styles.ghostButton} onClick={selectAllProducts}>
                  Select all
                </button>
                <button type="button" className={styles.ghostButton} onClick={clearProducts}>
                  Clear
                </button>
              </div>
            </div>
            <div className={styles.dropdown}>
              <button type="button" className={styles.dropdownButton} onClick={() => setProductOpen((prev) => !prev)}>
                {selectedProductIds.length === 0
                  ? "All products"
                  : `${selectedProductIds.length} selected`}
              </button>
              {productOpen ? (
                <div className={styles.dropdownPanel}>
                  {productOptions.length === 0 ? (
                    <p className={styles.muted}>No products found.</p>
                  ) : (
                    productOptions.map((product) => (
                      <label key={product.id} className={styles.checkboxRow}>
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(product.id)}
                          onChange={() => toggleProduct(product.id)}
                        />
                        <span>{product.name ?? "Unnamed item"}</span>
                      </label>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <p className={styles.smallNote}>Selected: {selectedProductIds.length || "All"}</p>
          </div>

          <div className={styles.filterCard}>
            <h2 className={styles.filterTitle}>Date Range</h2>
            <label className={styles.inputLabel}>
              Start date
              <input className={styles.textInput} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className={styles.inputLabel}>
              Start time
              <input className={styles.textInput} type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
            <label className={styles.inputLabel}>
              End date
              <input className={styles.textInput} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label className={styles.inputLabel}>
              End time
              <input className={styles.textInput} type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </label>
            <p className={styles.smallNote}>Leave time blank to include the full day.</p>
          </div>

          <div className={styles.filterCard}>
            <h2 className={styles.filterTitle}>Item Filters</h2>
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
              Variant key contains
              <input
                className={styles.textInput}
                placeholder="base, spicy, etc"
                value={variantSearch}
                onChange={(event) => setVariantSearch(event.target.value)}
              />
            </label>
          </div>

          <div className={styles.filterCard}>
            <h2 className={styles.filterTitle}>Kinds</h2>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={includeFinished} onChange={(event) => setIncludeFinished(event.target.checked)} />
              <span>Finished items</span>
            </label>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={includeIngredient} onChange={(event) => setIncludeIngredient(event.target.checked)} />
              <span>Ingredients</span>
            </label>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={includeRaw} onChange={(event) => setIncludeRaw(event.target.checked)} />
              <span>Raw items</span>
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
            disabled={aggregated.length === 0}
          >
            Download PDF
          </button>
          <span className={styles.muted}>{reportAt ? `Last run: ${reportAt}` : ""}</span>
          <span className={styles.muted}>Results limited to 5,000 rows.</span>
        </section>

        {error ? <p className={styles.error}>Error: {error}</p> : null}

        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Sales Before Tax</p>
            <p className={styles.summaryValue}>{formatCurrency(totals.before)}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Sales After Tax</p>
            <p className={styles.summaryValue}>{formatCurrency(totals.after)}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Units Sold</p>
            <p className={styles.summaryValue}>{formatQty(totals.qty)}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Items in Report</p>
            <p className={styles.summaryValue}>{aggregated.length}</p>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Sales by Item & Variant</h2>
            <p className={styles.tableNote}>{filteredRows.length} rows matched filters</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Kind</th>
                  <th>Variant</th>
                  <th className={styles.rightAlign}>Units</th>
                  <th className={styles.rightAlign}>Before Tax</th>
                  <th className={styles.rightAlign}>After Tax</th>
                </tr>
              </thead>
              <tbody>
                {aggregated.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      {loading ? "Loading report..." : "No sales match the current filters."}
                    </td>
                  </tr>
                ) : (
                  aggregated.map((row) => (
                    <tr key={`${row.item_id}-${row.variant_key}`}>
                      <td>{row.item_name}</td>
                      <td className={styles.kindCell}>{row.item_kind}</td>
                      <td>{row.variant_key}</td>
                      <td className={styles.rightAlign}>{formatQty(row.qty_units)}</td>
                      <td className={styles.rightAlign}>{formatCurrency(row.before_tax)}</td>
                      <td className={styles.rightAlign}>{formatCurrency(row.after_tax)}</td>
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
