"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "./outlet-warehouse-balances.module.css";
import { COLDROOM_CHILD_IDS, COLDROOM_PARENT_ID, COLDROOM_WAREHOUSES } from "@/lib/coldrooms";

type OutletOption = {
  id: string;
  name: string;
};

type StockItem = {
  item_id: string;
  item_name: string | null;
  variant_key: string | null;
  net_units: number | null;
  sold_units?: number | null;
  item_kind: "raw" | "ingredient" | "finished" | string | null;
};


type OrderTotals = {
  count: number;
  qty: number;
  amount: number;
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


function formatUomLabel(raw?: string | null): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";
  const key = trimmed.toLowerCase();
  switch (key) {
    case "g":
    case "gram":
    case "grams":
    case "g(s)":
      return "Gram(s)";
    case "kg":
    case "kilogram":
    case "kilograms":
    case "kg(s)":
      return "Kilogram(s)";
    case "mg":
    case "milligram":
    case "milligrams":
    case "mg(s)":
      return "Milligram(s)";
    case "ml":
    case "millilitre":
    case "millilitres":
    case "ml(s)":
      return "Millilitre(s)";
    case "l":
    case "litre":
    case "litres":
    case "l(s)":
      return "Litre(s)";
    case "each":
      return "Each";
    case "pc":
    case "pcs":
    case "pc(s)":
      return "Pc(s)";
    case "case":
    case "case(s)":
      return "Case(s)";
    case "crate":
    case "crate(s)":
      return "Crate(s)";
    case "bottle":
    case "bottle(s)":
      return "Bottle(s)";
    case "tin can":
    case "tin can(s)":
      return "Tin Can(s)";
    case "jar":
    case "jar(s)":
      return "Jar(s)";
    case "plastic":
    case "plastic(s)":
      return "Plastic(s)";
    case "packet":
    case "packet(s)":
      return "Packet(s)";
    case "box":
    case "box(es)":
      return "Box(es)";
    case "bag":
    case "bag(s)":
      return "Bag(s)";
    case "bucket":
    case "bucket(s)":
      return "Bucket(s)";
    default: {
      const capitalized = trimmed.replace(/\b\w/g, (char) => char.toUpperCase());
      return capitalized.endsWith("(s)") ? capitalized : `${capitalized}(s)`;
    }
  }
}

function formatQtyWithUom(value: number | null, uom?: string): { text: string; uom: string; detail?: string } {
  if (value === null || Number.isNaN(value)) return { text: "-", uom: formatUomLabel(uom) };
  const unit = (uom ?? "").toLowerCase();
  const abs = Math.abs(value);
  const isKgUnit = unit === "kg" || unit === "kilogram" || unit === "kilograms" || unit === "kg(s)";

  if (unit === "g" && abs >= 1000) {
    return { text: (value / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }), uom: formatUomLabel("kg") };
  }
  if (unit === "mg" && abs >= 1000) {
    return { text: (value / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }), uom: formatUomLabel("g") };
  }
  if (unit === "ml" && abs >= 1000) {
    return { text: (value / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }), uom: formatUomLabel("l") };
  }
  if (isKgUnit) {
    const sign = value < 0 ? "-" : "";
    const wholeKg = Math.floor(abs);
    let remainderGrams = Math.round((abs - wholeKg) * 1000);
    let kgDisplay = wholeKg;
    if (remainderGrams === 1000) {
      kgDisplay += 1;
      remainderGrams = 0;
    }
    const detail = remainderGrams > 0
      ? `${remainderGrams.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${formatUomLabel("g")}`
      : undefined;
    return {
      text: `${sign}${kgDisplay.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      uom: formatUomLabel("kg"),
      detail
    };
  }

  return { text: value.toLocaleString(undefined, { maximumFractionDigits: 3 }), uom: formatUomLabel(uom) };
}

function normalizeVariantKey(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length ? trimmed : "base";
}

export default function OutletWarehouseBalancesPage() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const { status } = useWarehouseAuth();

  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [selectedBalanceWarehouseIds, setSelectedBalanceWarehouseIds] = useState<string[]>([]);
  const [linkedWarehouseIds, setLinkedWarehouseIds] = useState<string[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [variantNames, setVariantNames] = useState<Record<string, string>>({});
  const [itemUoms, setItemUoms] = useState<Record<string, string>>({});
  const [itemPackMass, setItemPackMass] = useState<Record<string, { mass: number | null; uom: string | null }>>({});
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [orderDate, setOrderDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [orderTotals, setOrderTotals] = useState<OrderTotals>({ count: 0, qty: 0, amount: 0 });
  const [ordersLoading, setOrdersLoading] = useState(false);

  const search = "";
  const [includeIngredients, setIncludeIngredients] = useState(true);
  const [includeRaw, setIncludeRaw] = useState(true);
  const [includeFinished, setIncludeFinished] = useState(true);
  const [baseOnly, setBaseOnly] = useState(false);
  const [showPackWeightTotals, setShowPackWeightTotals] = useState(false);

  const coldroomChildSet = useMemo(() => new Set(COLDROOM_CHILD_IDS), []);
  const coldroomLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    COLDROOM_WAREHOUSES.forEach((warehouse) => {
      map.set(warehouse.id, warehouse.name);
    });
    return map;
  }, []);

  const itemHasVariants = useMemo(() => {
    const map = new Map<string, boolean>();
    items.forEach((item) => {
      const vKey = normalizeVariantKey(item.variant_key).toLowerCase();
      if (vKey !== "base") {
        map.set(item.item_id, true);
      } else if (!map.has(item.item_id)) {
        map.set(item.item_id, false);
      }
    });
    return map;
  }, [items]);

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  useEffect(() => {
    if (status !== "ok") return;
    const timer = setInterval(() => setRefreshTick((value) => value + 1), 30000);
    return () => clearInterval(timer);
  }, [status]);

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

  const coldroomLinkedIds = useMemo(() => {
    const set = new Set<string>();
    linkedWarehouseIds.forEach((id) => {
      if (id === COLDROOM_PARENT_ID || coldroomChildSet.has(id)) {
        set.add(id);
      }
    });
    if (set.has(COLDROOM_PARENT_ID)) {
      COLDROOM_CHILD_IDS.forEach((childId) => set.add(childId));
    }
    if (!set.has(COLDROOM_PARENT_ID)) {
      const hasChild = COLDROOM_CHILD_IDS.some((childId) => set.has(childId));
      if (hasChild) set.add(COLDROOM_PARENT_ID);
    }
    return Array.from(set);
  }, [linkedWarehouseIds, coldroomChildSet]);

  const hasColdroomBalances = coldroomLinkedIds.length > 0;
  const coldroomWarehouseOptions = useMemo(
    () => coldroomLinkedIds.map((id) => ({ id, name: coldroomLabelMap.get(id) ?? id })),
    [coldroomLinkedIds, coldroomLabelMap]
  );

  const toggleBalanceWarehouse = (id: string) => {
    setSelectedBalanceWarehouseIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const selectAllBalanceWarehouses = () => {
    setSelectedBalanceWarehouseIds(coldroomLinkedIds);
  };

  const clearBalanceWarehouses = () => {
    setSelectedBalanceWarehouseIds([]);
  };

  useEffect(() => {
    if (status !== "ok") return;
    if (selectedOutletIds.length === 0) {
      setLinkedWarehouseIds([]);
      setSelectedWarehouseId("");
      setSelectedBalanceWarehouseIds([]);
      return;
    }
    let active = true;

    const loadWarehouses = async () => {
      try {
        setError(null);
        const { data: outletWarehouseRows, error: outletWarehouseError } = await supabase
          .from("outlet_warehouses")
          .select("warehouse_id")
          .in("outlet_id", selectedOutletIds);

        if (outletWarehouseError) throw outletWarehouseError;
        const warehouseIds = Array.from(
          new Set((outletWarehouseRows ?? []).map((row) => row?.warehouse_id).filter(Boolean))
        ) as string[];

        setLinkedWarehouseIds(warehouseIds);
        if (!active) return;
        if (warehouseIds.length === 0) {
          setSelectedWarehouseId("");
          return;
        }

        setSelectedWarehouseId("all");
        setSelectedBalanceWarehouseIds([]);
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      }
    };

    loadWarehouses();

    return () => {
      active = false;
    };
  }, [status, selectedOutletIds, supabase]);

  useEffect(() => {
    if (status !== "ok") return;
    if (selectedOutletIds.length === 0) return;

    if (hasColdroomBalances) {
      setSelectedBalanceWarehouseIds((prev) => (prev.length ? prev : coldroomLinkedIds));
    } else {
      setSelectedBalanceWarehouseIds([]);
    }
  }, [status, hasColdroomBalances, coldroomLinkedIds, selectedOutletIds.length]);

  useEffect(() => {
    if (status !== "ok") return;
    if (selectedOutletIds.length === 0 || !orderDate) {
      setOrderTotals({ count: 0, qty: 0, amount: 0 });
      return;
    }
    let active = true;

    const loadOrderTotals = async () => {
      try {
        setOrdersLoading(true);
        const start = new Date(orderDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 1);

        const { data: ordersData, error: ordersError } = await supabase
          .from("orders")
          .select("id")
          .in("outlet_id", selectedOutletIds)
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString());

        if (ordersError) throw ordersError;
        const orderIds = (ordersData || []).map((row) => row.id).filter(Boolean) as string[];

        if (!active) return;
        if (orderIds.length === 0) {
          setOrderTotals({ count: 0, qty: 0, amount: 0 });
          return;
        }

        const { data: itemsData, error: itemsError } = await supabase
          .from("order_items")
          .select("order_id,qty,cost,amount")
          .in("order_id", orderIds);

        if (itemsError) throw itemsError;

        const totals = (itemsData || []).reduce(
          (acc, row) => {
            const qty = typeof row.qty === "number" ? row.qty : 0;
            const cost = typeof row.cost === "number" ? row.cost : 0;
            const amount = typeof row.amount === "number" ? row.amount : cost * qty;
            acc.qty += qty;
            acc.amount += amount;
            return acc;
          },
          { count: orderIds.length, qty: 0, amount: 0 }
        );

        if (!active) return;
        setOrderTotals(totals);
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      } finally {
        if (active) setOrdersLoading(false);
      }
    };

    loadOrderTotals();

    return () => {
      active = false;
    };
  }, [status, selectedOutletIds, orderDate, supabase]);

  useEffect(() => {
    const hasSelection = hasColdroomBalances
      ? selectedBalanceWarehouseIds.length > 0
      : Boolean(selectedWarehouseId);
    if (status !== "ok" || !hasSelection) {
      setItems([]);
      return;
    }
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

        let warehouseIds: string[] = [];
        if (hasColdroomBalances) {
          const set = new Set<string>();
          selectedBalanceWarehouseIds.forEach((id) => {
            if (id === COLDROOM_PARENT_ID) {
              COLDROOM_CHILD_IDS.forEach((childId) => set.add(childId));
              return;
            }
            if (coldroomChildSet.has(id)) {
              set.add(id);
              return;
            }
            set.add(id);
          });
          warehouseIds = Array.from(set);
        } else if (selectedWarehouseId === "all") {
          warehouseIds = linkedWarehouseIds;
        } else if (selectedWarehouseId === COLDROOM_PARENT_ID) {
          warehouseIds = COLDROOM_CHILD_IDS;
        } else if (coldroomChildSet.has(selectedWarehouseId)) {
          warehouseIds = [selectedWarehouseId];
        } else {
          warehouseIds = [selectedWarehouseId];
        }
        if (warehouseIds.length === 0) {
          if (active) setItems([]);
          return;
        }

        const searchValue = search.trim() || null;

        let stockQuery = supabase
          .from("warehouse_stock_items")
          .select("warehouse_id,item_id,item_name,variant_key,net_units,item_kind")
          .in("warehouse_id", warehouseIds);

        if (searchValue) {
          stockQuery = stockQuery.ilike("item_name", `%${searchValue}%`);
        }

        const { data: stockRows, error: stockError } = await stockQuery;
        if (stockError) throw stockError;

        const rows = (stockRows as StockItem[]) || [];
        const itemIds = Array.from(new Set(rows.map((row) => row.item_id).filter(Boolean)));

        const { data: variantRows, error: variantError } = await supabase
          .from("catalog_variants")
          .select("id,item_id,active")
          .in("item_id", itemIds);

        if (variantError) throw variantError;

        const itemsWithVariants = new Set<string>();
        (variantRows ?? []).forEach((row) => {
          if (row?.active === false) return;
          if (row?.item_id) itemsWithVariants.add(row.item_id);
        });

        const map = new Map<string, StockItem>();
        rows.forEach((row) => {
          const kind = row.item_kind ?? "";
          if (!kinds.includes(kind)) return;
          const vKey = normalizeVariantKey(row.variant_key).toLowerCase();
          if (baseOnly && vKey !== "base") return;
          if (vKey === "base" && itemsWithVariants.has(row.item_id)) return;

          const key = `${row.item_id}::${vKey}`;
          const existing = map.get(key);
          const onHandUnits = typeof row.net_units === "number" ? row.net_units : 0;

          if (existing) {
            existing.net_units = (existing.net_units ?? 0) + onHandUnits;
          } else {
            map.set(key, {
              item_id: row.item_id,
              item_name: row.item_name,
              variant_key: normalizeVariantKey(row.variant_key),
              item_kind: kind,
              net_units: onHandUnits,
            });
          }
        });

        const aggregated = Array.from(map.values()).sort((a, b) =>
          (a.item_name ?? "").localeCompare(b.item_name ?? "")
        );
        setItems(aggregated);
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
    selectedBalanceWarehouseIds,
    linkedWarehouseIds,
    includeIngredients,
    includeRaw,
    includeFinished,
    baseOnly,
    selectedOutletIds,
    refreshTick,
    supabase,
    hasColdroomBalances,
    coldroomChildSet,
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

        const [{ data: itemData, error: itemError }, { data: variantData, error: variantError }] = await Promise.all([
          supabase
            .from("catalog_items")
            .select("id,consumption_unit,consumption_uom,purchase_pack_unit,purchase_unit_mass,purchase_unit_mass_uom")
            .in("id", ids),
          supabase.from("catalog_variants").select("id,item_id,name,active").in("item_id", ids),
        ]);

        if (itemError) throw itemError;
        if (variantError) throw variantError;
        if (!active) return;

        const map: Record<string, string> = {};
        const uomMap: Record<string, string> = {};
        const packMap: Record<string, { mass: number | null; uom: string | null }> = {};
        (itemData || []).forEach((row) => {
          const fallbackUom = row.purchase_pack_unit ?? row.consumption_unit ?? row.consumption_uom ?? "each";
          if (row.id) uomMap[row.id] = fallbackUom;
          if (row.id) {
            packMap[row.id] = {
              mass: typeof row.purchase_unit_mass === "number" ? row.purchase_unit_mass : null,
              uom: row.purchase_unit_mass_uom ?? null,
            };
          }
        });

        const normalizeVariantKey = (value?: string | null) => {
          const trimmed = value?.trim();
          return trimmed && trimmed.length ? trimmed : "base";
        };

        (variantData || []).forEach((variant) => {
          if (variant?.active === false) return;
          const name = variant?.name?.trim();
          if (!name || !variant?.id) return;
          map[variant.id] = name;
          map[normalizeVariantKey(variant.id)] = name;
        });

        setVariantNames(map);
        setItemUoms(uomMap);
        setItemPackMass(packMap);
      } catch {
        if (active) {
          setVariantNames({});
          setItemUoms({});
          setItemPackMass({});
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
            <div className={`${styles.filterLabel} ${styles.outletPicker}`}>
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
                    <label key={outlet.id} className={styles.outletCard}>
                      <input
                        type="checkbox"
                        checked={selectedOutletIds.includes(outlet.id)}
                        onChange={() => {
                          toggleOutlet(outlet.id);
                        }}
                        disabled={booting}
                      />
                      <span className={styles.outletCardName}>{outlet.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          {hasColdroomBalances && (
            <div className={styles.filterRow}>
              <div className={`${styles.filterLabel} ${styles.warehousePicker}`}>
                Warehouses
                <div className={styles.warehouseActions}>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={selectAllBalanceWarehouses}
                    disabled={coldroomWarehouseOptions.length === 0}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={clearBalanceWarehouses}
                    disabled={coldroomWarehouseOptions.length === 0}
                  >
                    Clear
                  </button>
                </div>
                <details className={styles.warehouseDropdown}>
                  <summary>
                    {selectedBalanceWarehouseIds.length === 0
                      ? "Choose warehouses"
                      : `${selectedBalanceWarehouseIds.length} selected`}
                  </summary>
                  <div className={styles.warehouseChecklist}>
                    {coldroomWarehouseOptions.map((warehouse) => (
                      <label key={warehouse.id} className={styles.warehouseOption}>
                        <input
                          type="checkbox"
                          checked={selectedBalanceWarehouseIds.includes(warehouse.id)}
                          onChange={() => toggleBalanceWarehouse(warehouse.id)}
                        />
                        <span>{warehouse.name}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            </div>
          )}

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
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={showPackWeightTotals}
                onChange={(event) => setShowPackWeightTotals(event.target.checked)}
              />
              Pack weight total
            </label>
          </div>
        </section>

        <section className={styles.summaryCard}>
          <div className={styles.summaryHeader}>
            <div>
              <p className={styles.tableTitle}>Outlet Orders</p>
              <p className={styles.tableSubtitle}>Totals for selected outlets on the chosen day.</p>
            </div>
            {ordersLoading && <span className={styles.loadingTag}>Loading…</span>}
          </div>
          <div className={styles.filterRow}>
            <label className={styles.filterLabel}>
              Orders date
              <input
                type="date"
                className={styles.input}
                value={orderDate}
                onChange={(event) => setOrderDate(event.target.value)}
              />
            </label>
          </div>
          <div className={styles.summaryRow}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Orders</span>
              <span className={styles.summaryValue}>{orderTotals.count.toLocaleString()}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Total Qty</span>
              <span className={styles.summaryValue}>{orderTotals.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Total Amount</span>
              <span className={styles.summaryValue}>{orderTotals.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <p className={styles.tableTitle}>Live Balances</p>
              <p className={styles.tableSubtitle}>
                Showing {items.length} items
                {hasColdroomBalances
                  ? selectedBalanceWarehouseIds.length > 0
                    ? ` · ${selectedBalanceWarehouseIds.length} selected`
                    : ""
                  : selectedWarehouseId === "all" && linkedWarehouseIds.length > 0
                    ? ` · Summed across ${linkedWarehouseIds.length} warehouses`
                    : selectedWarehouseId === COLDROOM_PARENT_ID
                      ? ` · Summed across ${COLDROOM_CHILD_IDS.length} coldrooms`
                      : ""}
                {" · Auto-refreshes every 30s"}
              </p>
            </div>
            {loading && <span className={styles.loadingTag}>Refreshing…</span>}
          </div>

          {error && <p className={styles.errorBanner}>{error}</p>}

          <div className={styles.table}>
            <div className={`${styles.tableRow} ${styles.tableHead} ${showPackWeightTotals ? styles.tableRowWide : ""}`}>
              <span>Item</span>
              <span>Variant</span>
              <span>Kind</span>
              <span className={styles.alignRight}>Net Units</span>
              {showPackWeightTotals && <span className={styles.alignRight}>Pack total</span>}
            </div>

            {items.map((item) => (
              <div
                key={`${item.item_id}-${item.variant_key ?? "base"}`}
                className={`${styles.tableRow} ${showPackWeightTotals ? styles.tableRowWide : ""}`}
              >
                <span>{item.item_name || item.item_id}</span>
                <span>
                  {(() => {
                    const rawKey = normalizeVariantKey(item.variant_key).toLowerCase();
                    const hasVariants = itemHasVariants.get(item.item_id) ?? false;
                    if (rawKey === "base" && !hasVariants) {
                      return item.item_name || item.item_id;
                    }
                    return variantNames[item.variant_key ?? ""] || item.variant_key || "base";
                  })()}
                </span>
                <span className={styles.kindTag}>{item.item_kind || "-"}</span>
                <span className={`${styles.alignRight} ${item.net_units !== null && item.net_units < 0 ? styles.negative : ""}`}>
                  {(() => {
                    const uom = itemUoms[item.item_id];
                    const formatted = formatQtyWithUom(item.net_units, uom);
                    return `${formatted.text} ${formatted.uom}${formatted.detail ? " " + formatted.detail : ""}`.trim();
                  })()}
                </span>
                {showPackWeightTotals && (
                  <span className={styles.alignRight}>
                    {(() => {
                      const packInfo = itemPackMass[item.item_id];
                      if (!packInfo || packInfo.mass == null || item.net_units == null) return "-";
                      const total = item.net_units * packInfo.mass;
                      const formatted = formatQtyWithUom(total, packInfo.uom ?? undefined);
                      return `${formatted.text} ${formatted.uom}${formatted.detail ? " " + formatted.detail : ""}`.trim();
                    })()}
                  </span>
                )}
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
