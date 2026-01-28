"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "./outlet-warehouse-balances.module.css";

type OutletOption = {
  id: string;
  name: string;
};

type WarehouseOption = {
  id: string;
  name: string | null;
  code: string | null;
};

type StockItem = {
  item_id: string;
  item_name: string | null;
  variant_key: string | null;
  net_units: number | null;
  item_kind: "raw" | "ingredient" | "finished" | string | null;
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

function formatQty(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatQtyWithUom(value: number | null, uom?: string): { text: string; uom: string } {
  if (value === null || Number.isNaN(value)) return { text: "-", uom: uom ?? "" };
  const unit = (uom ?? "").toLowerCase();
  const abs = Math.abs(value);

  if (unit === "g" && abs >= 1000) {
    return { text: (value / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }), uom: "kg" };
  }
  if (unit === "mg" && abs >= 1000) {
    return { text: (value / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }), uom: "g" };
  }
  if (unit === "ml" && abs >= 1000) {
    return { text: (value / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }), uom: "l" };
  }

  return { text: value.toLocaleString(undefined, { maximumFractionDigits: 3 }), uom: uom ?? "" };
}

export default function OutletWarehouseBalancesPage() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const { status } = useWarehouseAuth();

  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [linkedWarehouseIds, setLinkedWarehouseIds] = useState<string[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [variantNames, setVariantNames] = useState<Record<string, string>>({});
  const [itemUoms, setItemUoms] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [includeIngredients, setIncludeIngredients] = useState(true);
  const [includeRaw, setIncludeRaw] = useState(true);
  const [includeFinished, setIncludeFinished] = useState(false);
  const [baseOnly, setBaseOnly] = useState(false);

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
        if (selectedOutletIds.length === 0 && mapped.length > 0) {
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

  useEffect(() => {
    if (status !== "ok") return;
    if (selectedOutletIds.length === 0) {
      setWarehouses([]);
      setLinkedWarehouseIds([]);
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
          .in("outlet_id", selectedOutletIds)
          .eq("show_in_stocktake", true);

        if (outletWarehouseError) throw outletWarehouseError;
        const warehouseIds = Array.from(
          new Set((outletWarehouseRows ?? []).map((row) => row?.warehouse_id).filter(Boolean))
        ) as string[];

        setLinkedWarehouseIds(warehouseIds);
        if (warehouseIds.length === 0) {
          setWarehouses([]);
          setSelectedWarehouseId("");
          return;
        }

        const { data, error: warehouseError } = await supabase
          .from("warehouses")
          .select("id,name,code,active")
          .in("id", warehouseIds)
          .order("name", { ascending: true });

        if (warehouseError) throw warehouseError;
        if (!active) return;

        const filtered = (data || []).filter((row) => row.active ?? true) as WarehouseOption[];
        const withAll = [{ id: "all", name: "All linked warehouses", code: null }, ...filtered];
        setWarehouses(withAll);
        const isValidSelection = selectedWarehouseId && withAll.some((warehouse) => warehouse.id === selectedWarehouseId);
        if (!isValidSelection && withAll.length > 0) {
          setSelectedWarehouseId(withAll[0].id);
        }
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      }
    };

    loadWarehouses();

    return () => {
      active = false;
    };
  }, [status, selectedOutletIds, selectedWarehouseId, supabase]);

  useEffect(() => {
    if (status !== "ok" || !selectedWarehouseId) return;
    let active = true;

    const loadItems = async () => {
      try {
        setLoading(true);
        setError(null);

        const kinds: string[] = [];
        if (includeIngredients) kinds.push("ingredient");
        if (includeRaw) kinds.push("raw");
        if (includeFinished) kinds.push("finished");

        if (kinds.length === 0) {
          if (active) setItems([]);
          return;
        }

        const warehouseIds = selectedWarehouseId === "all" ? linkedWarehouseIds : [selectedWarehouseId];
        if (warehouseIds.length === 0) {
          if (active) setItems([]);
          return;
        }

        const searchValue = search.trim() || null;

        const { data: periodRows, error: periodError } = await supabase
          .from("warehouse_stock_periods")
          .select("id,warehouse_id,opened_at")
          .in("warehouse_id", warehouseIds)
          .eq("status", "open")
          .order("opened_at", { ascending: false });

        if (periodError) throw periodError;
        const latestOpenByWarehouse = new Map<string, string>();
        (periodRows ?? []).forEach((row) => {
          if (!row?.warehouse_id || !row?.id) return;
          if (!latestOpenByWarehouse.has(row.warehouse_id)) {
            latestOpenByWarehouse.set(row.warehouse_id, row.id);
          }
        });
        const periodIds = Array.from(latestOpenByWarehouse.values());
        if (periodIds.length === 0) {
          if (active) setItems([]);
          return;
        }

        const { data: countRows, error: countError } = await supabase
          .from("warehouse_stock_counts")
          .select("item_id,variant_key,period_id")
          .in("period_id", periodIds);

        if (countError) throw countError;
        const countedKeys = new Set(
          (countRows ?? [])
            .map((row) => `${row?.item_id}::${(row?.variant_key ?? "base").toLowerCase()}`)
            .filter((key) => key && !key.startsWith("undefined::"))
        );

        const fetchWarehouseItems = async (warehouseId: string) => {
          const { data, error } = await supabase.rpc("list_warehouse_items", {
            p_warehouse_id: warehouseId,
            p_outlet_id: null,
            p_search: searchValue,
          });
          if (error) throw error;
          return ((data as StockItem[]) || []).filter((row) => {
            if (!row) return false;
            const kind = row.item_kind ?? "";
            if (!kinds.includes(kind)) return false;
            const key = `${row.item_id}::${(row.variant_key ?? "base").toLowerCase()}`;
            if (!countedKeys.has(key)) return false;
            if (baseOnly) {
              const vKey = (row.variant_key ?? "base").toLowerCase();
              if (vKey !== "base") return false;
            }
            return true;
          });
        };

        const fetchedLists = await Promise.all(warehouseIds.map(fetchWarehouseItems));
        if (!active) return;

        const rows = fetchedLists.flat();
        if (selectedWarehouseId === "all") {
          const map = new Map<string, StockItem>();
          rows.forEach((row) => {
            const key = `${row.item_id}::${row.variant_key ?? "base"}::${row.item_kind ?? ""}`;
            const existing = map.get(key);
            if (existing) {
              existing.net_units = (existing.net_units ?? 0) + (row.net_units ?? 0);
            } else {
              map.set(key, { ...row, net_units: row.net_units ?? 0 });
            }
          });
          const aggregated = Array.from(map.values()).sort((a, b) =>
            (a.item_name ?? "").localeCompare(b.item_name ?? "")
          );
          setItems(aggregated);
        } else {
          setItems(rows);
        }
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    };

    loadItems();

    return () => {
      active = false;
    };
  }, [
    status,
    selectedWarehouseId,
    linkedWarehouseIds,
    includeIngredients,
    includeRaw,
    includeFinished,
    baseOnly,
    search,
    supabase,
  ]);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadVariantNames = async () => {
      try {
        const ids = Array.from(new Set(items.map((item) => item.item_id).filter(Boolean)));
        if (ids.length === 0) {
          if (active) setVariantNames({});
          return;
        }

        const { data, error } = await supabase
          .from("catalog_items")
          .select("id,variants,consumption_unit,consumption_uom")
          .in("id", ids);

        if (error) throw error;
        if (!active) return;

        const map: Record<string, string> = {};
        const uomMap: Record<string, string> = {};
        (data || []).forEach((row) => {
          const fallbackUom = row.consumption_unit ?? row.consumption_uom ?? "each";
          if (row.id) uomMap[row.id] = fallbackUom;
          const variants = Array.isArray(row.variants) ? row.variants : [];
          variants.forEach((variant: { id?: string; key?: string; name?: string }) => {
            const name = variant?.name?.trim();
            if (!name) return;
            if (variant?.id) map[variant.id] = name;
            if (variant?.key) map[variant.key] = name;
          });
        });

        setVariantNames(map);
        setItemUoms(uomMap);
      } catch {
        if (active) {
          setVariantNames({});
          setItemUoms({});
        }
      }
    };

    loadVariantNames();

    return () => {
      active = false;
    };
  }, [items, status, supabase]);

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Outlet Warehouse Balances</h1>
            <p className={styles.subtitle}>Live ingredient and raw stock remaining for the selected outlet warehouse.</p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={handleBackOne} className={styles.backButton}>Back</button>
            <button onClick={handleBack} className={styles.backButton}>Back to Dashboard</button>
          </div>
        </header>

        <section className={styles.filtersCard}>
          <div className={styles.filterRow}>
            <div className={styles.filterLabel}>
              Outlet
              <div className={styles.outletActions}>
                <button type="button" className={styles.ghostButton} onClick={selectAllOutlets} disabled={booting}>
                  Select all
                </button>
                <button type="button" className={styles.ghostButton} onClick={clearOutlets} disabled={booting}>
                  Clear
                </button>
              </div>
              <div className={styles.outletList}>
                {outlets.length === 0 ? (
                  <span className={styles.emptyNote}>No outlets found</span>
                ) : (
                  outlets.map((outlet) => (
                    <label key={outlet.id} className={styles.outletRow}>
                      <input
                        type="checkbox"
                        checked={selectedOutletIds.includes(outlet.id)}
                        onChange={() => {
                          toggleOutlet(outlet.id);
                          setSelectedWarehouseId("");
                        }}
                        disabled={booting}
                      />
                      <span>{outlet.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <label className={styles.filterLabel}>
              Warehouse
              <select
                className={styles.select}
                value={selectedWarehouseId}
                onChange={(event) => setSelectedWarehouseId(event.target.value)}
                disabled={selectedOutletIds.length === 0}
              >
                {warehouses.length === 0 ? (
                  <option value="">No warehouses found</option>
                ) : (
                  warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name || warehouse.code || warehouse.id}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className={styles.filterLabel}>
              Search
              <input
                className={styles.input}
                placeholder="Search item name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          <div className={styles.filterRow}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={includeIngredients}
                onChange={(event) => setIncludeIngredients(event.target.checked)}
              />
              Ingredients
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={includeRaw}
                onChange={(event) => setIncludeRaw(event.target.checked)}
              />
              Raw
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={includeFinished}
                onChange={(event) => setIncludeFinished(event.target.checked)}
              />
              Finished
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={baseOnly}
                onChange={(event) => setBaseOnly(event.target.checked)}
              />
              Base only
            </label>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <p className={styles.tableTitle}>Live Balances</p>
              <p className={styles.tableSubtitle}>
                Showing {items.length} items
                {selectedWarehouseId === "all" && linkedWarehouseIds.length > 0
                  ? ` · Summed across ${linkedWarehouseIds.length} warehouses`
                  : ""}
              </p>
            </div>
            {loading && <span className={styles.loadingTag}>Refreshing…</span>}
          </div>

          {error && <p className={styles.errorBanner}>{error}</p>}

          <div className={styles.table}>
            <div className={`${styles.tableRow} ${styles.tableHead}`}>
              <span>Item</span>
              <span>Variant</span>
              <span>Kind</span>
              <span className={styles.alignRight}>Net Units</span>
            </div>

            {items.map((item) => (
              <div key={`${item.item_id}-${item.variant_key ?? "base"}`} className={styles.tableRow}>
                <span>{item.item_name || item.item_id}</span>
                <span>{variantNames[item.variant_key ?? ""] || item.variant_key || "base"}</span>
                <span className={styles.kindTag}>{item.item_kind || "-"}</span>
                <span className={`${styles.alignRight} ${item.net_units !== null && item.net_units < 0 ? styles.negative : ""}`}>
                  {(() => {
                    const formatted = formatQtyWithUom(item.net_units, itemUoms[item.item_id]);
                    return `${formatted.text} ${formatted.uom}`.trim();
                  })()}
                </span>
              </div>
            ))}

            {!loading && items.length === 0 && (
              <div className={styles.emptyState}>No balances found for the current filters.</div>
            )}
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
