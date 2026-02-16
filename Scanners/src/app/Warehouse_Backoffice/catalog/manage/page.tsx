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
  supplier_sku: string;
  item_kind: "finished" | "ingredient" | "raw";
  consumption_unit: string;
  purchase_pack_unit: string;
  units_per_purchase_pack: string;
  purchase_unit_mass: string;
  purchase_unit_mass_uom: string;
  transfer_unit: string;
  transfer_quantity: string;
  consumption_qty_per_base: string;
  qty_decimal_places: string;
  stocktake_uom: string;
  storage_unit: string;
  storage_weight: string;
  storage_home_id: string;
  cost: string;
  selling_price: string;
  has_variations: boolean;
  has_recipe: boolean;
  outlet_order_visible: boolean;
  image_url: string;
  active: boolean;
};

const qtyUnitOptions = [
  { value: "each", label: "Each" },
  { value: "g", label: "Gram(s)" },
  { value: "kg", label: "Kilogram(s)" },
  { value: "mg", label: "Milligram(s)" },
  { value: "ml", label: "Millilitre(s)" },
  { value: "l", label: "Litre(s)" },
  { value: "case", label: "Case(s)" },
  { value: "crate", label: "Crate(s)" },
  { value: "bottle", label: "Bottle(s)" },
  { value: "Tin Can", label: "Tin Can(s)" },
  { value: "Jar", label: "Jar(s)" },
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
  supplier_sku: "",
  item_kind: "finished",
  consumption_unit: "each",
  purchase_pack_unit: "each",
  units_per_purchase_pack: "1",
  purchase_unit_mass: "",
  purchase_unit_mass_uom: "kg",
  transfer_unit: "each",
  transfer_quantity: "1",
  consumption_qty_per_base: "1",
  qty_decimal_places: "0",
  stocktake_uom: "",
  storage_unit: "",
  storage_weight: "",
  storage_home_id: "",
  cost: "0",
  selling_price: "0",
  has_variations: false,
  has_recipe: false,
  outlet_order_visible: true,
  image_url: "",
  active: true,
};

function formatConversion(value: number, uom: string) {
  if (!Number.isFinite(value) || value <= 0) return "";
  const normalized = uom.trim().toLowerCase();
  if (["g", "kg", "mg"].includes(normalized)) {
    const grams = normalized === "kg" ? value * 1000 : normalized === "mg" ? value / 1000 : value;
    const kg = grams / 1000;
    const lb = grams / 453.59237;
    const oz = grams / 28.349523125;
    return `Approx: ${kg.toFixed(3)} kg | ${lb.toFixed(3)} lb | ${oz.toFixed(2)} oz`;
  }
  if (["ml", "l"].includes(normalized)) {
    const liters = normalized === "l" ? value : value / 1000;
    const gallons = liters / 3.785411784;
    const flOz = liters * 33.8140227;
    return `Approx: ${liters.toFixed(3)} l | ${gallons.toFixed(3)} gal | ${flOz.toFixed(1)} fl oz`;
  }
  return "";
}

export default function CatalogManagePage() {
  const router = useRouter();
  const { status, readOnly } = useWarehouseAuth();

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string | null }[]>([]);

  const [productForm, setProductForm] = useState<ProductFormState>(defaultProductForm);
  const [productSaving, setProductSaving] = useState(false);
  const [productAlert, setProductAlert] = useState<Alert>(null);

  const [variantItemId, setVariantItemId] = useState("");
  const [variantName, setVariantName] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [variantSupplierSku, setVariantSupplierSku] = useState("");
  const [variantItemKind, setVariantItemKind] = useState("finished");
  const [variantConsumptionUom, setVariantConsumptionUom] = useState("each");
  const [variantStocktakeUom, setVariantStocktakeUom] = useState("");
  const [variantQtyDecimalPlaces, setVariantQtyDecimalPlaces] = useState("0");
  const [variantPurchasePackUnit, setVariantPurchasePackUnit] = useState("each");
  const [variantUnitsPerPurchasePack, setVariantUnitsPerPurchasePack] = useState("1");
  const [variantPurchaseUnitMass, setVariantPurchaseUnitMass] = useState("");
  const [variantPurchaseUnitMassUom, setVariantPurchaseUnitMassUom] = useState("kg");
  const [variantTransferUnit, setVariantTransferUnit] = useState("each");
  const [variantTransferQuantity, setVariantTransferQuantity] = useState("1");
  const [variantCost, setVariantCost] = useState("0");
  const [variantSellingPrice, setVariantSellingPrice] = useState("0");
  const [variantOutletOrderVisible, setVariantOutletOrderVisible] = useState(true);
  const [variantImageUrl, setVariantImageUrl] = useState("");
  const [variantStorageHomeId, setVariantStorageHomeId] = useState("");
  const [variantActive, setVariantActive] = useState(true);
  const [variantSaving, setVariantSaving] = useState(false);
  const [variantAlert, setVariantAlert] = useState<Alert>(null);

  const disableVariantControlled = productForm.has_variations;
  const isFinished = productForm.item_kind === "finished";
  const isIngredient = productForm.item_kind === "ingredient";
  const isIngredientOrRaw = productForm.item_kind === "ingredient" || productForm.item_kind === "raw";
  const vatExcludedPrice = useMemo(() => {
    const parsed = Number(productForm.selling_price);
    if (!Number.isFinite(parsed) || parsed <= 0) return "";
    return (parsed / 1.16).toFixed(2);
  }, [productForm.selling_price]);
  const packMassConversion = useMemo(() => {
    const raw = Number(productForm.purchase_unit_mass);
    if (!Number.isFinite(raw) || raw <= 0) return "";
    return formatConversion(raw, productForm.purchase_unit_mass_uom);
  }, [productForm.purchase_unit_mass, productForm.purchase_unit_mass_uom]);

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
          supplier_sku: next ? "" : prev.supplier_sku,
        };
      }
      return { ...prev, [key]: value };
    });
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
      const payload = {
        name: productForm.name.trim(),
        sku: productForm.sku.trim(),
        supplier_sku: productForm.has_variations ? null : productForm.supplier_sku.trim() || null,
        item_kind: productForm.item_kind,
        consumption_unit: productForm.consumption_unit,
        purchase_pack_unit: productForm.purchase_pack_unit || productForm.storage_unit || productForm.consumption_unit,
        units_per_purchase_pack: toNumber(productForm.units_per_purchase_pack, 1),
        purchase_unit_mass: productForm.purchase_unit_mass === "" ? null : toNumber(productForm.purchase_unit_mass, 0),
        purchase_unit_mass_uom: productForm.purchase_unit_mass ? productForm.purchase_unit_mass_uom : null,
        transfer_unit: productForm.transfer_unit || productForm.consumption_unit,
        transfer_quantity: toNumber(productForm.transfer_quantity, 1),
        consumption_qty_per_base: toNumber(productForm.consumption_qty_per_base, 1),
        qty_decimal_places: Math.max(0, Math.min(6, Math.round(toNumber(productForm.qty_decimal_places, 0)))),
        stocktake_uom: productForm.stocktake_uom || null,
        storage_unit: productForm.storage_unit || null,
        storage_weight: productForm.storage_weight === "" ? null : toNumber(productForm.storage_weight, 0),
        storage_home_id: productForm.storage_home_id || null,
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
      const payload = {
        item_id: variantItemId,
        name: variantName.trim(),
        sku: variantSku.trim(),
        supplier_sku: variantSupplierSku.trim(),
        item_kind: variantItemKind,
        consumption_uom: variantConsumptionUom,
        stocktake_uom: variantStocktakeUom || null,
        qty_decimal_places: Math.max(0, Math.min(6, Math.round(toNumber(variantQtyDecimalPlaces, 0)))),
        purchase_pack_unit: variantPurchasePackUnit,
        units_per_purchase_pack: toNumber(variantUnitsPerPurchasePack, 1),
        purchase_unit_mass: variantPurchaseUnitMass.trim() === "" ? null : toNumber(variantPurchaseUnitMass, 0),
        purchase_unit_mass_uom: variantPurchaseUnitMassUom,
        transfer_unit: variantTransferUnit,
        transfer_quantity: toNumber(variantTransferQuantity, 1),
        cost: toNumber(variantCost, 0),
        selling_price: toNumber(variantSellingPrice, 0),
        outlet_order_visible: variantOutletOrderVisible,
        image_url: variantImageUrl.trim(),
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
      setVariantSupplierSku("");
      setVariantCost("0");
      setVariantItemKind("finished");
      setVariantConsumptionUom("each");
      setVariantStocktakeUom("");
      setVariantQtyDecimalPlaces("0");
      setVariantPurchasePackUnit("each");
      setVariantUnitsPerPurchasePack("1");
      setVariantPurchaseUnitMass("");
      setVariantPurchaseUnitMassUom("kg");
      setVariantTransferUnit("each");
      setVariantTransferQuantity("1");
      setVariantSellingPrice("0");
      setVariantOutletOrderVisible(true);
      setVariantImageUrl("");
      setVariantStorageHomeId("");
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

        <form className={styles.form} onSubmit={quickCreateProduct}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Add product</h2>
            <p className={styles.sectionHint}>Create a catalog item with the full product fields.</p>
          </div>

          <div className={styles.fieldGrid}>
            <Field
              label="Product name"
              hint="Friendly name staff will see"
              value={productForm.name}
              onChange={(v) => handleProductChange("name", v)}
              required
            />
            <Field
              label="Internal SKU"
              hint="Optional code used for scans/search"
              value={productForm.sku}
              onChange={(v) => handleProductChange("sku", v)}
            />
            {!productForm.has_variations && (
              <Field
                label="Supplier SKU"
                hint="Supplier-facing code used for purchase intake scans"
                value={productForm.supplier_sku}
                onChange={(v) => handleProductChange("supplier_sku", v)}
              />
            )}
            <Select
              label="Stock kind"
              hint="Finished = sellable; Ingredient = used inside recipes; Raw = unprocessed input"
              value={productForm.item_kind}
              onChange={(v) => handleProductChange("item_kind", v)}
              options={itemKinds}
            />
            <Field
              label="Image URL (optional)"
              hint="Link to product image"
              value={productForm.image_url}
              onChange={(v) => handleProductChange("image_url", v)}
            />
            {!disableVariantControlled && (
              <>
                <Select
                  label="Unit (stock + consumption)"
                  hint="Single unit used for stock, transfers, and consumption"
                  value={productForm.consumption_unit}
                  onChange={(v) => handleProductChange("consumption_unit", v)}
                  options={qtyUnitOptions as unknown as { value: string; label: string }[]}
                />
                <Select
                  label="Stocktake unit (warehouse counts)"
                  hint="Optional override for counting stock (e.g., kg instead of grams)"
                  value={productForm.stocktake_uom}
                  onChange={(v) => handleProductChange("stocktake_uom", v)}
                  options={[{ value: "", label: "Use consumption unit" }, ...(qtyUnitOptions as unknown as { value: string; label: string }[])]}
                />
                <Field
                  type="number"
                  label="Storage qty"
                  hint="Optional: quantity per storage unit (weight, volume, or count; e.g., kg per rod/bag)"
                  value={productForm.storage_weight}
                  onChange={(v) => handleProductChange("storage_weight", v)}
                  step="0.01"
                  min="0"
                />
                {isFinished && (
                  <>
                    <Select
                      label="Supplier pack unit"
                      hint="Unit written on supplier pack for this product"
                      value={productForm.purchase_pack_unit}
                      onChange={(v) => handleProductChange("purchase_pack_unit", v)}
                      options={qtyUnitOptions as unknown as { value: string; label: string }[]}
                    />
                    <Field
                      type="number"
                      label="Units inside one supplier pack"
                      hint="How many base units are inside one supplier pack"
                      value={productForm.units_per_purchase_pack}
                      onChange={(v) => handleProductChange("units_per_purchase_pack", v)}
                      step="1"
                      min="1"
                    />
                  </>
                )}
                {isIngredientOrRaw && !productForm.has_variations && (
                  <div className={styles.ingredientCardGrid}>
                    <div className={`${styles.sectionCard} ${styles.ingredientCard}`}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Supplier Pack Unit</h3>
                        <p className={styles.sectionHint}>Unit written on the supplier pack.</p>
                      </div>
                      <Select
                        label="Supplier pack unit"
                        hint="Unit used when receiving stock."
                        value={productForm.purchase_pack_unit}
                        onChange={(v) => handleProductChange("purchase_pack_unit", v)}
                        options={qtyUnitOptions as unknown as { value: string; label: string }[]}
                      />
                    </div>
                    <div className={`${styles.sectionCard} ${styles.ingredientCard}`}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Units Inside One Supplier Pack</h3>
                        <p className={styles.sectionHint}>How many base units are inside one supplier pack.</p>
                      </div>
                      <Field
                        type="number"
                        label="Units inside one supplier pack"
                        hint="Used for ingredient/raw transfers and damages."
                        value={productForm.units_per_purchase_pack}
                        onChange={(v) => handleProductChange("units_per_purchase_pack", v)}
                        step="1"
                        min="1"
                      />
                    </div>
                    <div className={`${styles.sectionCard} ${styles.ingredientCard}`}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Weight/Volume Per Pack</h3>
                        <p className={styles.sectionHint}>Set the weight or volume for one supplier pack.</p>
                      </div>
                      <Field
                        type="number"
                        label="Pack weight/volume"
                        hint="Used to convert packs to base units (e.g., 250 g)."
                        value={productForm.purchase_unit_mass}
                        onChange={(v) => handleProductChange("purchase_unit_mass", v)}
                        step="0.01"
                        min="0"
                      />
                    </div>
                    <div className={`${styles.sectionCard} ${styles.ingredientCard}`}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Mass/Volume Unit</h3>
                        <p className={styles.sectionHint}>Units for the pack weight/volume.</p>
                      </div>
                      <Select
                        label="Mass/volume unit"
                        hint="Pick the unit used in the pack weight/volume."
                        value={productForm.purchase_unit_mass_uom}
                        onChange={(v) => handleProductChange("purchase_unit_mass_uom", v)}
                        options={qtyUnitOptions as unknown as { value: string; label: string }[]}
                      />
                      {packMassConversion ? <p className={styles.sectionHint}>{packMassConversion}</p> : null}
                    </div>
                    <div className={`${styles.sectionCard} ${styles.ingredientCard}`}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Transfer Unit</h3>
                        <p className={styles.sectionHint}>Unit used for transfers and stock movements.</p>
                      </div>
                      <Select
                        label="Transfer unit"
                        hint="Shown on scanner qty prompts."
                        value={productForm.transfer_unit}
                        onChange={(v) => handleProductChange("transfer_unit", v)}
                        options={qtyUnitOptions as unknown as { value: string; label: string }[]}
                      />
                    </div>
                    <div className={`${styles.sectionCard} ${styles.ingredientCard}`}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Quantity Per Transfer Line</h3>
                        <p className={styles.sectionHint}>Default quantity per transfer line.</p>
                      </div>
                      <Field
                        type="number"
                        label="Quantity per transfer line"
                        hint="Used when entering transfer quantities."
                        value={productForm.transfer_quantity}
                        onChange={(v) => handleProductChange("transfer_quantity", v)}
                        step="1"
                        min="1"
                      />
                    </div>
                    <div className={`${styles.sectionCard} ${styles.ingredientCard}`}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Storage Home</h3>
                        <p className={styles.sectionHint}>Where this ingredient/raw item is stored.</p>
                      </div>
                      <Select
                        label="Storage home"
                        hint="Pick the warehouse that holds this item."
                        value={productForm.storage_home_id}
                        onChange={(v) => handleProductChange("storage_home_id", v)}
                        options={[{ value: "", label: "Select storage home" }, ...warehouses.map((w) => ({ value: w.id, label: w.name ?? w.id }))]}
                      />
                    </div>
                    <div className={`${styles.sectionCard} ${styles.ingredientCard}`}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Storage Unit</h3>
                        <p className={styles.sectionHint}>How this item is held in stock.</p>
                      </div>
                      <Select
                        label="Storage unit"
                        hint="How this item is held in stock (e.g., rods, bags, cases)"
                        value={productForm.storage_unit}
                        onChange={(v) => handleProductChange("storage_unit", v)}
                        options={[{ value: "", label: "Not set" }, ...(qtyUnitOptions as unknown as { value: string; label: string }[])]}
                      />
                    </div>
                  </div>
                )}
                <Field
                  type="number"
                  label="Consumption qty"
                  hint="Consumption units used per 1 unit"
                  value={productForm.consumption_qty_per_base}
                  onChange={(v) => handleProductChange("consumption_qty_per_base", v)}
                  step="0.0001"
                  min="0.0001"
                  required
                />
                <Field
                  type="number"
                  label="Quantity decimal places"
                  hint="0 = whole numbers, 1 or 2 = allow decimals (e.g., kg)"
                  value={productForm.qty_decimal_places}
                  onChange={(v) => handleProductChange("qty_decimal_places", v)}
                  step="1"
                  min="0"
                />
                {!(isIngredientOrRaw && !productForm.has_variations) && (
                  <Select
                    label="Storage unit"
                    hint="How this item is held in stock (e.g., rods, bags, cases)"
                    value={productForm.storage_unit}
                    onChange={(v) => handleProductChange("storage_unit", v)}
                    options={[{ value: "", label: "Not set" }, ...(qtyUnitOptions as unknown as { value: string; label: string }[])]}
                  />
                )}
                {!isIngredient && (
                  <Field
                    type="number"
                    label="Cost per base unit"
                    hint="Default unit cost (not pack cost)"
                    value={productForm.cost}
                    onChange={(v) => handleProductChange("cost", v)}
                    step="0.01"
                    min="0"
                  />
                )}
              </>
            )}
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
        </form>

        <form className={styles.form} onSubmit={quickCreateVariant}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Add variant</h2>
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
              label="Variant name"
              hint="Name shown for this variant"
              value={variantName}
              onChange={setVariantName}
              required
            />
            <Field
              label="Internal SKU"
              hint="Optional code used for scans/search"
              value={variantSku}
              onChange={setVariantSku}
            />
            <Field
              label="Supplier SKU"
              hint="Supplier-facing code used for purchase intake scans"
              value={variantSupplierSku}
              onChange={setVariantSupplierSku}
            />
            <Select
              label="Stock kind"
              hint="Finished = sellable; Ingredient = used inside recipes; Raw = unprocessed input"
              value={variantItemKind}
              onChange={setVariantItemKind}
              options={itemKinds}
            />
            <Select
              label="Consumption unit"
              hint="Single unit used for stock, transfers, and consumption"
              value={variantConsumptionUom}
              onChange={setVariantConsumptionUom}
              options={qtyUnitOptions as unknown as { value: string; label: string }[]}
            />
            <Select
              label="Stocktake unit"
              hint="Optional override for counting stock"
              value={variantStocktakeUom}
              onChange={setVariantStocktakeUom}
              options={[{ value: "", label: "Use consumption unit" }, ...(qtyUnitOptions as unknown as { value: string; label: string }[])]}
            />
            <Field
              type="number"
              label="Quantity decimal places"
              hint="0 = whole numbers, 1 or 2 = allow decimals"
              value={variantQtyDecimalPlaces}
              onChange={setVariantQtyDecimalPlaces}
              step="1"
              min="0"
            />
            <Select
              label="Supplier pack unit"
              hint="Unit written on supplier pack for this variant"
              value={variantPurchasePackUnit}
              onChange={setVariantPurchasePackUnit}
              options={qtyUnitOptions as unknown as { value: string; label: string }[]}
            />
            <Field
              type="number"
              label="Units inside one supplier pack"
              hint="How many base units are inside one supplier pack"
              value={variantUnitsPerPurchasePack}
              onChange={setVariantUnitsPerPurchasePack}
              step="1"
              min="1"
            />
            <Field
              type="number"
              label="Weight/volume per purchase unit"
              hint="Used to convert packs to base units"
              value={variantPurchaseUnitMass}
              onChange={setVariantPurchaseUnitMass}
              step="0.01"
              min="0"
            />
            <Select
              label="Mass/volume unit"
              hint="Unit used for the pack weight/volume"
              value={variantPurchaseUnitMassUom}
              onChange={setVariantPurchaseUnitMassUom}
              options={qtyUnitOptions as unknown as { value: string; label: string }[]}
            />
            <Select
              label="Transfer unit"
              hint="Shown on scanner qty prompts"
              value={variantTransferUnit}
              onChange={setVariantTransferUnit}
              options={qtyUnitOptions as unknown as { value: string; label: string }[]}
            />
            <Field
              type="number"
              label="Quantity per transfer line"
              hint="Default quantity per transfer line"
              value={variantTransferQuantity}
              onChange={setVariantTransferQuantity}
              step="1"
              min="1"
            />
            <Field
              type="number"
              label="Cost per base unit"
              hint="Default unit cost (not pack cost)"
              value={variantCost}
              onChange={setVariantCost}
              step="0.01"
              min="0"
            />
            <Field
              type="number"
              label="Selling price"
              hint="Used for sales reporting and pricing"
              value={variantSellingPrice}
              onChange={setVariantSellingPrice}
              step="0.01"
              min="0"
            />
            <Field
              label="Image URL"
              hint="Link to product image"
              value={variantImageUrl}
              onChange={setVariantImageUrl}
            />
            <Select
              label="Storage home"
              hint="Pick the warehouse that holds this item"
              value={variantStorageHomeId}
              onChange={setVariantStorageHomeId}
              options={[{ value: "", label: "Select storage home" }, ...warehouses.map((w) => ({ value: w.id, label: w.name ?? w.id }))]}
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
