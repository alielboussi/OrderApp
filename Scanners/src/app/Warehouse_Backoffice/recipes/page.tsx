"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "./recipes.module.css";

type ItemKind = "raw" | "ingredient" | "finished";

type CatalogItem = {
  id: string;
  name: string;
  sku: string | null;
  item_kind: ItemKind;
};

type PendingLine = {
  ingredientId: string;
  qty: string;
  uom: string;
};

const qtyUnits = [
  "each",
  "g",
  "kg",
  "mg",
  "ml",
  "l",
  "case",
  "crate",
  "bottle",
  "Tin Can",
  "Jar",
  "Packet",
  "Box",
] as const;

type UomOption = { value: string; label: string };

const formatUnitLabel = (unit: string) => {
  const trimmed = unit.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const mapped =
    lower === "each"
      ? "Each"
      : lower === "g"
        ? "Gram(s)"
        : lower === "kg"
          ? "Kilogram(s)"
          : lower === "mg"
            ? "Milligram(s)"
            : lower === "ml"
              ? "Millilitre(s)"
              : lower === "l"
                ? "Litre(s)"
                : lower === "packet"
                  ? "Packet(s)"
                  : lower === "box"
                    ? "Box(es)"
                    : null;
  if (mapped) return mapped;
  const capitalized = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return capitalized.endsWith("(s)") ? capitalized : `${capitalized}(s)`;
};

const DEFAULT_UOMS: UomOption[] = qtyUnits.map((uom) => ({ value: uom, label: formatUnitLabel(uom) }));

const EMPTY_LINE: PendingLine = { ingredientId: "", qty: "", uom: "g" };

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}


export default function RecipesPage() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const { status, readOnly } = useWarehouseAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [finishedItems, setFinishedItems] = useState<CatalogItem[]>([]);
  const [ingredientItems, setIngredientItems] = useState<CatalogItem[]>([]);
  const [rawItems, setRawItems] = useState<CatalogItem[]>([]);

  const [selectedFinished, setSelectedFinished] = useState<string>("");
  const [selectedIngredientTarget, setSelectedIngredientTarget] = useState<string>("");

  const [finishedLines, setFinishedLines] = useState<PendingLine[]>([EMPTY_LINE]);
  const [ingredientLines, setIngredientLines] = useState<PendingLine[]>([EMPTY_LINE]);
  const [hasFinishedRecipe, setHasFinishedRecipe] = useState(false);
  const [hasIngredientRecipe, setHasIngredientRecipe] = useState(false);
  const [uoms, setUoms] = useState<UomOption[]>(DEFAULT_UOMS);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setError(null);
        setSuccess(null);
        setLoading(true);

        const [fin, ing, raw, uomRes] = await Promise.all([
          supabase
            .from("catalog_items")
            .select("id,name,sku,item_kind")
            .eq("item_kind", "finished")
            .order("name", { ascending: true }),
          supabase
            .from("catalog_items")
            .select("id,name,sku,item_kind")
            .eq("item_kind", "ingredient")
            .order("name", { ascending: true }),
          supabase
            .from("catalog_items")
            .select("id,name,sku,item_kind")
            .eq("item_kind", "raw")
            .order("name", { ascending: true }),
          supabase
            .from("uom_conversions")
            .select("from_uom,to_uom")
            .eq("active", true),
        ]);

        if (!active) return;
        if (fin.error) throw fin.error;
        if (ing.error) throw ing.error;
        if (raw.error) throw raw.error;
        if (uomRes.error) throw uomRes.error;

        setFinishedItems(fin.data || []);
        setIngredientItems(ing.data || []);
        setRawItems(raw.data || []);
        const uomSet = new Set<string>(qtyUnits);
        (uomRes.data || []).forEach((row) => {
          if (row.from_uom) uomSet.add(row.from_uom);
          if (row.to_uom) uomSet.add(row.to_uom);
        });
        const nextUoms = Array.from(uomSet)
          .sort((a, b) => a.localeCompare(b))
          .map((uom) => ({ value: uom, label: formatUnitLabel(uom) }));
        setUoms(nextUoms.length ? nextUoms : DEFAULT_UOMS);
      } catch (error) {
        if (!active) return;
        setError(toErrorMessage(error) || "Failed to load catalog items");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    let active = true;
    if (!selectedFinished) {
      setFinishedLines([EMPTY_LINE]);
      return () => {
        active = false;
      };
    }

    const loadRecipe = async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        const { data, error } = await supabase
          .from("recipes")
          .select("ingredient_item_id, qty_per_unit, qty_unit")
          .eq("finished_item_id", selectedFinished)
          .eq("recipe_for_kind", "finished")
          .eq("active", true)
          .order("ingredient_item_id", { ascending: true });
        if (!active) return;
        if (error) throw error;
        if (data && data.length > 0) {
          setHasFinishedRecipe(true);
          setFinishedLines(
            data.map((row) => ({
              ingredientId: row.ingredient_item_id || "",
              qty: row.qty_per_unit?.toString() || "",
              uom: row.qty_unit || "g",
            }))
          );
        } else {
          setHasFinishedRecipe(false);
          setFinishedLines([EMPTY_LINE]);
        }
      } catch (error) {
        if (!active) return;
        setError(toErrorMessage(error) || "Failed to load recipe");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRecipe();
    return () => {
      active = false;
    };
  }, [selectedFinished, supabase]);

  useEffect(() => {
    let active = true;
    if (!selectedIngredientTarget) {
      setIngredientLines([EMPTY_LINE]);
      return () => {
        active = false;
      };
    }

    const loadRecipe = async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        const { data, error } = await supabase
          .from("recipes")
          .select("ingredient_item_id, qty_per_unit, qty_unit")
          .eq("finished_item_id", selectedIngredientTarget)
          .eq("recipe_for_kind", "ingredient")
          .eq("active", true)
          .order("ingredient_item_id", { ascending: true });
        if (!active) return;
        if (error) throw error;
        if (data && data.length > 0) {
          setHasIngredientRecipe(true);
          setIngredientLines(
            data.map((row) => ({
              ingredientId: row.ingredient_item_id || "",
              qty: row.qty_per_unit?.toString() || "",
              uom: row.qty_unit || "g",
            }))
          );
        } else {
          setHasIngredientRecipe(false);
          setIngredientLines([EMPTY_LINE]);
        }
      } catch (error) {
        if (!active) return;
        setError(toErrorMessage(error) || "Failed to load recipe");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRecipe();
    return () => {
      active = false;
    };
  }, [selectedIngredientTarget, supabase]);

  const ingredientOptionsForFinished = useMemo(() => ingredientItems, [ingredientItems]);
  const rawOptionsForIngredient = useMemo(() => rawItems, [rawItems]);

  const addLine = (setter: Dispatch<SetStateAction<PendingLine[]>>) => {
    setter((prev) => [...prev, { ingredientId: "", qty: "", uom: "g" }]);
  };

  const removeLine = (index: number, setter: Dispatch<SetStateAction<PendingLine[]>>) => {
    setter((prev) => {
      if (prev.length <= 1) return [EMPTY_LINE];
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const updateLine = (
    idx: number,
    field: keyof PendingLine,
    value: string,
    setter: Dispatch<SetStateAction<PendingLine[]>>
  ) => {
    setter((prev) => prev.map((line, i) => (i === idx ? { ...line, [field]: value } : line)));
  };

  const validFinishedLines = finishedLines.filter((l) => l.ingredientId && l.qty);
  const validIngredientLines = ingredientLines.filter((l) => l.ingredientId && l.qty);

  const submitFinishedRecipe = async () => {
    if (readOnly) {
      setError("Read-only access: saving is disabled.");
      setSuccess(null);
      return;
    }
    if (!selectedFinished || validFinishedLines.length === 0) {
      setError("Pick a finished product and add at least one ingredient line.");
      setSuccess(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (hasFinishedRecipe) {
        const { error: deactivateError } = await supabase
          .from("recipes")
          .update({ active: false })
          .eq("finished_item_id", selectedFinished)
          .eq("finished_variant_key", "base")
          .eq("recipe_for_kind", "finished")
          .eq("active", true);
        if (deactivateError) throw deactivateError;
      }

      const payload = validFinishedLines.map((line) => ({
        finished_item_id: selectedFinished,
        finished_variant_key: "base",
        ingredient_item_id: line.ingredientId,
        qty_per_unit: Number(line.qty),
        qty_unit: line.uom,
        recipe_for_kind: "finished",
        active: true,
      }));

      const { error: insertError } = await supabase.from("recipes").insert(payload);
      if (insertError) throw insertError;
      setHasFinishedRecipe(true);
      setSuccess(hasFinishedRecipe ? "Finished product recipe updated." : "Finished product recipe saved.");
    } catch (error) {
      setError(toErrorMessage(error) || "Unable to save finished product recipe.");
    } finally {
      setLoading(false);
    }
  };

  const submitIngredientRecipe = async () => {
    if (readOnly) {
      setError("Read-only access: saving is disabled.");
      setSuccess(null);
      return;
    }
    if (!selectedIngredientTarget || validIngredientLines.length === 0) {
      setError("Pick the ingredient to prepare and add at least one raw material line.");
      setSuccess(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (hasIngredientRecipe) {
        const { error: deactivateError } = await supabase
          .from("recipes")
          .update({ active: false })
          .eq("finished_item_id", selectedIngredientTarget)
          .eq("finished_variant_key", "base")
          .eq("recipe_for_kind", "ingredient")
          .eq("active", true);
        if (deactivateError) throw deactivateError;
      }

      const payload = validIngredientLines.map((line) => ({
        finished_item_id: selectedIngredientTarget,
        finished_variant_key: "base",
        ingredient_item_id: line.ingredientId,
        qty_per_unit: Number(line.qty),
        qty_unit: line.uom,
        recipe_for_kind: "ingredient",
        active: true,
      }));

      const { error: insertError } = await supabase.from("recipes").insert(payload);
      if (insertError) throw insertError;
      setHasIngredientRecipe(true);
      setSuccess(hasIngredientRecipe ? "Ingredient prep recipe updated." : "Ingredient prep recipe saved.");
    } catch (error) {
      setError(toErrorMessage(error) || "Unable to save ingredient recipe.");
    } finally {
      setLoading(false);
    }
  };

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Warehouse Backoffice</p>
          <h1 className={styles.title}>Recipes</h1>
          <p className={styles.subtitle}>
            Link finished products to the ingredients they consume, and link those ingredients to their raw materials.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.backButton} onClick={() => router.back()}>
            Back
          </button>
          <button className={styles.backButton} onClick={() => router.push("/Warehouse_Backoffice")}>
            Back to Dashboard
          </button>
          {loading && <span className={styles.pill}>Loading…</span>}
        </div>
      </header>

      {error && <div className={styles.toastError}>{error}</div>}
      {success && <div className={styles.toastSuccess}>{success}</div>}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.kicker}>Step 1</p>
            <h2 className={styles.cardTitle}>Finished product recipe</h2>
            <p className={styles.cardSubtitle}>
              Choose a sellable finished product, then list the ingredient items it uses per unit.
            </p>
          </div>
          <button className={styles.primaryButton} onClick={submitFinishedRecipe} disabled={loading || readOnly}>
            {readOnly ? "Read-only" : hasFinishedRecipe ? "Update finished product recipe" : "Save finished product recipe"}
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Finished product (sellable)</label>
          <select
            className={styles.select}
            value={selectedFinished}
            onChange={(e) => setSelectedFinished(e.target.value)}
            aria-label="Finished product"
          >
            <option value="">Select a finished product</option>
            {finishedItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.sku ? `• SKU ${item.sku}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.linesHeader}>
          <h3>Ingredients used by this finished product</h3>
          <button className={styles.secondaryButton} onClick={() => addLine(setFinishedLines)}>
            + Add ingredient line
          </button>
        </div>

        <div className={styles.lines}>
          {finishedLines.map((line, idx) => (
            <div key={idx} className={styles.lineRow}>
              <div className={styles.lineField}>
                <label className={styles.label}>Ingredient item (prepped)</label>
                <select
                  className={styles.select}
                  value={line.ingredientId}
                  onChange={(e) => updateLine(idx, "ingredientId", e.target.value, setFinishedLines)}
                  aria-label="Ingredient item"
                >
                  <option value="">Select ingredient</option>
                  {ingredientOptionsForFinished.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} {item.sku ? `• SKU ${item.sku}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.lineField}>
                <label className={styles.label}>Quantity per finished unit</label>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.0001"
                  value={line.qty}
                  onChange={(e) => updateLine(idx, "qty", e.target.value, setFinishedLines)}
                  placeholder="e.g., 0.25"
                />
              </div>
              <div className={styles.lineField}>
                <label className={styles.label}>Unit of measure</label>
                <select
                  className={styles.select}
                  value={line.uom}
                  onChange={(e) => updateLine(idx, "uom", e.target.value, setFinishedLines)}
                  aria-label="Unit of measure"
                >
                  {uoms.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.lineField}>
                <label className={styles.label}>Remove</label>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => removeLine(idx, setFinishedLines)}
                  aria-label="Remove ingredient line"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.kicker}>Step 2</p>
            <h2 className={styles.cardTitle}>Ingredient prep recipe</h2>
            <p className={styles.cardSubtitle}>
              Choose an ingredient you prepare, then list the raw materials it consumes per unit.
            </p>
          </div>
          <button className={styles.primaryButton} onClick={submitIngredientRecipe} disabled={loading || readOnly}>
            {readOnly ? "Read-only" : hasIngredientRecipe ? "Update ingredient recipe" : "Save ingredient recipe"}
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Ingredient being prepared</label>
          <select
            className={styles.select}
            value={selectedIngredientTarget}
            onChange={(e) => setSelectedIngredientTarget(e.target.value)}
            aria-label="Ingredient being prepared"
          >
            <option value="">Select ingredient</option>
            {ingredientItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.sku ? `• SKU ${item.sku}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.linesHeader}>
          <h3>Raw materials used by this ingredient</h3>
          <button className={styles.secondaryButton} onClick={() => addLine(setIngredientLines)}>
            + Add raw material line
          </button>
        </div>

        <div className={styles.lines}>
          {ingredientLines.map((line, idx) => (
            <div key={idx} className={styles.lineRow}>
              <div className={styles.lineField}>
                <label className={styles.label}>Raw material</label>
                <select
                  className={styles.select}
                  value={line.ingredientId}
                  onChange={(e) => updateLine(idx, "ingredientId", e.target.value, setIngredientLines)}
                  aria-label="Raw material"
                >
                  <option value="">Select raw material</option>
                  {rawOptionsForIngredient.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} {item.sku ? `• SKU ${item.sku}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.lineField}>
                <label className={styles.label}>Quantity per ingredient unit</label>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.0001"
                  value={line.qty}
                  onChange={(e) => updateLine(idx, "qty", e.target.value, setIngredientLines)}
                  placeholder="e.g., 1.5"
                />
              </div>
              <div className={styles.lineField}>
                <label className={styles.label}>Unit of measure</label>
                <select
                  className={styles.select}
                  value={line.uom}
                  onChange={(e) => updateLine(idx, "uom", e.target.value, setIngredientLines)}
                  aria-label="Unit of measure"
                >
                  {uoms.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.lineField}>
                <label className={styles.label}>Remove</label>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => removeLine(idx, setIngredientLines)}
                  aria-label="Remove raw material line"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
