"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import { fetchOutletWarehouseLinks, fetchSellingOutlets } from "@/lib/warehouse-outlet-api";
import styles from "./outlet-warehouse-balances.module.css";

type OutletOption = {
  id: string;
  name: string;
};

type StockItem = {
  warehouse_id: string;
  warehouse_name: string | null;
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
    case "block":
    case "block(s)":
      return "Block(s)";
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
  const { status } = useWarehouseAuth();

  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [linkedWarehouseIds, setLinkedWarehouseIds] = useState<string[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [variantNames, setVariantNames] = useState<Record<string, string>>({});
  const [itemUoms, setItemUoms] = useState<Record<string, string>>({});
  const [variantUoms, setVariantUoms] = useState<Record<string, string>>({});
  const [itemPackMass, setItemPackMass] = useState<Record<string, { mass: number | null; uom: string | null }>>({});
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [orderDate, setOrderDate] = useState<string>(
    () => new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Johannesburg" })
  );
  const [orderTotals, setOrderTotals] = useState<OrderTotals>({ count: 0, qty: 0, amount: 0 });
  const [ordersLoading, setOrdersLoading] = useState(false);

  const search = "";
  const [includeIngredients, setIncludeIngredients] = useState(true);
  const [includeRaw, setIncludeRaw] = useState(true);
  const [includeFinished, setIncludeFinished] = useState(true);
  const [baseOnly, setBaseOnly] = useState(false);
  const [showPackWeightTotals, setShowPackWeightTotals] = useState(false);

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

        const mapped = await fetchSellingOutlets("selling");

        if (!active) return;

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

  useEffect(() => {
    if (status !== "ok") return;
    if (selectedOutletIds.length === 0) {
      setLinkedWarehouseIds([]);
      setSelectedWarehouseId("");
      return;
    }
    let active = true;

    const loadWarehouses = async () => {
      try {
        setError(null);
        const links = await fetchOutletWarehouseLinks({ outletIds: selectedOutletIds, scope: "outlet" });
        const warehouseIds = Array.from(new Set(links.map((link) => link.warehouse_id)));

        setLinkedWarehouseIds(warehouseIds);
        if (!active) return;
        if (warehouseIds.length === 0) {
          setSelectedWarehouseId("");
          return;
        }

        setSelectedWarehouseId("all");
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      }
    };

    loadWarehouses();

    return () => {
      active = false;
    };
  }, [status, selectedOutletIds]);

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
        const params = new URLSearchParams();
        params.set("date", orderDate);
        selectedOutletIds.forEach((id) => params.append("outlet_id", id));

        const res = await fetch(`/api/outlet-warehouse-balances/order-totals?${params.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as OrderTotals & { error?: string };
        if (!res.ok) throw new Error(json.error || "Unable to load order totals");

        if (!active) return;
        setOrderTotals({ count: json.count, qty: json.qty, amount: json.amount });
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
  }, [status, selectedOutletIds, orderDate]);

  useEffect(() => {
    if (status !== "ok" || !selectedWarehouseId) {
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

        const warehouseIds =
          selectedWarehouseId === "all" ? linkedWarehouseIds : [selectedWarehouseId];
        if (warehouseIds.length === 0) {
          if (active) setItems([]);
          return;
        }

        const outletIdSet = new Set(selectedOutletIds);
        const outletIds = Array.from(outletIdSet);
        if (outletIds.length === 0) {
          if (active) setItems([]);
          return;
        }

        const searchValue = search.trim();

        const res = await fetch("/api/outlet-warehouse-balances/stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            warehouse_ids: warehouseIds,
            kinds,
            search: searchValue,
            base_only: baseOnly,
          }),
        });
        const json = (await res.json()) as { items?: StockItem[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Unable to load warehouse balances");

        setItems(json.items ?? []);
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
    selectedOutletIds,
    refreshTick,
    search,
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

        const itemResponses = await Promise.all(
          ids.map(async (id) => {
            const res = await fetch(`/api/catalog/items?id=${encodeURIComponent(id)}`, { cache: "no-store" });
            if (!res.ok) return null;
            const json = (await res.json()) as { item?: Record<string, unknown> };
            return json.item ?? null;
          }),
        );
        const variantResponses = await Promise.all(
          ids.map(async (itemId) => {
            const res = await fetch(`/api/catalog/variants?item_id=${encodeURIComponent(itemId)}`, {
              cache: "no-store",
            });
            if (!res.ok) return [] as Array<Record<string, unknown>>;
            const json = (await res.json()) as { variants?: Array<Record<string, unknown>> };
            return json.variants ?? [];
          }),
        );

        if (!active) return;

        const map: Record<string, string> = {};
        const uomMap: Record<string, string> = {};
        const variantUomMap: Record<string, string> = {};
        const packMap: Record<string, { mass: number | null; uom: string | null }> = {};

        itemResponses.forEach((row) => {
          if (!row || typeof row.id !== "string") return;
          const fallbackUom =
            (typeof row.consumption_unit === "string" && row.consumption_unit) ||
            (typeof row.consumption_uom === "string" && row.consumption_uom) ||
            (typeof row.purchase_pack_unit === "string" && row.purchase_pack_unit) ||
            "each";
          uomMap[row.id] = fallbackUom;
          packMap[row.id] = {
            mass: typeof row.purchase_unit_mass === "number" ? row.purchase_unit_mass : null,
            uom: typeof row.purchase_unit_mass_uom === "string" ? row.purchase_unit_mass_uom : null,
          };
        });

        const normalizeVariantKeyLocal = (value?: string | null) => {
          const trimmed = value?.trim();
          return trimmed && trimmed.length ? trimmed : "base";
        };

        variantResponses.flat().forEach((variant) => {
          if (variant?.active === false) return;
          const name = typeof variant?.name === "string" ? variant.name.trim() : "";
          const id = typeof variant?.id === "string" ? variant.id : "";
          if (!name || !id) return;
          map[id] = name;
          map[normalizeVariantKeyLocal(id)] = name;
          const uom = typeof variant.consumption_uom === "string" ? variant.consumption_uom.trim() : "";
          if (uom) {
            variantUomMap[id] = uom;
            variantUomMap[normalizeVariantKeyLocal(id)] = uom;
          }
        });

        setVariantNames(map);
        setItemUoms(uomMap);
        setVariantUoms(variantUomMap);
        setItemPackMass(packMap);
      } catch {
        if (active) {
          setVariantNames({});
          setItemUoms({});
          setVariantUoms({});
          setItemPackMass({});
        }
      }
    };

    loadVariantNames();

    return () => {
      active = false;
    };
  }, [items, status]);

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
                {selectedWarehouseId === "all" && linkedWarehouseIds.length > 0
                  ? ` · Summed across ${linkedWarehouseIds.length} warehouses`
                  : ""}
                {" · Auto-refreshes every 30s"}
              </p>
            </div>
            {loading && <span className={styles.loadingTag}>Refreshing…</span>}
          </div>

          {error && <p className={styles.errorBanner}>{error}</p>}

          <div className={styles.table}>
            <div className={`${styles.tableRow} ${styles.tableHead} ${showPackWeightTotals ? styles.tableRowWide : ""}`}>
              <span>Warehouse</span>
              <span>Item</span>
              <span>Variant</span>
              <span>Kind</span>
              <span className={styles.alignRight}>Net Units</span>
              {showPackWeightTotals && <span className={styles.alignRight}>Pack total</span>}
            </div>

            {items.map((item) => (
              <div
                key={`${item.warehouse_id}-${item.item_id}-${item.variant_key ?? "base"}`}
                className={`${styles.tableRow} ${showPackWeightTotals ? styles.tableRowWide : ""}`}
              >
                <span>{item.warehouse_name || item.warehouse_id}</span>
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
                    const variantKey = normalizeVariantKey(item.variant_key);
                    const uom = variantUoms[variantKey] || itemUoms[item.item_id];
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
