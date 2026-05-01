"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import styles from "../product/product.module.css";

type Item = {
  id: string;
  name: string;
  sku?: string | null;
  supplier_sku?: string | null;
  item_kind?: string | null;
  has_variations?: boolean | null;
};

type Alert = { ok: boolean; text: string } | null;

type ProductFormState = {
  name: string;
  sku: string;
  item_kind: "finished" | "ingredient" | "raw";
  consumption_unit: string;
  purchase_pack_unit: string;
  units_per_purchase_pack: string;
  transfer_unit: string;
  transfer_quantity: string;
  consumption_qty_per_base: string;
  stocktake_uom: string;
  storage_unit: string;
  storage_weight: string;
  storage_home_id: string;
  storage_home_ids: string[];
  cost: string;
  selling_price: string;
  has_variations: boolean;
  has_recipe: boolean;
  outlet_order_visible: boolean;
  image_url: string;
  active: boolean;
};

const qtyUnitOptions = [
  { value: "pc", label: "Pc(s)" },
  { value: "g", label: "Gram(s)" },
  { value: "kg", label: "Kilogram(s)" },
  { value: "mg", label: "Milligram(s)" },
  { value: "ml", label: "Millilitre(s)" },
  { value: "l", label: "Litre(s)" },
  { value: "cup", label: "Cup(s)" },
  { value: "straw", label: "Straw(s)" },
  { value: "toilet paper", label: "Toilet Paper(s)" },
  { value: "case", label: "Case(s)" },
  { value: "crate", label: "Crate(s)" },
  { value: "bottle", label: "Bottle(s)" },
  { value: "Tin Can", label: "Tin Can(s)" },
  { value: "Jar", label: "Jar(s)" },
  { value: "Block", label: "Block(s)" },
  { value: "Bucket", label: "Bucket(s)" },
  { value: "Bag", label: "Bag(s)" },
  { value: "Tray", label: "Tray(s)" },
  { value: "plastic", label: "Plastic(s)" },
  { value: "Packet", label: "Packet(s)" },
  { value: "Box", label: "Box(es)" },
] as const;

const itemKinds = [
  { value: "finished", label: "Finished (ready to sell)" },
  { value: "ingredient", label: "Ingredient (used in production)" },
  { value: "raw", label: "Raw (unprocessed material)" },
];

const defaultProductForm: ProductFormState = {
  name: "",
  sku: "",
  item_kind: "finished",
  consumption_unit: "pc",
  purchase_pack_unit: "pc",
  units_per_purchase_pack: "1",
  transfer_unit: "pc",
  transfer_quantity: "1",
  consumption_qty_per_base: "1",
  stocktake_uom: "pc",
  storage_unit: "",
  storage_weight: "",
  storage_home_id: "",
  storage_home_ids: [],
  cost: "0",
  selling_price: "0",
  has_variations: false,
  has_recipe: false,
  outlet_order_visible: true,
  image_url: "",
  active: true,
};

const mergeStorageHomeIds = (primaryId: string, ids: string[]) => {
  if (!primaryId) return ids;
  return ids.includes(primaryId) ? ids : [primaryId, ...ids];
};

export default function CatalogManagePage() {
  const router = useRouter();
  const { status, readOnly } = useWarehouseAuth();

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string | null }[]>([]);

  const [productForm, setProductForm] = useState<ProductFormState>(defaultProductForm);
  const [productSaving, setProductSaving] = useState(false);
  const [productAlert, setProductAlert] = useState<Alert>(null);
  const [productStorageSearch, setProductStorageSearch] = useState("");

  const [variantItemId, setVariantItemId] = useState("");
  const [variantName, setVariantName] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [variantItemKind, setVariantItemKind] = useState("finished");
  const [variantConsumptionUom, setVariantConsumptionUom] = useState("pc");
  const [variantPurchasePackUnit, setVariantPurchasePackUnit] = useState("pc");
  const [variantUnitsPerPurchasePack, setVariantUnitsPerPurchasePack] = useState("1");
  const [variantCost, setVariantCost] = useState("0");
  const [variantSellingPrice, setVariantSellingPrice] = useState("0");
  const [variantOutletOrderVisible, setVariantOutletOrderVisible] = useState(true);
  const [variantImageUrl, setVariantImageUrl] = useState("");
  const [variantStorageHomeId, setVariantStorageHomeId] = useState("");
  const [variantStorageHomeIds, setVariantStorageHomeIds] = useState<string[]>([]);
  const [variantStorageSearch, setVariantStorageSearch] = useState("");
  const [variantActive, setVariantActive] = useState(true);
  const [variantSaving, setVariantSaving] = useState(false);
  const [variantAlert, setVariantAlert] = useState<Alert>(null);
  const [entryMode, setEntryMode] = useState<"product" | "variant">("product");

  const disableVariantControlled = productForm.has_variations;
  const isProductMode = entryMode === "product";
  const vatExcludedPrice = useMemo(() => {
    const parsed = Number(productForm.selling_price);
    if (!Number.isFinite(parsed) || parsed <= 0) return "";
    return (parsed / 1.16).toFixed(2);
  }, [productForm.selling_price]);
  const variantVatExcludedPrice = useMemo(() => {
    const parsed = Number(variantSellingPrice);
    if (!Number.isFinite(parsed) || parsed <= 0) return "";
    return (parsed / 1.16).toFixed(2);
  }, [variantSellingPrice]);

  useEffect(() => {
    if (status !== "ok") return;
    async function loadItems() {
      setLoadingItems(true);
      try {
        const res = await fetch("/api/catalog/items");
        if (!res.ok) throw new Error("Failed to load products");
        const json = await res.json();
        const list: Item[] = Array.isArray(json.items) ? json.items : [];
        setItems(list);
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingItems(false);
      }
    }
    loadItems();
  }, [status]);

  useEffect(() => {
    if (status !== "ok") return;
    async function loadWarehouses() {
      try {
        const res = await fetch("/api/warehouses");
        if (!res.ok) throw new Error("Failed to load warehouses");
        const json = await res.json().catch(() => ({}));
        const rows = Array.isArray(json) ? json : json.warehouses ?? json.data ?? [];
        setWarehouses(rows.map((row: { id: string; name?: string | null }) => ({ id: row.id, name: row.name ?? null })));
      } catch (error) {
        console.error(error);
      }
    }
    loadWarehouses();
  }, [status]);

  const toNumber = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const handleProductChange = (key: keyof ProductFormState, value: string | boolean) => {
    setProductForm((prev) => {
      if (key === "has_variations") {
        const next = Boolean(value);
        return {
          ...prev,
          has_variations: next,
        };
      }
      if (key === "storage_home_id") {
        const nextId = typeof value === "string" ? value : "";
        const nextIds = nextId
          ? mergeStorageHomeIds(nextId, prev.storage_home_ids.filter((id) => id !== nextId))
          : [];
        return { ...prev, storage_home_id: nextId, storage_home_ids: nextIds };
      }
      if (key === "consumption_unit" && typeof value === "string") {
        return {
          ...prev,
          consumption_unit: value,
          transfer_unit: value,
          stocktake_uom: value,
        };
      }
      return { ...prev, [key]: value };
    });
  };

  const toggleProductStorageHome = (warehouseId: string) => {
    if (!warehouseId) return;
    setProductForm((prev) => {
      const exists = prev.storage_home_ids.includes(warehouseId);
      const nextIds = exists
        ? prev.storage_home_ids.filter((id) => id !== warehouseId)
        : [...prev.storage_home_ids, warehouseId];
      let nextPrimary = prev.storage_home_id;
      if (exists && warehouseId === prev.storage_home_id) {
        nextPrimary = nextIds[0] ?? "";
      } else if (!exists && !prev.storage_home_id) {
        nextPrimary = warehouseId;
      }
      const mergedIds = mergeStorageHomeIds(nextPrimary, nextIds.filter((id) => id !== nextPrimary));
      return { ...prev, storage_home_id: nextPrimary, storage_home_ids: mergedIds };
    });
  };

  const toggleVariantStorageHome = (warehouseId: string) => {
    if (!warehouseId) return;
    setVariantStorageHomeIds((prev) => {
      const exists = prev.includes(warehouseId);
      const nextIds = exists ? prev.filter((id) => id !== warehouseId) : [...prev, warehouseId];
      let nextPrimary = variantStorageHomeId;
      if (exists && warehouseId === variantStorageHomeId) {
        nextPrimary = nextIds[0] ?? "";
      } else if (!exists && !variantStorageHomeId) {
        nextPrimary = warehouseId;
      }
      const mergedIds = mergeStorageHomeIds(nextPrimary, nextIds.filter((id) => id !== nextPrimary));
      setVariantStorageHomeId(nextPrimary);
      return mergedIds;
    });
  };

  const renderProductStorageHomesSelect = () => {
    const selectedValues = mergeStorageHomeIds(
      productForm.storage_home_id,
      productForm.storage_home_ids.filter((id) => id !== productForm.storage_home_id)
    );
    const query = productStorageSearch.trim().toLowerCase();
    const filtered = warehouses.filter((warehouse) => {
      const label = (warehouse.name ?? warehouse.id).toLowerCase();
      return label.includes(query);
    });
    return (
      <div className={styles.field}>
        <span className={styles.label}>Storage home(s)</span>
        <small className={styles.hint}>Select one or more warehouses. Primary is the first selected.</small>
        <input
          className={styles.input}
          placeholder="Search warehouses"
          value={productStorageSearch}
          onChange={(event) => setProductStorageSearch(event.target.value)}
        />
        {query ? (
          <div className={styles.multiSelectList}>
            {filtered.length ? (
              filtered.map((warehouse) => {
                const checked = selectedValues.includes(warehouse.id);
                const label = warehouse.name ?? warehouse.id;
                return (
                  <label key={warehouse.id} className={styles.checkbox}>
                    <span>{label}</span>
                    <input
                      className={styles.checkboxInput}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProductStorageHome(warehouse.id)}
                    />
                  </label>
                );
              })
            ) : (
              <p className={styles.sectionHint}>No matching warehouses.</p>
            )}
          </div>
        ) : (
          <p className={styles.sectionHint}>Type to search and select warehouses.</p>
        )}
      </div>
    );
  };

  const renderVariantStorageHomesSelect = () => {
    const selectedValues = mergeStorageHomeIds(
      variantStorageHomeId,
      variantStorageHomeIds.filter((id) => id !== variantStorageHomeId)
    );
    const query = variantStorageSearch.trim().toLowerCase();
    const filtered = warehouses.filter((warehouse) => {
      const label = (warehouse.name ?? warehouse.id).toLowerCase();
      return label.includes(query);
    });
    return (
      <div className={styles.field}>
        <span className={styles.label}>Storage home(s)</span>
        <small className={styles.hint}>Select one or more warehouses. Primary is the first selected.</small>
        <input
          className={styles.input}
          placeholder="Search warehouses"
          value={variantStorageSearch}
          onChange={(event) => setVariantStorageSearch(event.target.value)}
        />
        {query ? (
          <div className={styles.multiSelectList}>
            {filtered.length ? (
              filtered.map((warehouse) => {
                const checked = selectedValues.includes(warehouse.id);
                const label = warehouse.name ?? warehouse.id;
                return (
                  <label key={warehouse.id} className={styles.checkbox}>
                    <span>{label}</span>
                    <input
                      className={styles.checkboxInput}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleVariantStorageHome(warehouse.id)}
                    />
                  </label>
                );
              })
            ) : (
              <p className={styles.sectionHint}>No matching warehouses.</p>
            )}
          </div>
        ) : (
          <p className={styles.sectionHint}>Type to search and select warehouses.</p>
        )}
      </div>
    );
  };

  const quickCreateProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) {
      setProductAlert({ ok: false, text: "Read-only access: saving is disabled." });
      return;
    }
    if (!productForm.name.trim()) {
      setProductAlert({ ok: false, text: "Name is required" });
      return;
    }
    setProductSaving(true);
    setProductAlert(null);
    try {
      const resolvedProductStorageHomeIds = mergeStorageHomeIds(
        productForm.storage_home_id,
        productForm.storage_home_ids.filter((id) => id !== productForm.storage_home_id)
      );
      const payload = {
        name: productForm.name.trim(),
        sku: productForm.sku.trim(),
        supplier_sku: null,
        item_kind: productForm.item_kind,
        consumption_unit: productForm.consumption_unit,
        purchase_pack_unit: productForm.purchase_pack_unit || productForm.consumption_unit,
        units_per_purchase_pack: toNumber(productForm.units_per_purchase_pack, 1),
        transfer_unit: productForm.consumption_unit,
        transfer_quantity: toNumber(productForm.units_per_purchase_pack, 1),
        consumption_qty_per_base: toNumber(productForm.consumption_qty_per_base, 1),
        qty_decimal_places: 2,
        stocktake_uom: productForm.consumption_unit,
        storage_unit: productForm.storage_unit || null,
        storage_weight: productForm.storage_weight === "" ? null : toNumber(productForm.storage_weight, 0),
        storage_home_id: productForm.storage_home_id || null,
        storage_home_ids: resolvedProductStorageHomeIds,
        cost: toNumber(productForm.cost, 0),
        selling_price: toNumber(productForm.selling_price, 0),
        has_variations: productForm.has_variations,
        has_recipe: productForm.has_recipe,
        outlet_order_visible: productForm.outlet_order_visible,
        image_url: productForm.image_url.trim(),
        active: productForm.active,
      };
      const res = await fetch("/api/catalog/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not save product");
      }
      setProductAlert({ ok: true, text: "Product saved" });
      setProductForm(defaultProductForm);
      setLoadingItems(true);
      const refreshed = await fetch("/api/catalog/items");
      if (refreshed.ok) {
        const json = await refreshed.json();
        setItems(Array.isArray(json.items) ? json.items : []);
      }
    } catch (error) {
      console.error(error);
      setProductAlert({ ok: false, text: error instanceof Error ? error.message : "Failed to save" });
    } finally {
      setProductSaving(false);
      setLoadingItems(false);
    }
  };

  const quickCreateVariant = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) {
      setVariantAlert({ ok: false, text: "Read-only access: saving is disabled." });
      return;
    }
    if (!variantItemId) {
      setVariantAlert({ ok: false, text: "Choose a product" });
      return;
    }
    if (!variantName.trim()) {
      setVariantAlert({ ok: false, text: "Variant name is required" });
      return;
    }
    setVariantSaving(true);
    setVariantAlert(null);
    try {
      const resolvedVariantStorageHomeIds = mergeStorageHomeIds(
        variantStorageHomeId,
        variantStorageHomeIds.filter((id) => id !== variantStorageHomeId)
      );
      const payload = {
        item_id: variantItemId,
        name: variantName.trim(),
        sku: variantSku.trim(),
        supplier_sku: null,
        item_kind: variantItemKind,
        consumption_uom: variantConsumptionUom,
        stocktake_uom: variantConsumptionUom,
        qty_decimal_places: 2,
        purchase_pack_unit: variantPurchasePackUnit || variantConsumptionUom,
        units_per_purchase_pack: toNumber(variantUnitsPerPurchasePack, 1),
        transfer_unit: variantConsumptionUom,
        transfer_quantity: toNumber(variantUnitsPerPurchasePack, 1),
        cost: toNumber(variantCost, 0),
        selling_price: toNumber(variantSellingPrice, 0),
        outlet_order_visible: variantOutletOrderVisible,
        image_url: variantImageUrl.trim(),
        storage_home_id: variantStorageHomeId || null,
        storage_home_ids: resolvedVariantStorageHomeIds,
        default_warehouse_id: variantStorageHomeId || null,
        active: variantActive,
      };
      const res = await fetch("/api/catalog/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not save variant");
      }
      setVariantAlert({ ok: true, text: "Variant saved" });
      setVariantName("");
      setVariantSku("");
      setVariantCost("0");
      setVariantItemKind("finished");
      setVariantConsumptionUom("pc");
      setVariantUnitsPerPurchasePack("1");
      setVariantPurchaseUnitMass("");
      setVariantPurchaseUnitMassUom("kg");
      setVariantInnerPackUnitMass("");
      setVariantInnerPackUnitMassUom("kg");
      setVariantTransferQuantity("1");
      setVariantSellingPrice("0");
      setVariantOutletOrderVisible(true);
      setVariantImageUrl("");
      setVariantStorageHomeId("");
      setVariantStorageHomeIds([]);
      setVariantActive(true);
    } catch (error) {
      console.error(error);
      setVariantAlert({ ok: false, text: error instanceof Error ? error.message : "Failed to save" });
    } finally {
      setVariantSaving(false);
    }
  };

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>Catalog</p>
            <h1 className={styles.title}>Create Product & Variant</h1>
            <p className={styles.subtitle}>
              Add a new catalog item and variants with the same layout as the edit screen.
            </p>
          </div>
          <div className={styles.headerButtons}>
            <button className={styles.backButton} onClick={() => router.back()}>
              Back
            </button>
            <button className={styles.backButton} onClick={() => router.push("/Warehouse_Backoffice")}>
              Back to Dashboard
            </button>
          </div>
        </header>

        <form className={styles.form} onSubmit={isProductMode ? quickCreateProduct : quickCreateVariant}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Add catalog entry</h2>
            <p className={styles.sectionHint}>Switch between product and variant details without leaving this page.</p>
          </div>

          <div className={styles.modeToggle}>
            <button
              type="button"
              className={`${styles.modeButton} ${isProductMode ? styles.modeButtonActive : ""}`}
              onClick={() => setEntryMode("product")}
            >
              Product
            </button>
            <button
              type="button"
              className={`${styles.modeButton} ${!isProductMode ? styles.modeButtonActive : ""}`}
              onClick={() => setEntryMode("variant")}
            >
              Variant
            </button>
          </div>

          {isProductMode ? (
            <>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Product details</h3>
                <p className={styles.sectionHint}>Create a catalog item with the full product fields.</p>
              </div>

              <div className={styles.fieldGrid}>
                <Field
                  label="Sku"
                  hint="Single SKU for internal, supplier, and POS mapping"
                  value={productForm.sku}
                  onChange={(v) => handleProductChange("sku", v)}
                />
                <Field
                  label="Product name"
                  hint="Friendly name staff will see"
                  value={productForm.name}
                  onChange={(v) => handleProductChange("name", v)}
                  required
                />
                <Select
                  label="Type"
                  hint="Finished = sellable; Ingredient = used inside recipes; Raw = unprocessed input"
                  value={productForm.item_kind}
                  onChange={(v) => handleProductChange("item_kind", v)}
                  options={itemKinds}
                />
                <Select
                  label="How its consumed"
                  hint="Outlet sales and transfers use this unit"
                  value={productForm.consumption_unit}
                  onChange={(v) => handleProductChange("consumption_unit", v)}
                  options={qtyUnitOptions as unknown as { value: string; label: string }[]}
                />
                {!disableVariantControlled && (
                  <>
                    {productForm.item_kind !== "finished" && (
                      <Field
                        type="number"
                        label="How Much Is Consumed"
                        hint="Used by recipes: how many consumption units are used per 1 finished unit"
                        value={productForm.consumption_qty_per_base}
                        onChange={(v) => handleProductChange("consumption_qty_per_base", v)}
                        step="0.01"
                        min="0"
                      />
                    )}
                    <Select
                      label="How its Purchased"
                      hint="How purchases are entered (case, box, sack)"
                      value={productForm.purchase_pack_unit}
                      onChange={(v) => handleProductChange("purchase_pack_unit", v)}
                      options={qtyUnitOptions as unknown as { value: string; label: string }[]}
                    />
                    <Field
                      type="number"
                      label="Units Inside Purchase Product"
                      hint="Used to convert purchases into consumption units (e.g., 1 case = 12 bottles)"
                      value={productForm.units_per_purchase_pack}
                      onChange={(v) => handleProductChange("units_per_purchase_pack", v)}
                      step="1"
                      min="1"
                    />
                  </>
                )}
                {renderProductStorageHomesSelect()}
                <Field
                  label="Image URL (optional)"
                  hint="Link to product image"
                  value={productForm.image_url}
                  onChange={(v) => handleProductChange("image_url", v)}
                />
              </div>

              {!productForm.has_variations && (
                <div className={styles.sectionCard}>
                  <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>Selling Price Setup</h3>
                    <p className={styles.sectionHint}>Enter the default selling price for this product.</p>
                  </div>
                  <div className={styles.sectionGrid}>
                    <Field
                      type="number"
                      label="Cost per base unit"
                      hint="Default unit cost (not pack cost)"
                      value={productForm.cost}
                      onChange={(v) => handleProductChange("cost", v)}
                      step="0.01"
                      min="0"
                    />
                    <Field
                      type="number"
                      label="Selling price"
                      hint="Used for sales reporting and pricing"
                      value={productForm.selling_price}
                      onChange={(v) => handleProductChange("selling_price", v)}
                      step="0.01"
                      min="0"
                    />
                    <Field
                      type="number"
                      label="VAT Excluded Price"
                      hint="Selling price with 16% VAT removed"
                      value={vatExcludedPrice}
                      onChange={() => null}
                      step="0.01"
                      min="0"
                      disabled
                    />
                  </div>
                </div>
              )}

              <div className={styles.toggleRow}>
                <Checkbox
                  label="Show in outlet orders"
                  hint="If off, this item stays hidden from outlet ordering"
                  checked={productForm.outlet_order_visible}
                  onChange={(checked) => handleProductChange("outlet_order_visible", checked)}
                />
                <Checkbox
                  label="Product has variants"
                  hint="Set true if you will add variants (sizes/flavors)"
                  checked={productForm.has_variations}
                  onChange={(checked) => handleProductChange("has_variations", checked)}
                />
                <Checkbox
                  label="Has production recipe"
                  hint="Check if this finished product is produced via a recipe/BOM"
                  checked={productForm.has_recipe}
                  onChange={(checked) => handleProductChange("has_recipe", checked)}
                />
                <Checkbox
                  label="Active"
                  hint="Keep checked so teams can use it"
                  checked={productForm.active}
                  onChange={(checked) => handleProductChange("active", checked)}
                />
              </div>

              {productAlert && (
                <div className={`${styles.callout} ${productAlert.ok ? styles.calloutSuccess : styles.calloutError}`}>
                  {productAlert.text}
                </div>
              )}

              <div className={styles.actions}>
                <button type="button" onClick={() => setProductForm(defaultProductForm)} className={styles.secondaryButton}>
                  Clear form
                </button>
                <button type="submit" className={styles.primaryButton} disabled={productSaving || readOnly}>
                  {readOnly ? "Read-only" : productSaving ? "Saving..." : "Save product"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Variant details</h3>
                <p className={styles.sectionHint}>Attach to an existing product with full variant fields.</p>
              </div>

              <div className={styles.fieldGrid}>
                <Select
                  label="Parent product"
                  hint="Attach this variant to an existing product"
                  value={variantItemId}
                  onChange={setVariantItemId}
                  options={[
                    { value: "", label: "Select product..." },
                    ...items.map((item) => ({ value: item.id, label: item.name })),
                  ]}
                  required
                  disabled={loadingItems || items.length === 0}
                />
                <Field
                  label="Sku"
                  hint="Single SKU for internal, supplier, and POS mapping"
                  value={variantSku}
                  onChange={setVariantSku}
                />
                <Field
                  label="Variant name"
                  hint="Example: 500g bag, 1L bottle, Large size"
                  value={variantName}
                  onChange={setVariantName}
                  required
                />
                <Select
                  label="Type"
                  hint="Finished = sellable; Ingredient = used inside recipes; Raw = unprocessed input"
                  value={variantItemKind}
                  onChange={setVariantItemKind}
                  options={itemKinds}
                />
                <Select
                  label="How its consumed"
                  hint="Outlet sales and transfers use this unit"
                  value={variantConsumptionUom}
                  onChange={setVariantConsumptionUom}
                  options={qtyUnitOptions as unknown as { value: string; label: string }[]}
                />
                <Select
                  label="How its Purchased"
                  hint="How purchases are entered (case, box, sack)"
                  value={variantPurchasePackUnit}
                  onChange={setVariantPurchasePackUnit}
                  options={qtyUnitOptions as unknown as { value: string; label: string }[]}
                />
                <Field
                  type="number"
                  label="Units Inside Purchase Product"
                  hint="Used to convert purchases into consumption units (e.g., 1 case = 12 bottles)"
                  value={variantUnitsPerPurchasePack}
                  onChange={setVariantUnitsPerPurchasePack}
                  step="1"
                  min="1"
                />
                {renderVariantStorageHomesSelect()}
                <Field
                  label="Image URL (optional)"
                  hint="Link to variant image"
                  value={variantImageUrl}
                  onChange={setVariantImageUrl}
                />
              </div>

              <div className={styles.toggleRow}>
                <Checkbox
                  label="Show in outlet orders"
                  hint="If off, this variant stays hidden from outlet ordering"
                  checked={variantOutletOrderVisible}
                  onChange={setVariantOutletOrderVisible}
                />
                <Checkbox
                  label="Active"
                  hint="Keep checked so teams can use it"
                  checked={variantActive}
                  onChange={setVariantActive}
                />
              </div>

              {variantAlert && (
                <div className={`${styles.callout} ${variantAlert.ok ? styles.calloutSuccess : styles.calloutError}`}>
                  {variantAlert.text}
                </div>
              )}

              <div className={styles.actions}>
                <button type="submit" className={styles.primaryButton} disabled={variantSaving || readOnly}>
                  {readOnly ? "Read-only" : variantSaving ? "Saving..." : "Save variant"}
                </button>
              </div>
            </>
          )}
        </form>
      </main>
    </div>
  );
}

type FieldProps = {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  step?: string;
  min?: string;
  disabled?: boolean;
};

function Field({ label, hint, value, onChange, required, type = "text", step, min, disabled }: FieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <small className={styles.hint}>{hint}</small>
      <input
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.input}
        type={type}
        step={step}
        min={min}
        disabled={disabled}
      />
    </label>
  );
}

type SelectProps = {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  disabled?: boolean;
};

function Select({ label, hint, value, onChange, options, required, disabled }: SelectProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <small className={styles.hint}>{hint}</small>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.input}
        required={required}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type CheckboxProps = {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function Checkbox({ label, hint, checked, onChange }: CheckboxProps) {
  return (
    <label className={styles.checkbox}>
      <div>
        <span className={styles.label}>{label}</span>
        <small className={styles.hint}>{hint}</small>
      </div>
      <input
        className={styles.checkboxInput}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
input, select, button { font-family: inherit; }
input:focus, select:focus { outline: 2px solid #22c55e; }
button:hover { transform: translateY(-1px); }
`;
