"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./outlet-setup.module.css";
import { useWarehouseAuth } from "../useWarehouseAuth";

// Types shared across panels
interface Outlet { id: string; name: string; code?: string | null; active?: boolean | null }
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
  const { status } = useWarehouseAuth();

  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);

  // Deduction routing state (product → warehouse per outlet)
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedVariantKey, setSelectedVariantKey] = useState<string>("base");
  const [selectedProductVariant, setSelectedProductVariant] = useState<string>("base");
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>("");
  const [selectedRawId, setSelectedRawId] = useState<string>("");
  const [routes, setRoutes] = useState<RouteRecord>({});
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routingSaving, setRoutingSaving] = useState(false);
  const [routingMessage, setRoutingMessage] = useState<Alert>(null);
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

  // Stocktake warehouse mappings (outlet → allowed warehouse)
  const [rows, setRows] = useState<{ outlet_id: string; warehouse_id: string; outlet: Outlet; warehouse: Warehouse }[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<string>("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [mappingLoading, setMappingLoading] = useState(true);
  const [mappingMutating, setMappingMutating] = useState(false);
  const [mappingAlert, setMappingAlert] = useState<Alert>(null);

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

  const warehouseOptions = useMemo(() => [{ id: "", name: "Not set" }, ...warehouses], [warehouses]);
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
    if (!hasProductFilter) return baseIngredientOptions;
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
      setRoutingLoading(true);
      setMappingLoading(true);
      setRoutingMessage(null);
      setMappingAlert(null);
      try {
        const [outletRes, warehouseRes, itemRes, variantRes] = await Promise.all([
          fetch("/api/outlets"),
          fetch("/api/warehouses"),
          fetch("/api/catalog/items"),
          fetch("/api/catalog/variants"),
        ]);

        if (outletRes.ok) {
          const json = await outletRes.json();
          setOutlets(Array.isArray(json.outlets) ? json.outlets : []);
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
        setRoutingMessage({ ok: false, text: "Failed to load basics" });
        setMappingAlert({ ok: false, text: "Failed to load basics" });
      } finally {
        setRoutingLoading(false);
        // keep mappingLoading until mappings fetched
      }
    }
    loadBasics();
  }, [status]);

  // Load routes for selected item
  useEffect(() => {
    if (!selectedItemId || status !== "ok") {
      setRoutes({});
      setDefaultWarehouseId("");
      setDefaultWarehouseMessage(null);
      if (!selectedItemId) setSelectedVariantKey("base");
      return;
    }
    const selected = items.find((it) => it.id === selectedItemId);
    setDefaultWarehouseId(selected?.default_warehouse_id ?? "");
    async function loadRoutes() {
      setRoutingLoading(true);
      setRoutingMessage(null);
      try {
        const res = await fetch(`/api/outlet-routes?item_id=${selectedItemId}&variant_key=${selectedVariantKey}`);
        if (!res.ok) throw new Error("Could not load routes");
        const json = await res.json();
        const routeMap: RouteRecord = {};
        (Array.isArray(json.routes) ? json.routes : []).forEach((route: { outlet_id?: string; warehouse_id?: string | null }) => {
          if (route.outlet_id) {
            routeMap[route.outlet_id] = route.warehouse_id ?? "";
          }
        });
        setRoutes(routeMap);
      } catch (error) {
        console.error("outlet routes load failed", error);
        setRoutingMessage({ ok: false, text: "Unable to load outlet routes" });
      } finally {
        setRoutingLoading(false);
      }
    }
    loadRoutes();
  }, [selectedItemId, selectedVariantKey, status, items]);

  useEffect(() => {
    if (!selectedRawId) {
      setRawDefaultWarehouseId("");
      setRawDefaultWarehouseMessage(null);
      return;
    }
    const raw = items.find((it) => it.id === resolveItemId(selectedRawId));
    setRawDefaultWarehouseId(raw?.default_warehouse_id ?? "");
  }, [selectedRawId, items]);

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
    setProductDefaultWarehouseId(prod?.default_warehouse_id ?? "");
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
        const res = await fetch(
            `/api/recipe-ingredients?finished_item_id=${selectedProductId}&finished_variant_key=base`
        );
        if (!res.ok) throw new Error("Unable to load recipe ingredients");
        const json = await res.json();
        if (!active) return;
        const list = Array.isArray(json.ingredient_item_ids) ? json.ingredient_item_ids : [];
        setRecipeIngredientIds(list);
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
  }, [selectedProductId]);

  const fetchMappings = useCallback(async () => {
    setMappingLoading(true);
    setMappingAlert(null);
    try {
      const [outletsRes, warehousesRes, mappingsRes] = await Promise.all([
        fetch("/api/outlets"),
        fetch("/api/warehouses"),
        fetch("/api/outlet-warehouses"),
      ]);

      if (!outletsRes.ok) throw new Error("Failed to load outlets");
      if (!warehousesRes.ok) throw new Error("Failed to load warehouses");
      if (!mappingsRes.ok) throw new Error("Failed to load mappings");

      const outletsJson = await outletsRes.json();
      const warehousesJson = await warehousesRes.json();
      const mappingsJson = await mappingsRes.json();

      const outletList = Array.isArray(outletsJson?.outlets) ? outletsJson.outlets : [];
      const warehouseList = Array.isArray(warehousesJson?.warehouses) ? warehousesJson.warehouses : [];
      const mappingsPayload: { outlet_id?: string; warehouse_id?: string; outlet?: Outlet; warehouse?: Warehouse }[] =
        Array.isArray(mappingsJson?.mappings) ? mappingsJson.mappings : Array.isArray(mappingsJson) ? mappingsJson : [];

      setOutlets(outletList);
      setWarehouses(warehouseList);
      setRows(
        mappingsPayload
          .filter((entry) => entry?.outlet_id && entry?.warehouse_id)
          .map((entry) => ({
            outlet_id: String(entry.outlet_id),
            warehouse_id: String(entry.warehouse_id),
            outlet: normalizeOutlet(entry.outlet),
            warehouse: normalizeWarehouse(entry.warehouse),
          }))
      );
    } catch (error) {
      console.error(error);
      setMappingAlert({ ok: false, text: (error as Error).message });
    } finally {
      setMappingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "ok") {
      fetchMappings();
    }
  }, [status, fetchMappings]);

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

  useEffect(() => {
    if (selectedOutlet && !posForm.outlet_id) {
      setPosForm((prev) => ({ ...prev, outlet_id: selectedOutlet }));
    }
  }, [selectedOutlet, posForm.outlet_id]);

  useEffect(() => {
    if (selectedWarehouse && !posForm.warehouse_id) {
      setPosForm((prev) => ({ ...prev, warehouse_id: selectedWarehouse }));
    }
  }, [selectedWarehouse, posForm.warehouse_id]);

  const setRoute = (outletId: string, warehouseId: string) => {
    setRoutes((prev) => ({ ...prev, [outletId]: warehouseId }));
  };

  const saveRoutes = async () => {
    if (!selectedItemId) {
      setRoutingMessage({ ok: false, text: "Choose a product first" });
      return;
    }
    setRoutingSaving(true);
    setRoutingMessage(null);
    try {
      const payload = {
        item_id: selectedItemId,
          variant_key: selectedVariantKey,
        routes: outlets.map((outlet) => ({ outlet_id: outlet.id, warehouse_id: routes[outlet.id] || null })),
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

      setRoutingMessage({ ok: true, text: "Routes saved" });
    } catch (error) {
      console.error(error);
      setRoutingMessage({ ok: false, text: error instanceof Error ? error.message : "Failed to save" });
    } finally {
      setRoutingSaving(false);
    }
  };

  const resetMappingForm = () => {
    setSelectedOutlet("");
    setSelectedWarehouse("");
  };

  const saveDefaultWarehouse = async () => {
    if (!selectedItemId) {
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
      const detailRes = await fetch(`/api/catalog/items?id=${selectedItemId}`);
      if (!detailRes.ok) throw new Error("Could not load product details");
      const detailJson = await detailRes.json();
      const item = detailJson.item as Record<string, any> | undefined;
      if (!item) throw new Error("Product not found");

      const payload = {
        id: selectedItemId,
        name: item.name,
        sku: item.sku ?? null,
        item_kind: item.item_kind ?? "finished",
        base_unit: item.base_unit ?? "each",
        consumption_unit: item.consumption_unit ?? item.consumption_uom ?? "each",
        consumption_qty_per_base: item.consumption_qty_per_base ?? 1,
        storage_unit: item.storage_unit ?? null,
        storage_weight: item.storage_weight ?? null,
        cost: item.cost ?? 0,
        has_variations: item.has_variations ?? false,
        has_recipe: item.has_recipe ?? false,
        outlet_order_visible: item.outlet_order_visible ?? true,
        image_url: item.image_url ?? null,
        default_warehouse_id: defaultWarehouseId || null,
        active: item.active ?? true,
        purchase_pack_unit: item.purchase_pack_unit ?? item.base_unit ?? "each",
        units_per_purchase_pack: item.units_per_purchase_pack ?? 1,
        purchase_unit_mass: item.purchase_unit_mass ?? null,
        purchase_unit_mass_uom: item.purchase_unit_mass_uom ?? null,
        consumption_unit_mass: item.consumption_unit_mass ?? null,
        consumption_unit_mass_uom: item.consumption_unit_mass_uom ?? null,
        transfer_unit: item.transfer_unit ?? item.base_unit ?? "each",
        transfer_quantity: item.transfer_quantity ?? 1,
      };

      const res = await fetch("/api/catalog/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to save default warehouse");
      }
      setDefaultWarehouseMessage({ ok: true, text: "Ingredient default warehouse saved" });
    } catch (error) {
      console.error(error);
      setDefaultWarehouseMessage({ ok: false, text: error instanceof Error ? error.message : "Could not save" });
    } finally {
      setDefaultWarehouseSaving(false);
    }
  };

  const saveProductDefaultWarehouse = async () => {
    if (!selectedProductId) {
      setProductDefaultWarehouseMessage({ ok: false, text: "Choose a product first" });
      return;
    }
    if (selectedProductVariant !== "base") {
      setProductDefaultWarehouseMessage({ ok: false, text: "Default warehouse applies to base items only" });
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
        base_unit: item.base_unit ?? "each",
        consumption_unit: item.consumption_unit ?? item.consumption_uom ?? "each",
        consumption_qty_per_base: item.consumption_qty_per_base ?? 1,
        storage_unit: item.storage_unit ?? null,
        storage_weight: item.storage_weight ?? null,
        cost: item.cost ?? 0,
        has_variations: item.has_variations ?? false,
        has_recipe: item.has_recipe ?? false,
        outlet_order_visible: item.outlet_order_visible ?? true,
        image_url: item.image_url ?? null,
        default_warehouse_id: productDefaultWarehouseId || null,
        active: item.active ?? true,
        purchase_pack_unit: item.purchase_pack_unit ?? item.base_unit ?? "each",
        units_per_purchase_pack: item.units_per_purchase_pack ?? 1,
        purchase_unit_mass: item.purchase_unit_mass ?? null,
        purchase_unit_mass_uom: item.purchase_unit_mass_uom ?? null,
        consumption_unit_mass: item.consumption_unit_mass ?? null,
        consumption_unit_mass_uom: item.consumption_unit_mass_uom ?? null,
        transfer_unit: item.transfer_unit ?? item.base_unit ?? "each",
        transfer_quantity: item.transfer_quantity ?? 1,
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
      setProductDefaultWarehouseMessage({ ok: true, text: "Product default warehouse saved" });
    } catch (error) {
      console.error(error);
      setProductDefaultWarehouseMessage({ ok: false, text: error instanceof Error ? error.message : "Could not save" });
    } finally {
      setProductDefaultWarehouseSaving(false);
    }
  };

  const saveRawDefaultWarehouse = async () => {
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
      const detailRes = await fetch(`/api/catalog/items?id=${selectedRawId}`);
      if (!detailRes.ok) throw new Error("Could not load raw details");
      const detailJson = await detailRes.json();
      const item = detailJson.item as Record<string, any> | undefined;
      if (!item) throw new Error("Raw not found");

      const payload = {
        id: selectedRawId,
        name: item.name,
        sku: item.sku ?? null,
        item_kind: item.item_kind ?? "raw",
        base_unit: item.base_unit ?? "each",
        consumption_unit: item.consumption_unit ?? item.consumption_uom ?? "each",
        consumption_qty_per_base: item.consumption_qty_per_base ?? 1,
        storage_unit: item.storage_unit ?? null,
        storage_weight: item.storage_weight ?? null,
        cost: item.cost ?? 0,
        has_variations: item.has_variations ?? false,
        has_recipe: item.has_recipe ?? false,
        outlet_order_visible: item.outlet_order_visible ?? true,
        image_url: item.image_url ?? null,
        default_warehouse_id: rawDefaultWarehouseId || null,
        active: item.active ?? true,
        purchase_pack_unit: item.purchase_pack_unit ?? item.base_unit ?? "each",
        units_per_purchase_pack: item.units_per_purchase_pack ?? 1,
        purchase_unit_mass: item.purchase_unit_mass ?? null,
        purchase_unit_mass_uom: item.purchase_unit_mass_uom ?? null,
        consumption_unit_mass: item.consumption_unit_mass ?? null,
        consumption_unit_mass_uom: item.consumption_unit_mass_uom ?? null,
        transfer_unit: item.transfer_unit ?? item.base_unit ?? "each",
        transfer_quantity: item.transfer_quantity ?? 1,
      };

      const res = await fetch("/api/catalog/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to save raw default warehouse");
      }
      setRawDefaultWarehouseMessage({ ok: true, text: "Raw default warehouse saved" });
    } catch (error) {
      console.error(error);
      setRawDefaultWarehouseMessage({ ok: false, text: error instanceof Error ? error.message : "Could not save" });
    } finally {
      setRawDefaultWarehouseSaving(false);
    }
  };

  const addMapping = async () => {
    if (!selectedOutlet || !selectedWarehouse) return;
    if (rows.some((row) => row.outlet_id === selectedOutlet && row.warehouse_id === selectedWarehouse)) {
      setMappingAlert({ ok: false, text: "Mapping already exists." });
      return;
    }

    setMappingMutating(true);
    setMappingAlert(null);
    try {
      const res = await fetch("/api/outlet-warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: selectedOutlet, warehouse_id: selectedWarehouse }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to create mapping");
      }
      resetMappingForm();
      await fetchMappings();
      setMappingAlert({ ok: true, text: "Mapping added." });
    } catch (error) {
      console.error(error);
      setMappingAlert({ ok: false, text: (error as Error).message });
    } finally {
      setMappingMutating(false);
    }
  };

  const createPosMapping = async () => {
    const catalogId = posForm.catalog_item_id.trim();
    const outletId = posForm.outlet_id.trim();
    const derivedPosItemId = posForm.pos_item_id.trim() || catalogId;
    const selectedCatalog = items.find((it) => it.id === catalogId);
    const derivedPosItemName = posForm.pos_item_name.trim() || selectedCatalog?.name || null;

    const variantKeys = (selectedVariantKeys.length ? selectedVariantKeys : [posForm.catalog_variant_key || "base"]).map((v) =>
      v.trim()
    );

    if (!derivedPosItemId || !catalogId || !outletId) {
      setPosError({ ok: false, text: "POS item id, catalog item id, and outlet are required" });
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

  const deleteMapping = async (outletId: string, warehouseId: string) => {
    setMappingMutating(true);
    setMappingAlert(null);
    try {
      const params = new URLSearchParams({ outlet_id: outletId, warehouse_id: warehouseId });
      const res = await fetch(`/api/outlet-warehouses?${params.toString()}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to delete mapping");
      }
      await fetchMappings();
      setMappingAlert({ ok: true, text: "Mapping removed." });
    } catch (error) {
      console.error(error);
      setMappingAlert({ ok: false, text: (error as Error).message });
    } finally {
      setMappingMutating(false);
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
              <p className={styles.sectionBody}>Pick a product, then map each outlet to the warehouse that deducts stock for it.</p>
            </div>
            <div className={styles.disclaimer}>
              Deduct = where sales and outlet orders pull stock for this product. Example: if Till 1 sells “Chicken Shawarma”, pick the warehouse that should lose stock for that sale. Ensure transfers/purchases move stock into that warehouse first.
            </div>
            <div className={styles.controlsRow}>
              <div className={styles.selectGroup}>
                <div className={styles.subHeading}>Products</div>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedProductId(value);
                    setSelectedItemId(value);
                    setSelectedVariantKey("base");
                    setSelectedProductVariant("base");
                    setSelectedIngredientId("");
                    setSelectedRawId("");
                  }}
                  className={styles.select}
                  disabled={routingLoading || productOptions.length <= 1}
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
                <div className={styles.subHeading}>Variants</div>
                <select
                  value={selectedProductVariant}
                  onChange={(e) => {
                    const value = e.target.value || "base";
                    setSelectedProductVariant(value);
                    setSelectedVariantKey(value);
                    if (selectedProductId) {
                      setSelectedItemId(selectedProductId);
                    }
                    setSelectedIngredientId("");
                    setSelectedRawId("");
                  }}
                  className={styles.select}
                  disabled={!selectedProductId || routingLoading || productVariantOptions.length <= 1}
                  aria-label="Select product variant for routing"
                >
                  {productVariantOptions.map((variant) => (
                    <option key={`variant-${variant.value}`} value={variant.value}>
                      {variant.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.selectGroup}>
                <div className={styles.subHeading}>Ingredients</div>
                <select
                  value={selectedIngredientId}
                  onChange={(e) => {
                    const value = e.target.value;
                    const parsed = parseRouteValue(value);
                    setSelectedIngredientId(value);
                    setSelectedItemId(parsed.itemId);
                    setSelectedVariantKey(parsed.variantKey);
                  }}
                  className={styles.select}
                  disabled={routingLoading || ingredientSelectOptions.length <= 1}
                  aria-label="Select ingredient for routing"
                >
                  {ingredientSelectOptions.map((item) => (
                    <option key={`ing-${item.value || "placeholder"}`} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.selectGroup}>
                <div className={styles.subHeading}>Raws</div>
                <select
                  value={selectedRawId}
                  onChange={(e) => {
                    const value = e.target.value;
                    const parsed = parseRouteValue(value);
                    setSelectedRawId(value);
                    setSelectedItemId(parsed.itemId);
                    setSelectedVariantKey(parsed.variantKey);
                  }}
                  className={styles.select}
                  disabled={routingLoading || rawSelectOptions.length <= 1}
                  aria-label="Select raw"
                >
                  {rawSelectOptions.map((item) => (
                    <option key={`raw-${item.value || "placeholder"}`} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setRoutes({})}
                  disabled={routingLoading || !selectedItemId}
                >
                  Clear routes
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={saveRoutes}
                  disabled={routingSaving || routingLoading || !selectedItemId}
                >
                  {routingSaving ? "Saving..." : "Save mappings"}
                </button>
              </div>
            </div>

            <div className={styles.controlsRow}>
              <div className={styles.inlineHint}>
                <div className={styles.inlineTitle}>Default warehouses</div>
                <div className={styles.inlineBody}>
                  Set where each item lives by default (storage & purchase receipts). Above, choose the warehouse that deducts when an outlet sells it. They can be the same or different.
                </div>
              </div>
            </div>

            <div className={styles.controlsRow}>
              <div className={styles.selectGroup}>
                <div className={styles.subHeading}>Product default</div>
                <select
                  className={styles.select}
                  value={productDefaultWarehouseId}
                  onChange={(e) => setProductDefaultWarehouseId(e.target.value)}
                  aria-label="Default warehouse for selected product"
                  disabled={!selectedProductId || routingLoading || productDefaultWarehouseSaving || selectedProductVariant !== "base"}
                >
                  <option value="">Default warehouse (optional)</option>
                  {warehouseOptions.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setProductDefaultWarehouseId("")}
                  disabled={!productDefaultWarehouseId || !selectedProductId || productDefaultWarehouseSaving}
                >
                  Clear product default
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={saveProductDefaultWarehouse}
                  disabled={!selectedProductId || productDefaultWarehouseSaving || routingLoading}
                >
                  {productDefaultWarehouseSaving ? "Saving..." : "Save product default"}
                </button>
              </div>
            </div>

            <div className={styles.controlsRow}>
              <div className={styles.selectGroup}>
                <div className={styles.subHeading}>Ingredient default</div>
                <select
                  className={styles.select}
                  value={defaultWarehouseId}
                  onChange={(e) => setDefaultWarehouseId(e.target.value)}
                  aria-label="Default warehouse for selected ingredient"
                  disabled={
                    !selectedIngredientId ||
                    routingLoading ||
                    defaultWarehouseSaving ||
                    isVariantSelection(selectedIngredientId)
                  }
                >
                  <option value="">Default warehouse (optional)</option>
                  {warehouseOptions.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setDefaultWarehouseId("")}
                  disabled={!defaultWarehouseId || !selectedIngredientId || defaultWarehouseSaving}
                >
                  Clear ingredient default
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={saveDefaultWarehouse}
                  disabled={!selectedIngredientId || defaultWarehouseSaving || routingLoading}
                >
                  {defaultWarehouseSaving ? "Saving..." : "Save ingredient default"}
                </button>
              </div>
            </div>

            <div className={styles.controlsRow}>
              <div className={styles.selectGroup}>
                <div className={styles.subHeading}>Raw default</div>
                <select
                  className={styles.select}
                  value={rawDefaultWarehouseId}
                  onChange={(e) => setRawDefaultWarehouseId(e.target.value)}
                  aria-label="Default warehouse for selected raw"
                  disabled={
                    !selectedRawId ||
                    routingLoading ||
                    rawDefaultWarehouseSaving ||
                    isVariantSelection(selectedRawId)
                  }
                >
                  <option value="">Default warehouse (optional)</option>
                  {warehouseOptions.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setRawDefaultWarehouseId("")}
                  disabled={!rawDefaultWarehouseId || !selectedRawId || rawDefaultWarehouseSaving}
                >
                  Clear raw default
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={saveRawDefaultWarehouse}
                  disabled={!selectedRawId || rawDefaultWarehouseSaving || routingLoading}
                >
                  {rawDefaultWarehouseSaving ? "Saving..." : "Save raw default"}
                </button>
              </div>
            </div>

            {defaultWarehouseMessage && (
              <div
                className={`${styles.callout} ${defaultWarehouseMessage.ok ? styles.calloutSuccess : styles.calloutError}`}
              >
                {defaultWarehouseMessage.text}
              </div>
            )}
            {productDefaultWarehouseMessage && (
              <div
                className={`${styles.callout} ${productDefaultWarehouseMessage.ok ? styles.calloutSuccess : styles.calloutError}`}
              >
                {productDefaultWarehouseMessage.text}
              </div>
            )}
            {rawDefaultWarehouseMessage && (
              <div className={`${styles.callout} ${rawDefaultWarehouseMessage.ok ? styles.calloutSuccess : styles.calloutError}`}>
                {rawDefaultWarehouseMessage.text}
              </div>
            )}

            {routingMessage && (
              <div className={`${styles.callout} ${routingMessage.ok ? styles.calloutSuccess : styles.calloutError}`}>
                {routingMessage.text}
              </div>
            )}

            <div className={styles.tableWrapper}>
              <table className={styles.routesTable}>
                <thead>
                  <tr>
                    <th>Outlet</th>
                    <th>Warehouse</th>
                  </tr>
                </thead>
                <tbody>
                  {outlets.map((outlet) => (
                    <tr key={outlet.id}>
                      <td>
                        <div className={styles.outletName}>{outlet.name}</div>
                        {outlet.code && <div className={styles.outletCode}>{outlet.code}</div>}
                        {outlet.active === false && <div className={styles.outletInactive}>Inactive</div>}
                      </td>
                      <td>
                        <select
                          value={routes[outlet.id] ?? ""}
                          onChange={(e) => setRoute(outlet.id, e.target.value)}
                          className={styles.select}
                          disabled={routingLoading || !selectedItemId}
                          aria-label={`Warehouse for outlet ${outlet.name}`}
                        >
                          {warehouseOptions.map((wh) => (
                            <option key={wh.id} value={wh.id}>
                              {wh.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel}>
            <div>
              <h2 className={styles.sectionTitle}>Stocktake warehouses</h2>
              <p className={styles.sectionBody}>Link outlets to the warehouses they can stocktake against.</p>
            </div>

            <div className={styles.disclaimer}>
              Stocktake = where the outlet counts inventory. It can differ from deduct routing. Example: Outlet “Quick Corner” might deduct sales from “Main Prep Kitchen” but do physical counts in “Quick Corner Warehouse” if that is where the stock sits.
            </div>
            <p className={styles.note}>
              If the outlet physically holds stock, set both deduct and stocktake to the outlet warehouse and use transfers from Main Kitchen to keep it supplied.
            </p>
            <div className={styles.controlsRow}>
              <select
                className={styles.select}
                value={selectedOutlet}
                onChange={(e) => setSelectedOutlet(e.target.value)}
                disabled={mappingLoading || mappingMutating}
                aria-label="Select outlet"
              >
                <option value="">Select outlet…</option>
                {outletSelectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <select
                className={styles.select}
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                disabled={mappingLoading || mappingMutating}
                aria-label="Select warehouse"
              >
                <option value="">Select warehouse…</option>
                {warehouseSelectOptions.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>

              <div className={styles.actions}>
                <button className={styles.secondaryButton} onClick={resetMappingForm} disabled={mappingLoading || mappingMutating}>
                  Clear
                </button>
                <button
                  className={styles.primaryButton}
                  onClick={addMapping}
                  disabled={mappingLoading || mappingMutating || !selectedOutlet || !selectedWarehouse}
                >
                  Add mapping
                </button>
              </div>
            </div>

            {mappingAlert && (
              <div className={`${styles.callout} ${mappingAlert.ok ? styles.calloutSuccess : styles.calloutError}`}>
                {mappingAlert.text}
              </div>
            )}

            <div className={styles.tableWrapper}>
              <table className={styles.routesTable}>
                <thead>
                  <tr>
                    <th>Outlet</th>
                    <th>Warehouse</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {mappingLoading ? (
                    <tr>
                      <td colSpan={3}>Loading…</td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={3}>No mappings yet.</td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const key = `${row.outlet_id}-${row.warehouse_id}`;
                      return (
                        <tr key={key}>
                          <td>
                            <div className={styles.outletName}>{row.outlet.name}</div>
                            {row.outlet.code ? <div className={styles.outletCode}>{row.outlet.code}</div> : null}
                            {row.outlet.active === false ? <div className={styles.outletInactive}>Inactive</div> : null}
                          </td>
                          <td>
                            <div className={styles.outletName}>{row.warehouse.name}</div>
                            {row.warehouse.code ? <div className={styles.outletCode}>{row.warehouse.code}</div> : null}
                            {row.warehouse.active === false ? <div className={styles.outletInactive}>Inactive</div> : null}
                          </td>
                          <td>
                            <button
                              className={styles.secondaryButton}
                              onClick={() => deleteMapping(row.outlet_id, row.warehouse_id)}
                              disabled={mappingMutating || mappingLoading}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel}>
            <div>
              <h2 className={styles.sectionTitle}>POS item match</h2>
              <p className={styles.sectionBody}>Preview the first five mappings and add quick links without leaving setup.</p>
              <div className={styles.disclaimer}>
                POS item match = connect each POS item (and flavour) to the catalog product or variant that should lose stock when sold. Use variants for size/flavour-specific deductions so the right recipe hits inventory. Warehouse routing still comes from the product’s outlet mapping above.
              </div>
              <p className={styles.note}>Full table lives in Catalog → POS match.</p>
            </div>

            <div className={styles.controlsRow}>
              <input
                className={styles.input}
                placeholder="Search POS or catalog"
                value={posSearch}
                onChange={(e) => setPosSearch(e.target.value)}
                disabled={posLoading}
              />
              <select
                className={styles.select}
                value={posLimit === "all" ? "all" : String(posLimit)}
                onChange={(e) => {
                  const value = e.target.value;
                  setPosLimit(value === "all" ? "all" : Number(value));
                }}
                aria-label="Number of mappings to show"
                disabled={posLoading}
              >
                <option value="all">Show all</option>
                {[50, 100, 150, 200, 300, 400, 500, 1000, 2000, 5000].map((count) => (
                  <option key={count} value={count}>
                    Show {count}
                  </option>
                ))}
              </select>
              <div className={styles.actions}>
                <button className={styles.secondaryButton} onClick={() => setPosSearch("")} disabled={!posSearch}>
                  Clear
                </button>
                <button
                  className={styles.secondaryButton}
                  onClick={() => router.push("/Warehouse_Backoffice/catalog/pos-item-map")}
                >
                  View all
                </button>
              </div>
            </div>

            {posError && (
              <div className={`${styles.callout} ${posError.ok ? styles.calloutSuccess : styles.calloutError}`}>
                {posError.text}
              </div>
            )}

            <div className={styles.tableWrapper}>
              <table className={styles.routesTable}>
                <thead>
                  <tr>
                    <th>POS item</th>
                    <th>POS flavour</th>
                    <th>Catalog item</th>
                    <th>Variant</th>
                    <th>Warehouse</th>
                    <th>Outlet</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {posLoading ? (
                    <tr>
                      <td colSpan={6}>Loading…</td>
                    </tr>
                  ) : filteredPosMappings.list.length === 0 ? (
                    <tr>
                      <td colSpan={6}>No mappings found.</td>
                    </tr>
                  ) : (
                    filteredPosMappings.list.map((m, idx) => (
                      <tr
                        key={`${m.pos_item_id}-${m.pos_flavour_id ?? "_"}-${m.catalog_item_id}-${m.catalog_variant_key ?? "base"}-${m.outlet_id}-${m.warehouse_id ?? "_"}-${idx}`}
                      >
                        <td>
                          <div className={styles.outletName}>{m.pos_item_id}</div>
                          <div className={styles.outletCode}>{m.pos_item_name || ""}</div>
                        </td>
                        <td>
                          <div className={styles.outletName}>{m.pos_flavour_id || "—"}</div>
                          <div className={styles.outletCode}>{m.pos_flavour_name || ""}</div>
                        </td>
                        <td>
                          <div className={styles.outletName}>{m.catalog_item_name || m.catalog_item_id}</div>
                          <div className={styles.outletCode}>{m.catalog_item_id}</div>
                        </td>
                        <td>{variantLabels[m.catalog_variant_key || "base"] ?? m.catalog_variant_key ?? "base"}</td>
                        <td>{m.warehouse_id || "—"}</td>
                        <td>{m.outlet_id}</td>
                        <td>
                          <button
                            className={styles.secondaryButton}
                            onClick={() => deletePosMapping(m)}
                            disabled={posDeletingKey === `${m.pos_item_id}-${m.pos_flavour_id ?? "_"}-${m.catalog_item_id}-${m.catalog_variant_key ?? "base"}-${m.outlet_id}-${m.warehouse_id ?? "_"}`}
                          >
                            {posDeletingKey === `${m.pos_item_id}-${m.pos_flavour_id ?? "_"}-${m.catalog_item_id}-${m.catalog_variant_key ?? "base"}-${m.outlet_id}-${m.warehouse_id ?? "_"}` ? "Deleting…" : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <p className={styles.note}>
              Showing {filteredPosMappings.list.length} of {filteredPosMappings.total}. Adjust the dropdown to load more or use View all for the complete list.
            </p>

            <div className={styles.controlsRow}>
              <select
                className={styles.select}
                value={posForm.catalog_item_id}
                onChange={(e) => {
                  const itemId = e.target.value;
                  updatePosForm("catalog_item_id", itemId);
                  updatePosForm("catalog_variant_key", "base");
                  if (!posForm.pos_item_id) updatePosForm("pos_item_id", itemId);
                  if (!posForm.pos_item_name) {
                    const named = items.find((it) => it.id === itemId)?.name ?? "";
                    updatePosForm("pos_item_name", named);
                  }
                  setSelectedVariantKeys(["base"]);
                }}
                aria-label="Catalog product"
              >
                {itemOptions.map((item) => (
                  <option key={item.id || "placeholder"} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <div className={styles.variantChooser} aria-label="Catalog variants">
                {!posForm.catalog_item_id ? (
                  <div className={styles.variantHint}>Select a product to choose variants</div>
                ) : (
                  <div className={styles.variantList}>
                    {posVariantOptions.map((option) => {
                      const checked = selectedVariantKeys.includes(option.value);
                      return (
                        <label key={option.value} className={styles.variantOption}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setSelectedVariantKeys((prev) => {
                                if (isChecked) return Array.from(new Set([...prev, option.value]));
                                return prev.filter((v) => v !== option.value);
                              });
                              if (isChecked) updatePosForm("catalog_variant_key", option.value);
                            }}
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <select
                className={styles.select}
                value={posForm.warehouse_id}
                onChange={(e) => updatePosForm("warehouse_id", e.target.value)}
                aria-label="Warehouse (optional)"
              >
                <option value="">Warehouse (optional)</option>
                {warehouseSelectOptions.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
              <select
                className={styles.select}
                value={posForm.outlet_id}
                onChange={(e) => updatePosForm("outlet_id", e.target.value)}
                aria-label="Outlet"
              >
                <option value="">Outlet</option>
                {outletSelectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className={styles.actions}>
                <button
                  className={styles.primaryButton}
                  onClick={createPosMapping}
                  disabled={posCreating}
                >
                  {posCreating ? "Creating..." : "Add mapping"}
                </button>
              </div>
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
