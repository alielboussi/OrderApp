"use client";

import { Suspense, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import { formatUomLabel, useUomOptions } from "@/lib/use-uom-options";
import styles from "./recipes.module.css";

type ItemKind = "raw" | "ingredient" | "finished";

type CatalogItem = {
  id: string;
  name: string;
  sku: string | null;
  item_kind: ItemKind;
  default_warehouse_id: string | null;
  consumption_unit?: string | null;
  consumption_uom?: string | null;
};

type CatalogVariant = {
  id: string;
  item_id: string;
  name: string;
  consumption_uom?: string | null;
};

type WarehouseOption = {
  id: string;
  name: string | null;
  code: string | null;
  parent_warehouse_id: string | null;
  active?: boolean | null;
};

type PendingLine = {
  ingredientId: string;
  qty: string;
  uom: string;
  sourceWarehouseId: string;
};

type RecipeUomStep = {
  id: string;
  from_uom: string;
  to_uom: string;
  multiplier: string;
};

type RecipeUomAvailability = {
  source_uom: string;
  target_uom: string;
  base_qty: number;
  recipe_qty: number;
};

const RECIPE_UOM_ALIASES: Record<string, string> = {
  each: "pc",
  pcs: "pc",
  piece: "pc",
  pieces: "pc",
};
const normalizeRecipeUomValue = (value: string, uomValues: string[]) => {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (RECIPE_UOM_ALIASES[lower]) return RECIPE_UOM_ALIASES[lower];
  const canonical = uomValues.find((unit) => unit.toLowerCase() === lower);
  return canonical ?? trimmed;
};

const isAllowedRecipeUomValue = (value: string, uomValues: string[]) =>
  uomValues.includes(normalizeRecipeUomValue(value, uomValues));

const EMPTY_LINE: PendingLine = { ingredientId: "", qty: "", uom: "pc", sourceWarehouseId: "" };

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

const createStepId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatQty = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
};


function RecipesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const uoms = useUomOptions();
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [recipeMode, setRecipeMode] = useState<"finished" | "ingredient">("finished");
  const [initialQueryApplied, setInitialQueryApplied] = useState(false);

  const [recipeUomItemId, setRecipeUomItemId] = useState("");
  const [recipeUomVariantId, setRecipeUomVariantId] = useState("");
  const [recipeUomSource, setRecipeUomSource] = useState("");
  const [recipeUomTarget, setRecipeUomTarget] = useState("pc");
  const [recipeUomSteps, setRecipeUomSteps] = useState<RecipeUomStep[]>([]);
  const [recipeUomProfileId, setRecipeUomProfileId] = useState<string | null>(null);
  const [recipeUomSaving, setRecipeUomSaving] = useState(false);
  const [recipeUomWarehouseId, setRecipeUomWarehouseId] = useState("");
  const [recipeUomAvailable, setRecipeUomAvailable] = useState<RecipeUomAvailability | null>(null);
  const [variants, setVariants] = useState<CatalogVariant[]>([]);

  const uomValues = useMemo(() => uoms.map((uom) => uom.value), [uoms]);
  const uomLabelMap = useMemo(
    () => new Map(uoms.map((uom) => [uom.value.toLowerCase(), uom.label])),
    [uoms]
  );
  const normalizeRecipeUom = (value: string) => normalizeRecipeUomValue(value, uomValues);
  const isAllowedRecipeUom = (value: string) => isAllowedRecipeUomValue(value, uomValues);
  const formatRecipeUomLabel = (value: string) =>
    uomLabelMap.get(value.toLowerCase()) ?? formatUomLabel(value);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setError(null);
        setSuccess(null);
        setLoading(true);

        const [fin, ing, raw, warehouseRes] = await Promise.all([
          supabase
            .from("catalog_items")
            .select("id,name,sku,item_kind,default_warehouse_id,consumption_unit,consumption_uom")
            .eq("item_kind", "finished")
            .order("name", { ascending: true }),
          supabase
            .from("catalog_items")
            .select("id,name,sku,item_kind,default_warehouse_id,consumption_unit,consumption_uom")
            .eq("item_kind", "ingredient")
            .order("name", { ascending: true }),
          supabase
            .from("catalog_items")
            .select("id,name,sku,item_kind,default_warehouse_id,consumption_unit,consumption_uom")
            .eq("item_kind", "raw")
            .order("name", { ascending: true }),
          supabase
            .from("warehouses")
            .select("id,name,code,parent_warehouse_id,active")
            .eq("active", true)
            .order("name", { ascending: true }),
        ]);

        if (!active) return;
        if (fin.error) throw fin.error;
        if (ing.error) throw ing.error;
        if (raw.error) throw raw.error;
        if (warehouseRes.error) throw warehouseRes.error;

        setFinishedItems(fin.data || []);
        setIngredientItems(ing.data || []);
        setRawItems(raw.data || []);
        setWarehouses((warehouseRes.data as WarehouseOption[]) || []);
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
    if (initialQueryApplied) return;
    const mode = searchParams.get("mode");
    const finishedId = searchParams.get("finishedId");
    const ingredientId = searchParams.get("ingredientId");

    if (mode === "finished" || mode === "ingredient") {
      setRecipeMode(mode);
    }

    if (finishedId) {
      setSelectedFinished(finishedId);
      if (mode !== "ingredient") setRecipeMode("finished");
    }

    if (ingredientId) {
      setSelectedIngredientTarget(ingredientId);
      if (mode !== "finished") setRecipeMode("ingredient");
    }

    setInitialQueryApplied(true);
  }, [initialQueryApplied, searchParams]);

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
          .select("ingredient_item_id, qty_per_unit, qty_unit, source_warehouse_id")
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
              uom: normalizeRecipeUom(row.qty_unit || "g"),
              sourceWarehouseId: row.source_warehouse_id || "",
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
  }, [selectedFinished, supabase, uomValues]);

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
          .select("ingredient_item_id, qty_per_unit, qty_unit, source_warehouse_id")
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
              uom: normalizeRecipeUom(row.qty_unit || "g"),
              sourceWarehouseId: row.source_warehouse_id || "",
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
  }, [selectedIngredientTarget, supabase, uomValues]);

  const ingredientOptionsForFinished = useMemo(() => ingredientItems, [ingredientItems]);
  const rawOptionsForIngredient = useMemo(() => rawItems, [rawItems]);
  const allCatalogItems = useMemo(
    () => [...finishedItems, ...ingredientItems, ...rawItems].sort((a, b) => a.name.localeCompare(b.name)),
    [finishedItems, ingredientItems, rawItems]
  );

  const catalogById = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    [...finishedItems, ...ingredientItems, ...rawItems].forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [finishedItems, ingredientItems, rawItems]);

  const warehouseById = useMemo(() => {
    const map = new Map<string, WarehouseOption>();
    warehouses.forEach((warehouse) => {
      map.set(warehouse.id, warehouse);
    });
    return map;
  }, [warehouses]);

  const childrenByParentId = useMemo(() => {
    const map = new Map<string, WarehouseOption[]>();
    warehouses.forEach((warehouse) => {
      const parentId = warehouse.parent_warehouse_id;
      if (!parentId) return;
      const list = map.get(parentId) ?? [];
      list.push(warehouse);
      map.set(parentId, list);
    });
    return map;
  }, [warehouses]);

  useEffect(() => {
    let active = true;
    const loadVariants = async () => {
      if (!recipeUomItemId) {
        setVariants([]);
        setRecipeUomVariantId("");
        return;
      }
      try {
        const res = await fetch(`/api/catalog/variants?item_id=${encodeURIComponent(recipeUomItemId)}`);
        if (!res.ok) throw new Error("Failed to load variants");
        const json = await res.json();
        if (!active) return;
        const nextVariants = Array.isArray(json.variants) ? (json.variants as CatalogVariant[]) : [];
        setVariants(nextVariants);
      } catch (error) {
        if (!active) return;
        console.error(error);
        setVariants([]);
      }
    };
    loadVariants();
    return () => {
      active = false;
    };
  }, [recipeUomItemId]);

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      if (!recipeUomItemId) {
        setRecipeUomProfileId(null);
        setRecipeUomSteps([]);
        setRecipeUomTarget("pc");
        setRecipeUomSource("");
        return;
      }

      const variant = variants.find((row) => row.id === recipeUomVariantId);
      const item = catalogById.get(recipeUomItemId);
      const sourceUom =
        normalizeRecipeUom(variant?.consumption_uom || item?.consumption_unit || item?.consumption_uom || "pc");
      setRecipeUomSource(sourceUom);

      try {
        const params = new URLSearchParams({
          item_id: recipeUomItemId,
          variant_key: recipeUomVariantId || "base",
        });
        const res = await fetch(`/api/recipe-uom?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load recipe UOM profile");
        const json = await res.json();
        if (!active) return;
        if (!json.profile) {
          setRecipeUomProfileId(null);
          setRecipeUomTarget(sourceUom);
          setRecipeUomSteps([]);
          return;
        }
        setRecipeUomProfileId(json.profile.id || null);
        setRecipeUomTarget(normalizeRecipeUom(json.profile.target_uom || sourceUom));
        const steps = Array.isArray(json.steps) ? json.steps : [];
        setRecipeUomSteps(
          steps.map((step: { step_order: number; from_uom: string; to_uom: string; multiplier: number }) => ({
            id: createStepId(),
            from_uom: normalizeRecipeUom(step.from_uom || sourceUom),
            to_uom: normalizeRecipeUom(step.to_uom || sourceUom),
            multiplier: step.multiplier?.toString() ?? "1",
          }))
        );
      } catch (error) {
        if (!active) return;
        console.error(error);
        setRecipeUomProfileId(null);
        setRecipeUomSteps([]);
        setRecipeUomTarget(sourceUom);
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, [recipeUomItemId, recipeUomVariantId, variants, catalogById, uomValues]);

  useEffect(() => {
    let active = true;
    const loadAvailable = async () => {
      if (!recipeUomWarehouseId || !recipeUomItemId) {
        setRecipeUomAvailable(null);
        return;
      }
      try {
        const res = await fetch("/api/recipe-uom/available", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            warehouse_id: recipeUomWarehouseId,
            item_id: recipeUomItemId,
            variant_key: recipeUomVariantId || "base",
          }),
        });
        if (!res.ok) throw new Error("Failed to load recipe UOM availability");
        const json = await res.json();
        if (!active) return;
        setRecipeUomAvailable(json.row || null);
      } catch (error) {
        if (!active) return;
        console.error(error);
        setRecipeUomAvailable(null);
      }
    };
    loadAvailable();
    return () => {
      active = false;
    };
  }, [recipeUomWarehouseId, recipeUomItemId, recipeUomVariantId]);

  const addLine = (setter: Dispatch<SetStateAction<PendingLine[]>>) => {
    setter((prev) => [...prev, { ingredientId: "", qty: "", uom: "pc", sourceWarehouseId: "" }]);
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

  const addRecipeUomStep = () => {
    setRecipeUomSteps((prev) => {
      const last = prev[prev.length - 1];
      const from = last?.to_uom || recipeUomSource || "pc";
      const to = recipeUomTarget || from;
      return [...prev, { id: createStepId(), from_uom: from, to_uom: to, multiplier: "1" }];
    });
  };

  const removeRecipeUomStep = (id: string) => {
    setRecipeUomSteps((prev) => prev.filter((step) => step.id !== id));
  };

  const updateRecipeUomStep = (id: string, field: keyof RecipeUomStep, value: string) => {
    setRecipeUomSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, [field]: value } : step))
    );
  };

  const saveRecipeUomProfile = async () => {
    if (readOnly) {
      setError("Read-only access: saving is disabled.");
      setSuccess(null);
      return;
    }
    if (!recipeUomItemId) {
      setError("Select a product to configure recipe UOMs.");
      setSuccess(null);
      return;
    }
    setRecipeUomSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const steps = recipeUomSteps
        .map((step, index) => ({
          step_order: index + 1,
          from_uom: normalizeRecipeUom(step.from_uom),
          to_uom: normalizeRecipeUom(step.to_uom),
          multiplier: Number(step.multiplier),
        }))
        .filter((step) => step.from_uom && step.to_uom && Number.isFinite(step.multiplier) && step.multiplier > 0);

      const payload = {
        item_id: recipeUomItemId,
        variant_key: recipeUomVariantId || "base",
        source_uom: normalizeRecipeUom(recipeUomSource || "pc"),
        target_uom: normalizeRecipeUom(recipeUomTarget || recipeUomSource || "pc"),
        steps,
      };

      const res = await fetch("/api/recipe-uom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to save recipe UOM profile");
      }
      const json = await res.json();
      setRecipeUomProfileId(json.profile?.id ?? null);
      setSuccess("Recipe UOM profile saved.");
    } catch (error) {
      setError(toErrorMessage(error) || "Unable to save recipe UOM profile.");
    } finally {
      setRecipeUomSaving(false);
    }
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

      const payload = validFinishedLines.map((line) => {
        const normalizedUom = normalizeRecipeUom(line.uom);
        if (!isAllowedRecipeUom(normalizedUom)) {
          throw new Error(`Invalid unit: ${line.uom}`);
        }
        return {
          finished_item_id: selectedFinished,
          finished_variant_key: "base",
          ingredient_item_id: line.ingredientId,
          qty_per_unit: Number(line.qty),
          qty_unit: normalizedUom,
          source_warehouse_id: line.sourceWarehouseId || null,
          recipe_for_kind: "finished",
          active: true,
        };
      });

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

      const payload = validIngredientLines.map((line) => {
        const normalizedUom = normalizeRecipeUom(line.uom);
        if (!isAllowedRecipeUom(normalizedUom)) {
          throw new Error(`Invalid unit: ${line.uom}`);
        }
        return {
          finished_item_id: selectedIngredientTarget,
          finished_variant_key: "base",
          ingredient_item_id: line.ingredientId,
          qty_per_unit: Number(line.qty),
          qty_unit: normalizedUom,
          source_warehouse_id: line.sourceWarehouseId || null,
          recipe_for_kind: "ingredient",
          active: true,
        };
      });

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

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Recipe UOM Setup</h2>
            <p className={styles.cardSubtitle}>
              Define how stock converts into a recipe UOM for each product + variant using a chain (A → B → C).
            </p>
          </div>
          <button className={styles.secondaryButton} type="button" onClick={addRecipeUomStep}>
            Add step
          </button>
        </div>

        <div className={styles.lineRow}>
          <div className={styles.lineField}>
            <span className={styles.label}>Product</span>
            <select
              className={styles.select}
              value={recipeUomItemId}
              aria-label="Recipe UOM product"
              onChange={(event) => {
                setRecipeUomItemId(event.target.value);
                setRecipeUomVariantId("");
              }}
            >
              <option value="">Select product...</option>
              {allCatalogItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.lineField}>
            <span className={styles.label}>Variant</span>
            <select
              className={styles.select}
              value={recipeUomVariantId}
              aria-label="Recipe UOM variant"
              onChange={(event) => setRecipeUomVariantId(event.target.value)}
              disabled={!recipeUomItemId}
            >
              <option value="">Base product (no variant)</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.lineField}>
            <span className={styles.label}>Source UOM</span>
            <input
              className={styles.input}
              value={formatRecipeUomLabel(recipeUomSource || "pc")}
              aria-label="Recipe UOM source unit"
              readOnly
            />
          </div>

          <div className={styles.lineField}>
            <span className={styles.label}>Recipe UOM</span>
            <select
              className={styles.select}
              value={recipeUomTarget}
              aria-label="Recipe UOM target unit"
              onChange={(event) => setRecipeUomTarget(event.target.value)}
            >
              {uoms.map((uom) => (
                <option key={uom.value} value={uom.value}>
                  {uom.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.lineField}>
            <span className={styles.label}>Warehouse (preview)</span>
            <select
              className={styles.select}
              value={recipeUomWarehouseId}
              aria-label="Recipe UOM warehouse preview"
              onChange={(event) => setRecipeUomWarehouseId(event.target.value)}
            >
              <option value="">Select warehouse...</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name ?? warehouse.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.linesHeader}>
          <span>Conversion chain (A → B → C)</span>
        </div>

        <div className={styles.lines}>
          {recipeUomSteps.length === 0 ? (
            <p className={styles.warehouseHint}>No conversion steps yet. Add one if your recipe UOM differs.</p>
          ) : (
            recipeUomSteps.map((step) => (
              <div key={step.id} className={styles.lineRow}>
                <div className={styles.lineField}>
                  <span className={styles.label}>From</span>
                  <select
                    className={styles.select}
                    value={step.from_uom}
                    aria-label="Recipe UOM step from"
                    onChange={(event) => updateRecipeUomStep(step.id, "from_uom", event.target.value)}
                  >
                    {uoms.map((uom) => (
                      <option key={uom.value} value={uom.value}>
                        {uom.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.lineField}>
                  <span className={styles.label}>To</span>
                  <select
                    className={styles.select}
                    value={step.to_uom}
                    aria-label="Recipe UOM step to"
                    onChange={(event) => updateRecipeUomStep(step.id, "to_uom", event.target.value)}
                  >
                    {uoms.map((uom) => (
                      <option key={uom.value} value={uom.value}>
                        {uom.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.lineField}>
                  <span className={styles.label}>Multiplier</span>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    min="0"
                    value={step.multiplier}
                    aria-label="Recipe UOM step multiplier"
                    onChange={(event) => updateRecipeUomStep(step.id, "multiplier", event.target.value)}
                  />
                </div>
                <div className={styles.lineField}>
                  <span className={styles.label}>Remove</span>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => removeRecipeUomStep(step.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.linesHeader}>
          <span>Available qty (preview)</span>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={saveRecipeUomProfile}
            disabled={recipeUomSaving}
          >
            {recipeUomSaving ? "Saving..." : "Save UOM Setup"}
          </button>
        </div>

        <div className={styles.lineRow}>
          {recipeUomAvailable ? (
            <>
              <div className={styles.lineField}>
                <span className={styles.label}>Base qty</span>
                <span>
                  {formatQty(recipeUomAvailable.base_qty)} {formatRecipeUomLabel(recipeUomAvailable.source_uom)}
                </span>
              </div>
              <div className={styles.lineField}>
                <span className={styles.label}>Recipe qty</span>
                <span>
                  {formatQty(recipeUomAvailable.recipe_qty)} {formatRecipeUomLabel(recipeUomAvailable.target_uom)}
                </span>
              </div>
            </>
          ) : (
            <span className={styles.warehouseHint}>
              {recipeUomProfileId
                ? "Profile saved. Pick a warehouse to preview available recipe qty."
                : "Pick a warehouse to preview available recipe qty."}
            </span>
          )}
        </div>
      </div>

      <div className={styles.modeToggle}>
        <button
          type="button"
          className={`${styles.modeButton} ${recipeMode === "finished" ? styles.modeButtonActive : ""}`}
          onClick={() => setRecipeMode("finished")}
        >
          Finished recipe
        </button>
        <button
          type="button"
          className={`${styles.modeButton} ${recipeMode === "ingredient" ? styles.modeButtonActive : ""}`}
          onClick={() => setRecipeMode("ingredient")}
        >
          Ingredient prep recipe
        </button>
      </div>

      {error && <div className={styles.toastError}>{error}</div>}
      {success && <div className={styles.toastSuccess}>{success}</div>}

      {recipeMode === "finished" && (
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
          {finishedLines.map((line, idx) => {
            const item = catalogById.get(line.ingredientId);
            const storageHomeId = item?.default_warehouse_id ?? "";
            const childOptions = storageHomeId ? childrenByParentId.get(storageHomeId) ?? [] : [];
            const warehouseOptions = childOptions.length ? childOptions : warehouses;
            const sourceValue = line.sourceWarehouseId || "";
            const storageLabel = storageHomeId
              ? warehouseById.get(storageHomeId)?.name || warehouseById.get(storageHomeId)?.code || storageHomeId
              : "Not set";
            return (
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
                <label className={styles.label}>Deduct from warehouse</label>
                {!line.ingredientId ? (
                  <span className={styles.warehouseHint}>Select an ingredient first.</span>
                ) : warehouseOptions.length ? (
                  <select
                    className={styles.select}
                    value={sourceValue}
                    onChange={(e) => updateLine(idx, "sourceWarehouseId", e.target.value, setFinishedLines)}
                    aria-label="Recipe source warehouse"
                  >
                    <option value="">Auto (use default sources)</option>
                    {warehouseOptions.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name ?? warehouse.code ?? warehouse.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={styles.warehouseHint}>Storage home: {storageLabel}</span>
                )}
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
            );
          })}
        </div>
      </section>
      )}

      {recipeMode === "ingredient" && (
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
          {ingredientLines.map((line, idx) => {
            const item = catalogById.get(line.ingredientId);
            const storageHomeId = item?.default_warehouse_id ?? "";
            const childOptions = storageHomeId ? childrenByParentId.get(storageHomeId) ?? [] : [];
            const warehouseOptions = childOptions.length ? childOptions : warehouses;
            const sourceValue = line.sourceWarehouseId || "";
            const storageLabel = storageHomeId
              ? warehouseById.get(storageHomeId)?.name || warehouseById.get(storageHomeId)?.code || storageHomeId
              : "Not set";
            return (
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
                <label className={styles.label}>Deduct from warehouse</label>
                {!line.ingredientId ? (
                  <span className={styles.warehouseHint}>Select a raw item first.</span>
                ) : warehouseOptions.length ? (
                  <select
                    className={styles.select}
                    value={sourceValue}
                    onChange={(e) => updateLine(idx, "sourceWarehouseId", e.target.value, setIngredientLines)}
                    aria-label="Recipe source warehouse"
                  >
                    <option value="">Auto (use default sources)</option>
                    {warehouseOptions.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name ?? warehouse.code ?? warehouse.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={styles.warehouseHint}>Storage home: {storageLabel}</span>
                )}
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
            );
          })}
        </div>
      </section>
      )}
    </div>
  );
}

export default function RecipesPageWrapper() {
  return (
    <Suspense fallback={<div className={styles.page}><main className={styles.shell}>Loading...</main></div>}>
      <RecipesPage />
    </Suspense>
  );
}
