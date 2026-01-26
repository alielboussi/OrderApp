"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./outlet-setup.module.css";
import { useWarehouseAuth } from "../useWarehouseAuth";

// Types shared across panels
interface Outlet {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean | null;
  default_sales_warehouse_id?: string | null;
}
interface Warehouse { id: string; name: string; code?: string | null; active?: boolean | null }
interface PosMapping {
  pos_item_id: string;
  pos_item_name?: string | null;
  pos_flavour_id?: string | null;
  pos_flavour_name?: string | null;
  catalog_item_id: string;
  catalog_item_name?: string | null;
  catalog_variant_key?: string | null;
  warehouse_id?: string | null;
  outlet_id: string;
}
interface Item {
  id: string;
  name: string;
  item_kind?: string | null;
  storage_home_id?: string | null;
  default_warehouse_id?: string | null;
  has_recipe?: boolean | null;
}
interface Variant { id: string; item_id: string; name: string; sku?: string | null; active?: boolean | null; item_kind?: string | null }
interface RouteOption {
  value: string;
  label: string;
  itemId: string;
  variantKey: string;
  kind: string;
}

type RouteRecord = Record<string, string>;

const parseRouteValue = (value: string) => {
  if (!value) return { itemId: "", variantKey: "base" };
  const [itemId, variantKey] = value.split("::");
  return { itemId, variantKey: variantKey || "base" };
};

const isVariantSelection = (value: string) => value.includes("::");

const resolveItemId = (value: string) => {
  if (!value) return "";
  if (!value.includes("::")) return value;
  return value.split("::")[0];
};

type Alert = { ok: boolean; text: string } | null;

export default function OutletSetupPage() {
  const router = useRouter();
  const { status, readOnly, deleteDisabled } = useWarehouseAuth();

  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);

  // Deduction routing state (product/variant/ingredient/raw → warehouse per outlet)
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedRoutingVariantKeys, setSelectedRoutingVariantKeys] = useState<string[]>(["base"]);
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>("");
  const [selectedRawId, setSelectedRawId] = useState<string>("");

  type RoutingGroup = "product" | "ingredient" | "raw";

  const [productRoutes, setProductRoutes] = useState<RouteRecord>({});
  const [ingredientRoutes, setIngredientRoutes] = useState<RouteRecord>({});
  const [rawRoutes, setRawRoutes] = useState<RouteRecord>({});
  const [routingLoading, setRoutingLoading] = useState<Record<RoutingGroup, boolean>>({
    product: false,
    ingredient: false,
    raw: false,
  });
  const [routingSavingKind, setRoutingSavingKind] = useState<RoutingGroup | null>(null);
  const [routingMessage, setRoutingMessage] = useState<Record<RoutingGroup, Alert>>({
    product: null,
    ingredient: null,
    raw: null,
  });
  const [saveAllMessage, setSaveAllMessage] = useState<Alert>(null);
  const [combinedSaveMessage, setCombinedSaveMessage] = useState<Alert>(null);
  const [mappingsSaving, setMappingsSaving] = useState(false);
  const [recipeIngredientIds, setRecipeIngredientIds] = useState<string[]>([]);
  const [recipeIngredientsLoading, setRecipeIngredientsLoading] = useState(false);
  const [productDefaultWarehouseId, setProductDefaultWarehouseId] = useState<string>("");
  const [productDefaultWarehouseSaving, setProductDefaultWarehouseSaving] = useState(false);
  const [productDefaultWarehouseMessage, setProductDefaultWarehouseMessage] = useState<Alert>(null);
  const [defaultWarehouseId, setDefaultWarehouseId] = useState<string>("");
  const [defaultWarehouseSaving, setDefaultWarehouseSaving] = useState(false);
  const [defaultWarehouseMessage, setDefaultWarehouseMessage] = useState<Alert>(null);
  const [rawDefaultWarehouseId, setRawDefaultWarehouseId] = useState<string>("");
  const [rawDefaultWarehouseSaving, setRawDefaultWarehouseSaving] = useState(false);
  const [rawDefaultWarehouseMessage, setRawDefaultWarehouseMessage] = useState<Alert>(null);
  const [storageHomesSaving, setStorageHomesSaving] = useState(false);
  const [storageAllMessage, setStorageAllMessage] = useState<Alert>(null);
  const [savingAll, setSavingAll] = useState(false);

  // POS item ↔ catalog mapping (preview + quick add)
  const [posMappings, setPosMappings] = useState<PosMapping[]>([]);
  const [posSearch, setPosSearch] = useState("");
  const [posLimit, setPosLimit] = useState<number | "all">(50);
  const [posLoading, setPosLoading] = useState(false);
  const [posError, setPosError] = useState<Alert>(null);
  const [posCreating, setPosCreating] = useState(false);
  const [posDeletingKey, setPosDeletingKey] = useState<string | null>(null);
  const [selectedVariantKeys, setSelectedVariantKeys] = useState<string[]>(["base"]);
  const [posForm, setPosForm] = useState({
    pos_item_id: "",
    pos_item_name: "",
    pos_flavour_id: "",
    pos_flavour_name: "",
    catalog_item_id: "",
    catalog_variant_key: "base",
    warehouse_id: "",
    outlet_id: "",
  });

  const updatePosForm = (key: keyof typeof posForm, value: string) => {
    setPosForm((prev) => ({ ...prev, [key]: value }));
  };

  const warehouseOptions = useMemo(() => [...warehouses], [warehouses]);
  const storageHomeOptions = useMemo(() => [{ id: "", name: "Not set" }, ...warehouses], [warehouses]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const baseIngredientOptions = useMemo<RouteOption[]>(() => {
    const filtered = items
      .filter((it) => (it.item_kind ?? "product") === "ingredient")
      .map((it) => ({
        value: it.id,
        label: it.name,
        itemId: it.id,
        variantKey: "base",
        kind: "ingredient",
      }));
    return filtered.length
      ? [{ value: "", label: "Select ingredient", itemId: "", variantKey: "base", kind: "ingredient" }, ...filtered]
      : [{ value: "", label: "No ingredients found", itemId: "", variantKey: "base", kind: "ingredient" }];
  }, [items]);
  const baseRawOptions = useMemo<RouteOption[]>(() => {
    const filtered = items
      .filter((it) => (it.item_kind ?? "product") === "raw")
      .map((it) => ({
        value: it.id,
        label: it.name,
        itemId: it.id,
        variantKey: "base",
        kind: "raw",
      }));
    return filtered.length
      ? [{ value: "", label: "Select raw", itemId: "", variantKey: "base", kind: "raw" }, ...filtered]
      : [{ value: "", label: "No raws found", itemId: "", variantKey: "base", kind: "raw" }];
  }, [items]);
  const ingredientOptions = useMemo<RouteOption[]>(() => {
    const hasProductFilter = Boolean(selectedProductId);
    const ingredientSet = new Set(recipeIngredientIds);
    if (!hasProductFilter) {
      return [{ value: "", label: "Select a product first", itemId: "", variantKey: "base", kind: "ingredient" }];
    }
    if (recipeIngredientsLoading) {
      return [{ value: "", label: "Loading recipe ingredients...", itemId: "", variantKey: "base", kind: "ingredient" }];
    }
    const filtered = baseIngredientOptions.filter((opt) => opt.itemId && ingredientSet.has(opt.itemId));
    return filtered.length
      ? [{ value: "", label: "Select ingredient", itemId: "", variantKey: "base", kind: "ingredient" }, ...filtered]
      : [{ value: "", label: "No ingredients for selected product", itemId: "", variantKey: "base", kind: "ingredient" }];
  }, [baseIngredientOptions, selectedProductId, recipeIngredientIds, recipeIngredientsLoading]);
  const rawOptions = useMemo<RouteOption[]>(() => baseRawOptions, [baseRawOptions]);
  const productOptions = useMemo<RouteOption[]>(() => {
    const filtered = items
      .filter((it) => {
        const kind = it.item_kind ?? "product";
        return kind !== "ingredient" && kind !== "raw";
      })
      .map((it) => ({
        value: it.id,
        label: it.name,
        itemId: it.id,
        variantKey: "base",
        kind: it.item_kind ?? "product",
      }));
    return filtered.length
      ? [{ value: "", label: "Select product", itemId: "", variantKey: "base", kind: "product" }, ...filtered]
      : [{ value: "", label: "No products found", itemId: "", variantKey: "base", kind: "product" }];
  }, [items]);
  const productVariantOptions = useMemo(() => {
    const base = { value: "base", label: "Base product" };
    if (!selectedProductId) return [base];
    const scoped = variants
      .filter((variant) => variant.item_id === selectedProductId)
      .map((variant) => ({
        value: variant.id,
        label: variant.name || variant.id,
      }));
    return [base, ...scoped];
  }, [selectedProductId, variants]);
  const itemOptions = useMemo(() => [{ id: "", name: "Select catalog item" }, ...items], [items]);
  const posVariantOptions = useMemo(() => {
    const base = { value: "base", label: "Use base product" };
    if (!posForm.catalog_item_id) return [base];
    const scoped = variants
      .filter((variant) => variant.item_id === posForm.catalog_item_id)
      .map((variant) => ({
        value: variant.id,
        label: variant.name || variant.id,
      }));
    return [base, ...scoped];
  }, [posForm.catalog_item_id, variants]);
  const variantLabels = useMemo(() => {
    const map: Record<string, string> = { base: "base" };
    variants.forEach((variant) => {
      map[variant.id] = variant.name || variant.id;
    });
    return map;
  }, [variants]);

  const outletSelectOptions = useMemo(
    () => outlets.map((o) => ({ value: o.id, label: `${o.name}${o.code ? ` (${o.code})` : ""}` })),
    [outlets]
  );
  const warehouseSelectOptions = useMemo(
    () => warehouses.map((w) => ({ value: w.id, label: `${w.name}${w.code ? ` (${w.code})` : ""}` })),
    [warehouses]
  );
  const selectedProduct = useMemo(() => items.find((it) => it.id === selectedProductId), [items, selectedProductId]);
  const ingredientSelectOptions: RouteOption[] = ingredientOptions;
  const rawSelectOptions: RouteOption[] = rawOptions;
  const anyRoutingLoading = routingLoading.product;

  const filteredPosMappings = useMemo(() => {
    const term = posSearch.trim().toLowerCase();
    const filtered = term
      ? posMappings.filter((m) =>
          [
            m.pos_item_id,
            m.pos_item_name ?? "",
            m.pos_flavour_id ?? "",
            m.pos_flavour_name ?? "",
            m.catalog_item_id,
            m.catalog_item_name ?? "",
            m.catalog_variant_key ?? "",
            m.warehouse_id ?? "",
            m.outlet_id,
          ].some((v) => v.toLowerCase().includes(term))
        )
      : posMappings;
    const limited = posLimit === "all" ? filtered : filtered.slice(0, posLimit);
    return { list: limited, total: filtered.length };
  }, [posMappings, posSearch, posLimit]);

  // Load base data (outlets, warehouses, items) once authenticated
  useEffect(() => {
    if (status !== "ok") return;
    async function loadBasics() {
      try {
        const [outletRes, warehouseRes, itemRes, variantRes] = await Promise.all([
          fetch("/api/outlets"),
          fetch("/api/warehouses"),
          fetch("/api/catalog/items"),
          fetch("/api/catalog/variants"),
        ]);

        if (outletRes.ok) {
          const json = await outletRes.json();
          const list: Outlet[] = Array.isArray(json.outlets) ? json.outlets : [];
          setOutlets(list);
        }
        if (warehouseRes.ok) {
          const json = await warehouseRes.json();
          setWarehouses(Array.isArray(json.warehouses) ? json.warehouses : []);
        }
        if (itemRes.ok) {
          const json = await itemRes.json();
          const list: Item[] = Array.isArray(json.items) ? json.items : [];
          setItems(list);
        }
        if (variantRes.ok) {
          const json = await variantRes.json();
          const list: Variant[] = Array.isArray(json.variants) ? json.variants : [];
          setVariants(list);
        }
      } catch (error) {
        console.error("setup preload failed", error);
        setRoutingMessage((prev) => ({ ...prev, product: { ok: false, text: "Failed to load basics" } }));
      }
    }
    loadBasics();
  }, [status]);

  // Load routes for selected product (base)
  useEffect(() => {
    if (status !== "ok") return;
    if (!selectedProductId) {
      setSelectedRoutingVariantKeys((prev) => {
        if (prev.length === 1 && prev[0] === "base") {
          return prev;
        }
        return ["base"];
      });
      setProductRoutes({});
      setRoutingMessage((prev) => ({ ...prev, product: null }));
      setRoutingLoading((prev) => ({ ...prev, product: false }));
      return;
    }
    const activeVariantKeys = selectedRoutingVariantKeys.length ? selectedRoutingVariantKeys : ["base"];
    if (activeVariantKeys.length !== 1) {
      return;
    }
    const loadRoutes = async () => {
      setRoutingLoading((prev) => ({ ...prev, product: true }));
      setRoutingMessage((prev) => ({ ...prev, product: null }));
      try {
        const res = await fetch(`/api/outlet-routes?item_id=${selectedProductId}&variant_key=${activeVariantKeys[0]}`);
        if (!res.ok) throw new Error("Could not load routes");
        const json = await res.json();
        const routeMap: RouteRecord = {};
        (Array.isArray(json.routes) ? json.routes : []).forEach((route: { outlet_id?: string; warehouse_id?: string | null }) => {
          if (route.outlet_id) {
            routeMap[route.outlet_id] = route.warehouse_id ?? "";
          }
        });
        setProductRoutes(routeMap);
      } catch (error) {
        console.error("product outlet routes load failed", error);
        setRoutingMessage((prev) => ({ ...prev, product: { ok: false, text: "Unable to load product routes" } }));
      } finally {
        setRoutingLoading((prev) => ({ ...prev, product: false }));
      }
    };
    loadRoutes();
  }, [selectedProductId, selectedRoutingVariantKeys, status]);

  // Load routes for selected ingredient (scoped to recipe ingredients)
  useEffect(() => {
    if (status !== "ok") return;
    if (!selectedIngredientId) {
      setIngredientRoutes({});
      setRoutingMessage((prev) => ({ ...prev, ingredient: null }));
      setRoutingLoading((prev) => ({ ...prev, ingredient: false }));
      return;
    }
    const loadRoutes = async () => {
      setRoutingLoading((prev) => ({ ...prev, ingredient: true }));
      setRoutingMessage((prev) => ({ ...prev, ingredient: null }));
      try {
        const res = await fetch(`/api/outlet-routes?item_id=${selectedIngredientId}&variant_key=base`);
        if (!res.ok) throw new Error("Could not load ingredient routes");
        const json = await res.json();
        const routeMap: RouteRecord = {};
        (Array.isArray(json.routes) ? json.routes : []).forEach((route: { outlet_id?: string; warehouse_id?: string | null }) => {
          if (route.outlet_id) {
            routeMap[route.outlet_id] = route.warehouse_id ?? "";
          }
        });
        setIngredientRoutes(routeMap);
      } catch (error) {
        console.error("ingredient outlet routes load failed", error);
        setRoutingMessage((prev) => ({ ...prev, ingredient: { ok: false, text: "Unable to load ingredient routes" } }));
      } finally {
        setRoutingLoading((prev) => ({ ...prev, ingredient: false }));
      }
    };
    loadRoutes();
  }, [selectedIngredientId, status]);

  // Load routes for selected raw
  useEffect(() => {
    if (status !== "ok") return;
    if (!selectedRawId) {
      setRawRoutes({});
      setRoutingMessage((prev) => ({ ...prev, raw: null }));
      setRoutingLoading((prev) => ({ ...prev, raw: false }));
      return;
    }
    const loadRoutes = async () => {
      setRoutingLoading((prev) => ({ ...prev, raw: true }));
      setRoutingMessage((prev) => ({ ...prev, raw: null }));
      try {
        const res = await fetch(`/api/outlet-routes?item_id=${selectedRawId}&variant_key=base`);
        if (!res.ok) throw new Error("Could not load raw routes");
        const json = await res.json();
        const routeMap: RouteRecord = {};
        (Array.isArray(json.routes) ? json.routes : []).forEach((route: { outlet_id?: string; warehouse_id?: string | null }) => {
          if (route.outlet_id) {
            routeMap[route.outlet_id] = route.warehouse_id ?? "";
          }
        });
        setRawRoutes(routeMap);
      } catch (error) {
        console.error("raw outlet routes load failed", error);
        setRoutingMessage((prev) => ({ ...prev, raw: { ok: false, text: "Unable to load raw routes" } }));
      } finally {
        setRoutingLoading((prev) => ({ ...prev, raw: false }));
      }
    };
    loadRoutes();
  }, [selectedRawId, status]);

  useEffect(() => {
    if (!selectedRawId) {
      setRawDefaultWarehouseId("");
      setRawDefaultWarehouseMessage(null);
      return;
    }
    const raw = items.find((it) => it.id === resolveItemId(selectedRawId));
    setRawDefaultWarehouseId(raw?.storage_home_id ?? raw?.default_warehouse_id ?? "");
  }, [selectedRawId, items]);

  useEffect(() => {
    if (!selectedIngredientId) {
      setDefaultWarehouseId("");
      setDefaultWarehouseMessage(null);
      return;
    }
    const ingredient = items.find((it) => it.id === resolveItemId(selectedIngredientId));
    setDefaultWarehouseId(ingredient?.storage_home_id ?? ingredient?.default_warehouse_id ?? "");
  }, [selectedIngredientId, items]);

  useEffect(() => {
    if (!selectedIngredientId) return;
    const valid = ingredientSelectOptions.some((opt) => opt.value === selectedIngredientId);
    if (!valid) {
      setSelectedIngredientId("");
      setDefaultWarehouseId("");
    }
  }, [selectedIngredientId, ingredientSelectOptions]);

  useEffect(() => {
    if (!selectedProductId) {
      setProductDefaultWarehouseId("");
      setProductDefaultWarehouseMessage(null);
      return;
    }
    const prod = items.find((it) => it.id === selectedProductId);
    setProductDefaultWarehouseId(prod?.storage_home_id ?? prod?.default_warehouse_id ?? "");
  }, [selectedProductId, items]);

  useEffect(() => {
    if (!selectedProductId) {
      setRecipeIngredientIds([]);
      return;
    }
    let active = true;
    const loadRecipeIngredients = async () => {
      setRecipeIngredientsLoading(true);
      try {
        const keys = selectedVariantKeys.length ? selectedVariantKeys : ["base"];
        const results = await Promise.all(
          keys.map(async (key) => {
            const res = await fetch(
              `/api/recipe-ingredients?finished_item_id=${selectedProductId}&finished_variant_key=${encodeURIComponent(key || "base")}`
            );
            if (!res.ok) throw new Error("Unable to load recipe ingredients");
            const json = await res.json();
            return Array.isArray(json.ingredient_item_ids) ? json.ingredient_item_ids : [];
          })
        );
        if (!active) return;
        const merged = Array.from(new Set(results.flat())) as string[];
        setRecipeIngredientIds(merged);
      } catch (error) {
        console.error("recipe ingredients load failed", error);
        if (active) setRecipeIngredientIds([]);
      } finally {
        if (active) setRecipeIngredientsLoading(false);
      }
    };
    loadRecipeIngredients();
    return () => {
      active = false;
    };
  }, [selectedProductId, selectedVariantKeys]);

  useEffect(() => {
    if (status !== "ok") return;
    const loadPos = async () => {
      setPosLoading(true);
      setPosError(null);
      try {
        const res = await fetch("/api/catalog/pos-item-map");
        if (!res.ok) throw new Error("Failed to load POS mappings");
        const json = await res.json();
        setPosMappings(Array.isArray(json.mappings) ? json.mappings : []);
      } catch (error) {
        console.error(error);
        setPosError({ ok: false, text: error instanceof Error ? error.message : "Unable to load POS mappings" });
      } finally {
        setPosLoading(false);
      }
    };
    loadPos();
  }, [status]);

  const routesFor = (group: RoutingGroup) => {
    if (group === "ingredient") return ingredientRoutes;
    if (group === "raw") return rawRoutes;
    return productRoutes;
  };

  const setRoute = (group: RoutingGroup, outletId: string, warehouseId: string) => {
    if (group === "ingredient") {
      setIngredientRoutes((prev) => ({ ...prev, [outletId]: warehouseId }));
      return;
    }
    if (group === "raw") {
      setRawRoutes((prev) => ({ ...prev, [outletId]: warehouseId }));
      return;
    }
    setProductRoutes((prev) => ({ ...prev, [outletId]: warehouseId }));
  };

  const clearRoutes = (group: RoutingGroup) => {
    if (group === "ingredient") {
      setIngredientRoutes({});
      return;
    }
    if (group === "raw") {
      setRawRoutes({});
      return;
    }
    setProductRoutes({});
  };

  const clearAllRoutes = () => {
    setProductRoutes({});
    setIngredientRoutes({});
    setRawRoutes({});
  };

  const saveRoutes = async (group: RoutingGroup) => {
    if (readOnly) {
      setRoutingMessage((prev) => ({ ...prev, [group]: { ok: false, text: "Read-only access: saving is disabled." } }));
      return;
    }
    const selection =
      group === "ingredient"
        ? { itemId: selectedIngredientId, variantKeys: ["base"] }
        : group === "raw"
          ? { itemId: selectedRawId, variantKeys: ["base"] }
          : { itemId: selectedProductId, variantKeys: selectedRoutingVariantKeys.length ? selectedRoutingVariantKeys : ["base"] };

    const label =
      group === "ingredient" ? "ingredient" : group === "raw" ? "raw" : "product";

    if (!selection.itemId) {
      setRoutingMessage((prev) => ({ ...prev, [group]: { ok: false, text: `Choose a ${label} first` } }));
      return;
    }

    if (group === "product" && selection.variantKeys.length === 0) {
      setRoutingMessage((prev) => ({ ...prev, [group]: { ok: false, text: "Select at least one variant" } }));
      return;
    }

    const currentRoutes = routesFor(group);
    const hasAnyRoute = outlets.some((outlet) => Boolean(currentRoutes[outlet.id]));
    if (!hasAnyRoute) {
      setRoutingMessage((prev) => ({ ...prev, [group]: { ok: false, text: "Select a warehouse for at least one outlet" } }));
      return;
    }

    setRoutingSavingKind(group);
    setRoutingMessage((prev) => ({ ...prev, [group]: null }));
    try {
      const routesPayload = outlets.map((outlet) => ({ outlet_id: outlet.id, warehouse_id: currentRoutes[outlet.id] || null }));
      for (const variantKey of selection.variantKeys) {
        const payload = {
          item_id: selection.itemId,
          variant_key: variantKey,
          routes: routesPayload,
        };

        const res = await fetch("/api/outlet-routes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Could not save routes");
        }
      }

      setRoutingMessage((prev) => ({ ...prev, [group]: { ok: true, text: "Mappings saved" } }));
    } catch (error) {
      console.error(error);
      setRoutingMessage((prev) => ({
        ...prev,
        [group]: { ok: false, text: error instanceof Error ? error.message : "Failed to save" },
      }));
    } finally {
      setRoutingSavingKind(null);
    }
  };

  const saveAllRoutes = async (): Promise<boolean> => {
    if (readOnly) {
      setSaveAllMessage({ ok: false, text: "Read-only access: saving is disabled." });
      return false;
    }
    if (!selectedProductId) {
      setSaveAllMessage({ ok: false, text: "Select a product first" });
      return false;
    }
    const hasAnyRoute = Object.values(productRoutes).some(Boolean);
    if (!hasAnyRoute) {
      setSaveAllMessage({ ok: false, text: "Set at least one warehouse before saving" });
      return false;
    }
    setMappingsSaving(true);
    setSaveAllMessage(null);
    try {
      await saveRoutes("product");
      setSaveAllMessage({ ok: true, text: "Mappings saved" });
      return true;
    } catch (error) {
      setSaveAllMessage({ ok: false, text: error instanceof Error ? error.message : "Failed to save mappings" });
      return false;
    } finally {
      setMappingsSaving(false);
    }
  };


  const saveDefaultWarehouse = async () => {
    if (readOnly) {
      setDefaultWarehouseMessage({ ok: false, text: "Read-only access: saving is disabled." });
      return;
    }
    if (!selectedIngredientId) {
      setDefaultWarehouseMessage({ ok: false, text: "Choose an ingredient first" });
      return;
    }
    if (isVariantSelection(selectedIngredientId)) {
      setDefaultWarehouseMessage({ ok: false, text: "Default warehouse applies to base items only" });
      return;
    }
    setDefaultWarehouseSaving(true);
    setDefaultWarehouseMessage(null);
    try {
      const res = await fetch("/api/item-storage-homes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: selectedIngredientId, storage_warehouse_id: defaultWarehouseId || null }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to save default warehouse");
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === selectedIngredientId
            ? { ...it, storage_home_id: defaultWarehouseId || null, default_warehouse_id: defaultWarehouseId || null }
            : it
        )
      );
      setDefaultWarehouseMessage({ ok: true, text: "Ingredient storage home saved" });
    } catch (error) {
      console.error(error);
      setDefaultWarehouseMessage({ ok: false, text: error instanceof Error ? error.message : "Could not save" });
    } finally {
      setDefaultWarehouseSaving(false);
    }
  };

  const saveProductDefaultWarehouse = async () => {
    if (readOnly) {
      setProductDefaultWarehouseMessage({ ok: false, text: "Read-only access: saving is disabled." });
      return;
    }
    if (!selectedProductId) {
      setProductDefaultWarehouseMessage({ ok: false, text: "Choose a product first" });
      return;
    }
    const baseOnly = !selectedRoutingVariantKeys.length || (selectedRoutingVariantKeys.length === 1 && selectedRoutingVariantKeys[0] === "base");
    if (!baseOnly) {
      setProductDefaultWarehouseMessage({ ok: false, text: "Default warehouse applies to base items only" });
      return;
    }
    if (!productDefaultWarehouseId) {
      setProductDefaultWarehouseMessage({ ok: false, text: "Select a storage home" });
      return;
    }
    setProductDefaultWarehouseSaving(true);
    setProductDefaultWarehouseMessage(null);
    try {
      const detailRes = await fetch(`/api/catalog/items?id=${selectedProductId}`);
      if (!detailRes.ok) throw new Error("Could not load product details");
      const detailJson = await detailRes.json();
      const item = detailJson.item as Record<string, any> | undefined;
      if (!item) throw new Error("Product not found");

      const payload = {
        id: selectedProductId,
        name: item.name,
        sku: item.sku ?? null,
        item_kind: item.item_kind ?? "product",
        consumption_unit: item.consumption_unit ?? item.consumption_uom ?? "each",
        consumption_qty_per_base: item.consumption_qty_per_base ?? 1,
        storage_unit: item.storage_unit ?? null,
        storage_weight: item.storage_weight ?? null,
        cost: item.cost ?? 0,
        has_variations: item.has_variations ?? false,
        has_recipe: item.has_recipe ?? false,
        outlet_order_visible: item.outlet_order_visible ?? true,
        image_url: item.image_url ?? null,
        storage_home_id: productDefaultWarehouseId || null,
        default_warehouse_id: productDefaultWarehouseId || null,
        active: item.active ?? true,
        purchase_pack_unit: item.purchase_pack_unit ?? item.consumption_unit ?? item.consumption_uom ?? "each",
        units_per_purchase_pack: item.units_per_purchase_pack ?? 1,
        purchase_unit_mass: item.purchase_unit_mass ?? null,
        purchase_unit_mass_uom: item.purchase_unit_mass_uom ?? null,
        consumption_unit_mass: item.consumption_unit_mass ?? null,
        consumption_unit_mass_uom: item.consumption_unit_mass_uom ?? null,
        transfer_unit: item.transfer_unit ?? item.consumption_unit ?? item.consumption_uom ?? "each",
        transfer_quantity: item.transfer_quantity ?? 1,
        qty_decimal_places: item.qty_decimal_places ?? 0,
        stocktake_uom: item.stocktake_uom ?? null,
      };

      const res = await fetch("/api/catalog/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to save product default warehouse");
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === selectedProductId
            ? { ...it, storage_home_id: productDefaultWarehouseId || null, default_warehouse_id: productDefaultWarehouseId || null }
            : it
        )
      );
      setProductDefaultWarehouseMessage({ ok: true, text: "Product default warehouse saved" });
    } catch (error) {
      console.error(error);
      setProductDefaultWarehouseMessage({ ok: false, text: error instanceof Error ? error.message : "Could not save" });
    } finally {
      setProductDefaultWarehouseSaving(false);
    }
  };

  const saveStorageHomesAll = async (): Promise<boolean> => {
    if (readOnly) {
      setStorageAllMessage({ ok: false, text: "Read-only access: saving is disabled." });
      return false;
    }
    const hasAnySelection = selectedProductId || selectedIngredientId || selectedRawId;
    if (!hasAnySelection) {
      setStorageAllMessage({ ok: false, text: "Select a product, ingredient, or raw first" });
      return false;
    }
    setStorageHomesSaving(true);
    setStorageAllMessage(null);
    try {
      if (selectedIngredientId && defaultWarehouseId) {
        await saveDefaultWarehouse();
      }
      if (selectedRawId && rawDefaultWarehouseId) {
        await saveRawDefaultWarehouse();
      }
      setStorageAllMessage({ ok: true, text: "Storage homes saved" });
      return true;
    } catch (error) {
      setStorageAllMessage({ ok: false, text: error instanceof Error ? error.message : "Failed to save storage homes" });
      return false;
    } finally {
      setStorageHomesSaving(false);
    }
  };

  const saveRawDefaultWarehouse = async () => {
    if (readOnly) {
      setRawDefaultWarehouseMessage({ ok: false, text: "Read-only access: saving is disabled." });
      return;
    }
    if (!selectedRawId) {
      setRawDefaultWarehouseMessage({ ok: false, text: "Choose a raw first" });
      return;
    }
    if (isVariantSelection(selectedRawId)) {
      setRawDefaultWarehouseMessage({ ok: false, text: "Default warehouse applies to base items only" });
      return;
    }
    setRawDefaultWarehouseSaving(true);
    setRawDefaultWarehouseMessage(null);
    try {
      const res = await fetch("/api/item-storage-homes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: selectedRawId, storage_warehouse_id: rawDefaultWarehouseId || null }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to save raw default warehouse");
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === selectedRawId
            ? { ...it, storage_home_id: rawDefaultWarehouseId || null, default_warehouse_id: rawDefaultWarehouseId || null }
            : it
        )
      );
      setRawDefaultWarehouseMessage({ ok: true, text: "Raw default warehouse saved" });
    } catch (error) {
      console.error(error);
      setRawDefaultWarehouseMessage({ ok: false, text: error instanceof Error ? error.message : "Could not save" });
    } finally {
      setRawDefaultWarehouseSaving(false);
    }
  };

  const saveEverything = async () => {
    if (readOnly) {
      setCombinedSaveMessage({ ok: false, text: "Read-only access: saving is disabled." });
      return;
    }
    setSavingAll(true);
    setCombinedSaveMessage(null);
    try {
      const storageOk = await saveStorageHomesAll();
      if (storageOk === false) {
        throw new Error("Storage homes incomplete");
      }
      const routesOk = await saveAllRoutes();
      if (routesOk === false) {
        throw new Error("Outlet mappings incomplete");
      }
      setCombinedSaveMessage({ ok: true, text: "Storage homes and mappings saved" });
    } catch (error) {
      setCombinedSaveMessage({ ok: false, text: error instanceof Error ? error.message : "Save failed" });
    } finally {
      setSavingAll(false);
    }
  };

  const createPosMapping = async () => {
    const catalogId = posForm.catalog_item_id.trim();
    if (readOnly) {
      setPosError({ ok: false, text: "Read-only access: saving is disabled." });
      return;
    }
    const outletId = posForm.outlet_id.trim();
    const derivedPosItemId = posForm.pos_item_id.trim();
    const selectedCatalog = items.find((it) => it.id === catalogId);
    const derivedPosItemName = posForm.pos_item_name.trim() || selectedCatalog?.name || null;

    const variantKeys = (selectedVariantKeys.length ? selectedVariantKeys : [posForm.catalog_variant_key || "base"]).map((v) =>
      v.trim()
    );

    if (!derivedPosItemId || !catalogId || !outletId) {
      setPosError({ ok: false, text: "POS item id, catalog item, and outlet are required" });
      return;
    }
    if (derivedPosItemId === catalogId) {
      setPosError({ ok: false, text: "POS item id cannot be the same as the catalog item id" });
      return;
    }
    setPosCreating(true);
    setPosError(null);
    try {
      for (const variantKey of variantKeys) {
        const res = await fetch("/api/catalog/pos-item-map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pos_item_id: derivedPosItemId,
            pos_item_name: derivedPosItemName,
            pos_flavour_id: posForm.pos_flavour_id.trim() || null,
            pos_flavour_name: posForm.pos_flavour_name.trim() || null,
            catalog_item_id: catalogId,
            catalog_variant_key: variantKey || "base",
            warehouse_id: posForm.warehouse_id.trim() || null,
            outlet_id: outletId,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to create mapping");
        }
      }
      setPosForm({
        pos_item_id: "",
        pos_item_name: "",
        pos_flavour_id: "",
        pos_flavour_name: "",
        catalog_item_id: "",
        catalog_variant_key: "base",
        warehouse_id: "",
        outlet_id: "",
      });
      setSelectedVariantKeys(["base"]);
      const refreshed = await fetch("/api/catalog/pos-item-map");
      if (refreshed.ok) {
        const json = await refreshed.json();
        setPosMappings(Array.isArray(json.mappings) ? json.mappings : []);
      }
    } catch (error) {
      console.error(error);
      setPosError({ ok: false, text: error instanceof Error ? error.message : "Failed to create mapping" });
    } finally {
      setPosCreating(false);
    }
  };

  const deletePosMapping = async (mapping: PosMapping) => {
    if (deleteDisabled) {
      setPosError({ ok: false, text: "Delete access is disabled for this user." });
      return;
    }
    const params = new URLSearchParams({
      pos_item_id: mapping.pos_item_id,
      catalog_item_id: mapping.catalog_item_id,
      outlet_id: mapping.outlet_id,
    });
    if (mapping.pos_flavour_id) params.append("pos_flavour_id", mapping.pos_flavour_id);
    if (mapping.catalog_variant_key) params.append("catalog_variant_key", mapping.catalog_variant_key);
    if (mapping.warehouse_id) params.append("warehouse_id", mapping.warehouse_id);

    setPosError(null);
    const deleteKey = `${mapping.pos_item_id}-${mapping.pos_flavour_id ?? "_"}-${mapping.catalog_item_id}-${mapping.catalog_variant_key ?? "base"}-${mapping.outlet_id}-${mapping.warehouse_id ?? "_"}`;
    setPosDeletingKey(deleteKey);
    try {
      const res = await fetch(`/api/catalog/pos-item-map?${params.toString()}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to delete mapping");
      }
      const refreshed = await fetch("/api/catalog/pos-item-map");
      if (refreshed.ok) {
        const json = await refreshed.json();
        setPosMappings(Array.isArray(json.mappings) ? json.mappings : []);
      }
    } catch (error) {
      console.error(error);
      setPosError({ ok: false, text: error instanceof Error ? error.message : "Failed to delete mapping" });
    } finally {
      setPosDeletingKey(null);
    }
  };

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>Outlet setup</p>
            <h1 className={styles.title}>Assign products and warehouses</h1>
            <p className={styles.subtitle}>
              One place to choose which warehouses outlets use and which catalog items they can deduct from.
            </p>
          </div>
          <div className={styles.headerButtons}>
            <button className={styles.backButton} onClick={() => router.push("/Warehouse_Backoffice")}>Back to dashboard</button>
          </div>
        </header>

        <div className={styles.panels}>
          <section className={styles.panel}>
            <div>
              <h2 className={styles.sectionTitle}>Warehouse assign (deduct)</h2>
              <p className={styles.sectionBody}>
                Pick a product, then map each outlet to the warehouses that deduct stock for the product/variant, its ingredients, and raws.
              </p>
            </div>
            <div className={styles.disclaimer}>
              Deduct = where sales and outlet orders pull stock. Storage home = where stock is received and lives. Outlet deductions now share one warehouse per outlet; variants/ingredients/raws use the same selection.
            </div>
            <div className={styles.controlGrid}>
              <div className={styles.selectGroup}>
                <div className={styles.subHeading}>Products</div>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedProductId(value);
                    setSelectedRoutingVariantKeys(["base"]);
                    setSelectedIngredientId("");
                    setSelectedRawId("");
                  }}
                  className={styles.select}
                  disabled={routingLoading.product}
                  aria-label="Select product for routing"
                >
                  {productOptions.map((item) => (
                    <option key={`prod-${item.value || "placeholder"}`} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.selectGroup}>
                <div className={styles.subHeading}>Variants (deduct)</div>
                <div className={styles.variantChooser} aria-label="Select variants for routing">
                  {!selectedProductId ? (
                    <div className={styles.variantHint}>Select a product to choose variants</div>
                  ) : (
                    <div className={styles.variantList}>
                      {productVariantOptions.map((variant) => {
                        const checked = selectedRoutingVariantKeys.includes(variant.value);
                        return (
                          <label key={`variant-${variant.value}`} className={styles.variantOption}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={routingLoading.product || productVariantOptions.length <= 1}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                setSelectedRoutingVariantKeys((prev) => {
                                  if (isChecked) return Array.from(new Set([...prev, variant.value]));
                                  const next = prev.filter((v) => v !== variant.value);
                                  return next.length ? next : ["base"];
                                });
                                setSelectedIngredientId("");
                                setSelectedRawId("");
                              }}
                            />
                            <span>{variant.label}</span>
                          </label>
                        );
                      })}
                      <div className={styles.variantHint}>
                        Tick multiple variants to apply the same outlet warehouse to each.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.selectGroup}>
                <div className={styles.subHeading}>Ingredients (from recipe)</div>
                <select
                  value={selectedIngredientId}
                  onChange={(e) => setSelectedIngredientId(e.target.value)}
                  className={styles.select}
                  disabled={!selectedProductId || routingLoading.ingredient || recipeIngredientsLoading || ingredientOptions.length <= 1}
                  aria-label="Select ingredient for routing"
                >
                  {ingredientOptions.map((opt) => (
                    <option key={`ing-${opt.value || "placeholder"}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.selectGroup}>
                <div className={styles.subHeading}>Raws (deduct)</div>
                <select
                  value={selectedRawId}
                  onChange={(e) => setSelectedRawId(e.target.value)}
                  className={styles.select}
                  disabled={!selectedProductId || routingLoading.raw || rawSelectOptions.length <= 1}
                  aria-label="Select raw for routing"
                >
                  {rawSelectOptions.map((opt) => (
                    <option key={`raw-${opt.value || "placeholder"}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.inlineHint}>
              <div className={styles.inlineTitle}>Linked dropdowns</div>
              <div className={styles.inlineBody}>
                Variants only unlock when the product has variants. Ingredients show only the ones used by the selected product’s recipe. Raws stay locked until a product is chosen.
              </div>
            </div>

            <div className={styles.storageGrid}>
              <div className={styles.storageCard}>
                <div className={styles.cardHeading}>Ingredient storage/receiving</div>
                <p className={styles.cardBody}>Place of storage before being sent to outlet.</p>
                <select
                  className={styles.select}
                  value={defaultWarehouseId}
                  onChange={(e) => setDefaultWarehouseId(e.target.value)}
                  aria-label="Storage home for selected ingredient"
                  disabled={!selectedIngredientId || routingLoading.ingredient}
                >
                  <option value="">Select storage home</option>
                  {storageHomeOptions.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                    </option>
                  ))}
                </select>
                {defaultWarehouseMessage && (
                  <div className={`${styles.callout} ${defaultWarehouseMessage.ok ? styles.calloutSuccess : styles.calloutError}`}>
                    {defaultWarehouseMessage.text}
                  </div>
                )}
              </div>

              <div className={styles.storageCard}>
                <div className={styles.cardHeading}>Raw storage/receiving</div>
                <p className={styles.cardBody}>Storage home for the selected raw item.</p>
                <select
                  className={styles.select}
                  value={rawDefaultWarehouseId}
                  onChange={(e) => setRawDefaultWarehouseId(e.target.value)}
                  aria-label="Storage home for selected raw"
                  disabled={!selectedRawId || routingLoading.raw}
                >
                  <option value="">Select storage home</option>
                  {storageHomeOptions.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                    </option>
                  ))}
                </select>
                {rawDefaultWarehouseMessage && (
                  <div className={`${styles.callout} ${rawDefaultWarehouseMessage.ok ? styles.calloutSuccess : styles.calloutError}`}>
                    {rawDefaultWarehouseMessage.text}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.inlineHint}>
              Each outlet row uses one warehouse for variants, ingredients, and raws. Storage/receiving can differ per item type above.
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.routesTable}>
                <thead>
                  <tr>
                    <th>Outlet</th>
                    <th>Outlet warehouse (shared)</th>
                  </tr>
                </thead>
                <tbody>
                  {outlets.length === 0 ? (
                    <tr>
                      <td colSpan={2}>No outlets found.</td>
                    </tr>
                  ) : (
                    outlets.map((outlet) => (
                      <tr key={outlet.id}>
                        <td>
                          <div className={styles.outletName}>{outlet.name}</div>
                          {outlet.code ? <div className={styles.outletCode}>{outlet.code}</div> : null}
                          {outlet.active === false ? <div className={styles.outletInactive}>Inactive</div> : null}
                        </td>
                        <td>
                          <select
                            value={productRoutes[outlet.id] ?? ""}
                            onChange={(e) => setRoute("product", outlet.id, e.target.value)}
                            className={styles.select}
                            disabled={routingLoading.product || !selectedProductId}
                            aria-label={`Outlet warehouse for ${outlet.name}`}
                          >
                            <option value="">Select warehouse</option>
                            {warehouseOptions.map((wh) => (
                              <option key={`prod-route-${wh.id}`} value={wh.id}>
                                {wh.name}
                              </option>
                            ))}
                          </select>
                          {!selectedProductId && (
                            <div className={styles.inlineHintSmall}>Select a product to assign a warehouse.</div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.minimalActions}>
              <button
                type="button"
                className={`${styles.minimalButton} ${styles.minimalSecondary}`}
                onClick={clearAllRoutes}
                disabled={savingAll || mappingsSaving || storageHomesSaving}
              >
                Clear mappings
              </button>
              <button
                type="button"
                className={`${styles.minimalButton} ${styles.minimalPrimary}`}
                onClick={saveEverything}
                disabled={savingAll || mappingsSaving || storageHomesSaving || readOnly}
              >
                {readOnly ? "Read-only" : savingAll ? "Saving..." : "Save all"}
              </button>
            </div>

            <div className={styles.messageGrid}>
              {combinedSaveMessage && (
                <div className={`${styles.callout} ${combinedSaveMessage.ok ? styles.calloutSuccess : styles.calloutError}`}>
                  {combinedSaveMessage.text}
                </div>
              )}
            </div>
          </section>

          
        </div>
      </div>
    </div>
  );
}

const normalizeOutlet = (outlet?: Partial<Outlet> | null): Outlet => ({
  id: outlet?.id ?? "",
  name: (outlet?.name ?? "Outlet").trim(),
  code: outlet?.code ?? null,
  active: outlet?.active ?? true,
});

const normalizeWarehouse = (warehouse?: Partial<Warehouse> | null): Warehouse => ({
  id: warehouse?.id ?? "",
  name: (warehouse?.name ?? "Warehouse").trim(),
  code: warehouse?.code ?? null,
  active: warehouse?.active ?? true,
});

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
button { background: none; border: none; }
button:hover { transform: translateY(-1px); }
input, select, button { font-family: inherit; }
`;
