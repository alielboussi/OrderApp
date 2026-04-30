"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import shellStyles from "../dashboard.module.css";
import menuStyles from "../menu.module.css";
import styles from "./differences.module.css";

type WarehouseOption = { id: string; name: string | null; code: string | null; active?: boolean | null };

type StockPeriod = {
  id: string;
  warehouse_id: string;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  stocktake_number: string | null;
};

type StockCountRow = {
  item_id: string;
  variant_key: string | null;
  counted_qty: number | null;
  kind: string | null;
};

type RecipeRow = {
  finished_item_id: string;
  ingredient_item_id: string;
  qty_per_unit: number | string;
  qty_unit: string;
  yield_qty_units: number | string | null;
  finished_variant_key: string | null;
  recipe_for_kind: string | null;
  active: boolean | null;
  source_warehouse_id: string | null;
};

type CatalogItem = {
  id: string;
  name: string | null;
  item_kind: string | null;
  consumption_unit: string | null;
  purchase_unit_mass: number | string | null;
  purchase_unit_mass_uom: string | null;
};

type UomConversion = {
  from_uom: string;
  to_uom: string;
  multiplier: number | string;
  active: boolean | null;
};

type DifferenceRow = {
  key: string;
  finishedId: string;
  finishedName: string;
  variantKey: string;
  finishedOpeningQty: number;
  maxServings: number;
  bottleneckId: string | null;
  bottleneckName: string;
  bottleneckOpeningQty: number;
  bottleneckNeededPerUnit: number;
  ingredientCount: number;
  details: IngredientDetail[];
};

type IngredientDetail = {
  ingredientId: string;
  ingredientName: string;
  openingQty: number;
  neededPerUnit: number;
  servings: number;
  qtyUnit: string;
  variantKey: string;
};

const EACH_ALIASES = new Set(["each", "pc", "piece", "pieces"]);

function normalizeVariantKey(value?: string | null): string {
  const raw = value?.trim().toLowerCase() ?? "";
  return raw.length ? raw : "base";
}

function normalizeUom(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildConversionMap(rows: UomConversion[]): Map<string, number> {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    if (row.active === false) return;
    const from = normalizeUom(row.from_uom);
    const to = normalizeUom(row.to_uom);
    if (!from || !to) return;
    map.set(`${from}|${to}`, toNumber(row.multiplier, 1));
  });
  return map;
}

function convertUomQty(qty: number, from: string | null, to: string | null, conversions: Map<string, number>): number {
  const fromKey = normalizeUom(from);
  const toKey = normalizeUom(to);
  if (!fromKey || !toKey || fromKey === toKey) return qty;
  const direct = conversions.get(`${fromKey}|${toKey}`);
  if (direct !== undefined) return qty * direct;
  const reverse = conversions.get(`${toKey}|${fromKey}`);
  if (reverse !== undefined && reverse !== 0) return qty / reverse;
  return qty;
}

function isEachLike(value?: string | null): boolean {
  const normalized = normalizeUom(value);
  if (!normalized) return true;
  return EACH_ALIASES.has(normalized);
}

function formatStamp(raw?: string | null): string {
  if (!raw) return "--";
  const trimmed = raw.replace("T", " ");
  return trimmed.length > 19 ? trimmed.slice(0, 19) : trimmed;
}

export default function WarehouseOpeningDifferences() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [periods, setPeriods] = useState<StockPeriod[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [periodFilter, setPeriodFilter] = useState<"open" | "closed" | "all">("open");
  const [period, setPeriod] = useState<StockPeriod | null>(null);
  const [rows, setRows] = useState<DifferenceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadWarehouses = async () => {
      try {
        const { data, error: loadError } = await supabase
          .from("warehouses")
          .select("id,name,code,active")
          .order("name", { ascending: true });

        if (loadError) throw loadError;
        if (!active) return;

        const list = (data as WarehouseOption[] | null) ?? [];
        const activeWarehouses = list.filter((warehouse) => warehouse.active !== false);
        setWarehouses(activeWarehouses);
        if (!warehouseId && activeWarehouses.length > 0) {
          setWarehouseId(activeWarehouses[0].id);
        }
      } catch (err) {
        if (!active) return;
        setWarehouses([]);
        setError((err as Error).message ?? "Failed to load warehouses.");
      }
    };

    loadWarehouses();
    return () => {
      active = false;
    };
  }, [status, supabase, warehouseId]);

  useEffect(() => {
    if (status !== "ok" || !warehouseId) return;
    let active = true;

    const loadPeriods = async () => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from("warehouse_stock_periods")
          .select("id,warehouse_id,status,opened_at,closed_at,stocktake_number")
          .eq("warehouse_id", warehouseId)
          .order("opened_at", { ascending: false });

        if (periodFilter !== "all") {
          query = query.eq("status", periodFilter);
        }

        const { data, error: periodError } = await query;
        if (periodError) throw periodError;
        if (!active) return;

        const list = (data as StockPeriod[] | null) ?? [];
        setPeriods(list);
        const selected = list.find((item) => item.id === periodId) ?? list[0] ?? null;
        setPeriod(selected);
        if (!selected) {
          setPeriodId("");
        } else if (selected.id !== periodId) {
          setPeriodId(selected.id);
        }
      } catch (err) {
        if (!active) return;
        setPeriods([]);
        setPeriod(null);
        setPeriodId("");
        setError((err as Error).message ?? "Failed to load periods.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPeriods();
    return () => {
      active = false;
    };
  }, [status, supabase, warehouseId, periodFilter, periodId]);

  useEffect(() => {
    if (status !== "ok" || !warehouseId || !periodId) return;
    let active = true;

    const loadDifferences = async () => {
      setLoading(true);
      setError(null);

      try {
        const selectedPeriod = periods.find((item) => item.id === periodId) ?? null;
        setPeriod(selectedPeriod);
        if (!selectedPeriod) {
          setRows([]);
          setLoading(false);
          return;
        }

        const [countsRes, recipesRes, uomsRes] = await Promise.all([
          supabase
            .from("warehouse_stock_counts")
            .select("item_id,variant_key,counted_qty,kind")
            .eq("period_id", selectedPeriod.id)
            .eq("kind", "opening"),
          supabase
            .from("recipes")
            .select(
              "finished_item_id,ingredient_item_id,qty_per_unit,qty_unit,yield_qty_units,finished_variant_key,recipe_for_kind,active,source_warehouse_id"
            )
            .eq("active", true)
            .eq("recipe_for_kind", "finished"),
          supabase.from("uom_conversions").select("from_uom,to_uom,multiplier,active").eq("active", true),
        ]);

        if (countsRes.error) throw countsRes.error;
        if (recipesRes.error) throw recipesRes.error;
        if (uomsRes.error) throw uomsRes.error;

        if (!active) return;

        const counts = (countsRes.data as StockCountRow[] | null) ?? [];
        const recipesRaw = (recipesRes.data as RecipeRow[] | null) ?? [];
        const uomRows = (uomsRes.data as UomConversion[] | null) ?? [];

        const recipes = recipesRaw.filter(
          (recipe) => !recipe.source_warehouse_id || recipe.source_warehouse_id === warehouseId
        );

        const conversionMap = buildConversionMap(uomRows);

        const openingByItem = new Map<string, number>();
        counts.forEach((row) => {
          if (normalizeVariantKey(row.variant_key) !== "base") return;
          const qty = toNumber(row.counted_qty, 0);
          openingByItem.set(row.item_id, qty);
        });

        const itemIds = new Set<string>();
        recipes.forEach((recipe) => {
          itemIds.add(recipe.finished_item_id);
          itemIds.add(recipe.ingredient_item_id);
        });

        const itemList = Array.from(itemIds);
        const chunkSize = 500;
        const itemChunks: string[][] = [];
        for (let i = 0; i < itemList.length; i += chunkSize) {
          itemChunks.push(itemList.slice(i, i + chunkSize));
        }

        const itemResults = await Promise.all(
          itemChunks.map((chunk) =>
            supabase
              .from("catalog_items")
              .select("id,name,item_kind,consumption_unit,purchase_unit_mass,purchase_unit_mass_uom")
              .in("id", chunk)
          )
        );

        itemResults.forEach((result) => {
          if (result.error) throw result.error;
        });

        if (!active) return;

        const items = itemResults.flatMap((result) => (result.data as CatalogItem[] | null) ?? []);
        const itemMap = new Map<string, CatalogItem>();
        items.forEach((item) => itemMap.set(item.id, item));

        const rowsByFinished = new Map<string, DifferenceRow>();

        recipes.forEach((recipe) => {
          const finishedItem = itemMap.get(recipe.finished_item_id);
          const ingredientItem = itemMap.get(recipe.ingredient_item_id);
          if (!finishedItem || !ingredientItem) return;

          const variantKey = normalizeVariantKey(recipe.finished_variant_key);
          const finishedName = finishedItem.name?.trim() || "Unnamed";
          const rowKey = `${recipe.finished_item_id}|${variantKey}`;
          const finishedOpeningQty = openingByItem.get(finishedItem.id) ?? 0;

          const qtyPerUnit = toNumber(recipe.qty_per_unit, 0);
          const yieldUnits = Math.max(toNumber(recipe.yield_qty_units, 1), 1);
          if (qtyPerUnit <= 0) return;

          let componentQty = convertUomQty(qtyPerUnit, recipe.qty_unit, ingredientItem.consumption_unit, conversionMap);
          const purchaseUnitMass = toNumber(ingredientItem.purchase_unit_mass, 0);

          if (purchaseUnitMass > 0 && ingredientItem.purchase_unit_mass_uom && isEachLike(ingredientItem.consumption_unit)) {
            const converted = convertUomQty(qtyPerUnit, recipe.qty_unit, ingredientItem.purchase_unit_mass_uom, conversionMap);
            componentQty = converted / purchaseUnitMass;
          }

          if (!Number.isFinite(componentQty) || componentQty <= 0) return;

          const openingQty = openingByItem.get(ingredientItem.id) ?? 0;
          const servings = Math.floor((openingQty * yieldUnits) / componentQty);
          const detail: IngredientDetail = {
            ingredientId: ingredientItem.id,
            ingredientName: ingredientItem.name?.trim() || "Unnamed",
            openingQty,
            neededPerUnit: componentQty,
            servings,
            qtyUnit: recipe.qty_unit,
            variantKey: "base",
          };

          const existing = rowsByFinished.get(rowKey);
          const bottleneckName = detail.ingredientName;
          if (!existing) {
            rowsByFinished.set(rowKey, {
              key: rowKey,
              finishedId: recipe.finished_item_id,
              finishedName,
              variantKey,
              finishedOpeningQty,
              maxServings: servings,
              bottleneckId: ingredientItem.id,
              bottleneckName,
              bottleneckOpeningQty: openingQty,
              bottleneckNeededPerUnit: componentQty,
              ingredientCount: 1,
              details: [detail],
            });
            return;
          }

          existing.ingredientCount += 1;
          existing.details.push(detail);
          if (servings < existing.maxServings) {
            existing.maxServings = servings;
            existing.bottleneckId = ingredientItem.id;
            existing.bottleneckName = bottleneckName;
            existing.bottleneckOpeningQty = openingQty;
            existing.bottleneckNeededPerUnit = componentQty;
          }
        });

        const resultRows = Array.from(rowsByFinished.values()).sort((a, b) => {
          const nameCompare = a.finishedName.localeCompare(b.finishedName);
          if (nameCompare !== 0) return nameCompare;
          return a.variantKey.localeCompare(b.variantKey);
        });

        setRows(resultRows);
      } catch (err) {
        if (!active) return;
        setRows([]);
        setError((err as Error).message ?? "Failed to load differences.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDifferences();
    return () => {
      active = false;
    };
  }, [status, supabase, warehouseId, periodId, periods]);

  const filteredRows = rows.filter((row) =>
    row.finishedName.toLowerCase().includes(search.trim().toLowerCase())
  );

  if (status !== "ok") return null;

  const periodLabel = period
    ? `${period.stocktake_number ?? "Period"} (${period.status})\nOpened ${formatStamp(period.opened_at)}${
        period.closed_at ? ` | Closed ${formatStamp(period.closed_at)}` : ""
      }`
    : "No periods";

  return (
    <div className={shellStyles.page}>
      <style>{globalStyles}</style>
      <main className={shellStyles.shell}>
        <header className={shellStyles.hero}>
          <div className={shellStyles.grow}>
            <p className={shellStyles.kicker}>AfterTen Logistics</p>
            <h1 className={shellStyles.title}>Opening Stock Differences</h1>
            <p className={shellStyles.subtitle}>
              Compare opening ingredient counts to the servings that the current recipes can produce.
            </p>
          </div>
          <div className={menuStyles.headerButtons}>
            <button onClick={() => router.back()} className={menuStyles.backButton}>
              Back
            </button>
            <button onClick={() => router.push("/Warehouse_Backoffice/reports-hub")} className={menuStyles.backButton}>
              Back to Reports
            </button>
          </div>
        </header>

        <section className={styles.controls}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="warehouse-select">
              Warehouse
            </label>
            <select
              id="warehouse-select"
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
              className={styles.select}
            >
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name ?? warehouse.code ?? warehouse.id}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="period-filter">
              Period status
            </label>
            <select
              id="period-filter"
              value={periodFilter}
              onChange={(event) => setPeriodFilter(event.target.value as "open" | "closed" | "all")}
              className={styles.select}
            >
              <option value="open">Open periods</option>
              <option value="closed">Closed history</option>
              <option value="all">All periods</option>
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="period-select">
              Period
            </label>
            <select
              id="period-select"
              value={periodId}
              onChange={(event) => setPeriodId(event.target.value)}
              className={styles.select}
            >
              {periods.map((item) => (
                <option key={item.id} value={item.id}>
                  {`${item.stocktake_number ?? "Period"} (${item.status}) - ${formatStamp(item.opened_at)}`}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="search">
              Search
            </label>
            <input
              id="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={styles.input}
              placeholder="Search finished items"
            />
          </div>

          <div className={styles.periodCard}>
            <p className={styles.periodTitle}>Latest period</p>
            <p className={styles.periodValue}>{periodLabel}</p>
          </div>
        </section>

        {error && <p className={styles.error}>{error}</p>}
        {!error && !loading && !period && (
          <p className={styles.notice}>No stocktake periods found for this warehouse.</p>
        )}
        {!error && !loading && period && rows.length === 0 && (
          <p className={styles.notice}>No recipe rows were found for the selected warehouse.</p>
        )}

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Recipe yield from opening counts</h2>
            <span className={styles.tableMeta}>
              {loading ? "Loading..." : `${filteredRows.length} recipes`}
            </span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Finished item</th>
                  <th>Variant</th>
                  <th>Finished opening qty</th>
                  <th>Max servings</th>
                  <th>Bottleneck ingredient</th>
                  <th>Opening qty</th>
                  <th>Needed per unit</th>
                  <th>Ingredient count</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.flatMap((row) => {
                  const detailRows = row.details.map((detail, index) => (
                    <tr key={`${row.key}-${detail.ingredientId}-${index}`} className={styles.detailRow}>
                      <td className={styles.detailText}>{`↳ ${detail.ingredientName}`}</td>
                      <td className={styles.detailMuted}>{detail.variantKey}</td>
                      <td className={styles.detailMuted}>--</td>
                      <td className={styles.detailText}>{detail.servings}</td>
                      <td className={styles.detailMuted}>Ingredient</td>
                      <td className={styles.detailText}>{detail.openingQty}</td>
                      <td className={styles.detailText}>{`${detail.neededPerUnit.toFixed(4)} ${detail.qtyUnit}`}</td>
                      <td className={styles.detailMuted}>--</td>
                    </tr>
                  ));

                  return [
                    <tr key={row.key}>
                      <td>{row.finishedName}</td>
                      <td>{row.variantKey}</td>
                      <td>{row.finishedOpeningQty}</td>
                      <td>{row.maxServings}</td>
                      <td>{row.bottleneckName}</td>
                      <td>{row.bottleneckOpeningQty}</td>
                      <td>{row.bottleneckNeededPerUnit.toFixed(4)}</td>
                      <td>{row.ingredientCount}</td>
                    </tr>,
                    ...detailRows,
                  ];
                })}
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
