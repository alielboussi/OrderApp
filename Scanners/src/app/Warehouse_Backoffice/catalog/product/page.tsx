"use client";

import { useEffect, useMemo, useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import styles from "./product.module.css";

const qtyUnitOptions = [
  { value: "each", label: "Each" },
  { value: "pc", label: "Pc(s)" },
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

type FormState = {
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

const defaultForm: FormState = {
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

function ProductCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, readOnly } = useWarehouseAuth();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [, setLoadingItem] = useState(false);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string | null }[]>([]);

  const editingId = searchParams?.get("id")?.trim() || "";

  const disableVariantControlled = form.has_variations;
  const isFinished = form.item_kind === "finished";
  const isIngredient = form.item_kind === "ingredient";
  const isIngredientOrRaw = form.item_kind === "ingredient" || form.item_kind === "raw";
  const vatExcludedPrice = useMemo(() => {
    const parsed = Number(form.selling_price);
    if (!Number.isFinite(parsed) || parsed <= 0) return "";
    return (parsed / 1.16).toFixed(2);
  }, [form.selling_price]);
  const packMassConversion = useMemo(() => {
    const raw = Number(form.purchase_unit_mass);
    if (!Number.isFinite(raw) || raw <= 0) return "";
    return formatConversion(raw, form.purchase_unit_mass_uom);
  }, [form.purchase_unit_mass, form.purchase_unit_mass_uom]);

  useEffect(() => {
    async function loadItem(id: string) {
      if (!id) return;
      setLoadingItem(true);
      try {
        const res = await fetch(`/api/catalog/items?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("Failed to load product");
        const json = await res.json();
        if (json?.item) {
          const item = json.item;
          setForm({
            name: item.name ?? "",
            sku: item.sku ?? "",
            supplier_sku: item.supplier_sku ?? "",
            item_kind: (item.item_kind as FormState["item_kind"]) ?? "finished",
            consumption_unit: item.consumption_unit ?? item.consumption_uom ?? "each",
            purchase_pack_unit: item.purchase_pack_unit ?? item.storage_unit ?? item.consumption_unit ?? item.consumption_uom ?? "each",
            units_per_purchase_pack: (item.units_per_purchase_pack ?? 1).toString(),
            purchase_unit_mass: item.purchase_unit_mass != null ? item.purchase_unit_mass.toString() : "",
            purchase_unit_mass_uom: item.purchase_unit_mass_uom ?? "kg",
            transfer_unit: item.transfer_unit ?? item.consumption_unit ?? item.consumption_uom ?? "each",
            transfer_quantity: (item.transfer_quantity ?? 1).toString(),
            consumption_qty_per_base: (item.consumption_qty_per_base ?? 1).toString(),
            qty_decimal_places: (item.qty_decimal_places ?? 0).toString(),
            stocktake_uom: item.stocktake_uom ?? "",
            storage_unit: item.storage_unit ?? "",
            storage_weight: item.storage_weight != null ? item.storage_weight.toString() : "",
            storage_home_id: item.storage_home_id ?? item.default_warehouse_id ?? "",
            cost: (item.cost ?? 0).toString(),
            selling_price: (item.selling_price ?? 0).toString(),
            has_variations: Boolean(item.has_variations),
            has_recipe: Boolean(item.has_recipe),
            outlet_order_visible: item.outlet_order_visible ?? true,
            image_url: item.image_url ?? "",
            active: item.active ?? true,
          });
        }
      } catch (error) {
        console.error("product load failed", error);
        setResult({ ok: false, message: error instanceof Error ? error.message : "Failed to load product" });
      } finally {
        setLoadingItem(false);
      }
    }

    if (editingId) loadItem(editingId);
  }, [editingId]);

  useEffect(() => {
    async function loadWarehouses() {
      try {
        const res = await fetch("/api/warehouses");
        if (!res.ok) throw new Error("Failed to load warehouses");
        const json = await res.json().catch(() => ({}));
        const rows = Array.isArray(json) ? json : json.warehouses ?? json.data ?? [];
        setWarehouses(rows.map((row: { id: string; name?: string | null }) => ({ id: row.id, name: row.name ?? null })));
      } catch (error) {
        console.error("warehouse load failed", error);
      }
    }
    loadWarehouses();
  }, []);

  const handleChange = (key: keyof FormState, value: string | boolean) => {
    setForm((prev) => {
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

  if (status !== "ok") return null;

  const toNumber = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) {
      setResult({ ok: false, message: "Read-only access: saving is disabled." });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        supplier_sku: form.has_variations ? null : form.supplier_sku || null,
        item_kind: form.item_kind,
        consumption_unit: form.consumption_unit,
        purchase_pack_unit: form.purchase_pack_unit || form.storage_unit || form.consumption_unit,
        units_per_purchase_pack: toNumber(form.units_per_purchase_pack, 1),
        purchase_unit_mass: form.purchase_unit_mass === "" ? null : toNumber(form.purchase_unit_mass, 0),
        purchase_unit_mass_uom: form.purchase_unit_mass ? form.purchase_unit_mass_uom : null,
        transfer_unit: form.transfer_unit || form.consumption_unit,
        transfer_quantity: toNumber(form.transfer_quantity, 1),
        consumption_qty_per_base: toNumber(form.consumption_qty_per_base, 1),
        qty_decimal_places: Math.max(0, Math.min(6, Math.round(toNumber(form.qty_decimal_places, 0)))),
        stocktake_uom: form.stocktake_uom || null,
        storage_unit: form.storage_unit || null,
        storage_weight: form.storage_weight === "" ? null : toNumber(form.storage_weight, 0),
        storage_home_id: form.storage_home_id || null,
        cost: toNumber(form.cost, 0),
        selling_price: toNumber(form.selling_price, 0),
        has_variations: form.has_variations,
        has_recipe: form.has_recipe,
        outlet_order_visible: form.outlet_order_visible,
        image_url: form.image_url,
        active: form.active,
        ...(editingId ? { id: editingId } : {}),
      };

      const res = await fetch("/api/catalog/items", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not create product");
      }

      setResult({ ok: true, message: editingId ? "Product updated" : "Product saved to catalog_items" });
      if (!editingId) setForm(defaultForm);
    } catch (error) {
      console.error(error);
      setResult({ ok: false, message: error instanceof Error ? error.message : "Failed to save product" });
    } finally {
      setSaving(false);
    }
  };

  const back = () => router.push("/Warehouse_Backoffice");
  const backOne = () => router.back();

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>Catalog</p>
            <h1 className={styles.title}>{editingId ? "Edit Product" : "Create Product"}</h1>
            <p className={styles.subtitle}>
              {editingId
                ? "Update an existing product."
                : "Insert a new product into catalog_items. Labels below tell you exactly what to type (pack qty vs sent qty, etc.)."}
            </p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={backOne} className={styles.backButton}>
              Back
            </button>
            <button onClick={back} className={styles.backButton}>
              Back to Dashboard
            </button>
          </div>
        </header>

        <form className={styles.form} onSubmit={submit}>
          <div className={styles.fieldGrid}>
            <Field
              label="Product name"
              hint="Friendly name staff will see"
              value={form.name}
              onChange={(v) => handleChange("name", v)}
              required
            />
            <Field
              label="Internal SKU"
              hint="Optional code used for scans/search"
              value={form.sku}
              onChange={(v) => handleChange("sku", v)}
            />
            {!form.has_variations && (
              <Field
                label="Supplier SKU"
                hint="Supplier-facing code used for purchase intake scans"
                value={form.supplier_sku}
                onChange={(v) => handleChange("supplier_sku", v)}
              />
            )}
            <Select
              label="Stock kind"
              hint="Finished = sellable; Ingredient = used inside recipes; Raw = unprocessed input"
              value={form.item_kind}
              onChange={(v) => handleChange("item_kind", v)}
              options={itemKinds}
            />
            <Field
              label="Image URL (optional)"
              hint="Link to product image"
              value={form.image_url}
              onChange={(v) => handleChange("image_url", v)}
            />
            {!disableVariantControlled && (
              <>
                <Select
                  label="Unit (stock + consumption)"
                  hint="Single unit used for stock, transfers, and consumption"
                  value={form.consumption_unit}
                  onChange={(v) => handleChange("consumption_unit", v)}
                  options={qtyUnitOptions as unknown as { value: string; label: string }[]}
                />
                <Select
                  label="Stocktake unit (warehouse counts)"
                  hint="Optional override for counting stock (e.g., kg instead of grams)"
                  value={form.stocktake_uom}
                  onChange={(v) => handleChange("stocktake_uom", v)}
                  options={[{ value: "", label: "Use consumption unit" }, ...(qtyUnitOptions as unknown as { value: string; label: string }[])]}
                />
                <Field
                  type="number"
                  label="Storage qty"
                  hint="Optional: quantity per storage unit (weight, volume, or count; e.g., kg per rod/bag)"
                  value={form.storage_weight}
                  onChange={(v) => handleChange("storage_weight", v)}
                  step="0.01"
                  min="0"
                />
                {isFinished && (
                  <>
                    <Select
                      label="Supplier pack unit"
                      hint="Unit written on supplier pack for this product"
                      value={form.purchase_pack_unit}
                      onChange={(v) => handleChange("purchase_pack_unit", v)}
                      options={qtyUnitOptions as unknown as { value: string; label: string }[]}
                    />
                    <Field
                      type="number"
                      label="Units inside one supplier pack"
                      hint="How many base units are inside one supplier pack"
                      value={form.units_per_purchase_pack}
                      onChange={(v) => handleChange("units_per_purchase_pack", v)}
                      step="1"
                      min="1"
                    />
                  </>
                )}
                {isIngredientOrRaw && !form.has_variations && (
                    <div className={styles.ingredientCardGrid}>
                      <div className={`${styles.sectionCard} ${styles.ingredientCard}`}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Supplier Pack Unit</h3>
                        <p className={styles.sectionHint}>Unit written on the supplier pack.</p>
                      </div>
                      <Select
                        label="Supplier pack unit"
                        hint="Unit used when receiving stock."
                        value={form.purchase_pack_unit}
                        onChange={(v) => handleChange("purchase_pack_unit", v)}
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
                        value={form.units_per_purchase_pack}
                        onChange={(v) => handleChange("units_per_purchase_pack", v)}
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
                        value={form.purchase_unit_mass}
                        onChange={(v) => handleChange("purchase_unit_mass", v)}
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
                        value={form.purchase_unit_mass_uom}
                        onChange={(v) => handleChange("purchase_unit_mass_uom", v)}
                        options={qtyUnitOptions as unknown as { value: string; label: string }[]}
                      />
                      {packMassConversion ? (
                        <p className={styles.sectionHint}>{packMassConversion}</p>
                      ) : null}
                      </div>
                      <div className={`${styles.sectionCard} ${styles.ingredientCard}`}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Transfer Unit</h3>
                        <p className={styles.sectionHint}>Unit used for transfers and stock movements.</p>
                      </div>
                      <Select
                        label="Transfer unit"
                        hint="Shown on scanner qty prompts."
                        value={form.transfer_unit}
                        onChange={(v) => handleChange("transfer_unit", v)}
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
                        value={form.transfer_quantity}
                        onChange={(v) => handleChange("transfer_quantity", v)}
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
                        value={form.storage_home_id}
                        onChange={(v) => handleChange("storage_home_id", v)}
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
                          value={form.storage_unit}
                          onChange={(v) => handleChange("storage_unit", v)}
                          options={[{ value: "", label: "Not set" }, ...(qtyUnitOptions as unknown as { value: string; label: string }[])]}
                        />
                      </div>
                  </div>
                )}
                <Field
                  type="number"
                  label="Consumption qty"
                  hint="Consumption units used per 1 unit"
                  value={form.consumption_qty_per_base}
                  onChange={(v) => handleChange("consumption_qty_per_base", v)}
                  step="0.0001"
                  min="0.0001"
                  required
                />
                <Field
                  type="number"
                  label="Quantity decimal places"
                  hint="0 = whole numbers, 1 or 2 = allow decimals (e.g., kg)"
                  value={form.qty_decimal_places}
                  onChange={(v) => handleChange("qty_decimal_places", v)}
                  step="1"
                  min="0"
                />
                {!(isIngredientOrRaw && !form.has_variations) && (
                  <Select
                    label="Storage unit"
                    hint="How this item is held in stock (e.g., rods, bags, cases)"
                    value={form.storage_unit}
                    onChange={(v) => handleChange("storage_unit", v)}
                    options={[{ value: "", label: "Not set" }, ...(qtyUnitOptions as unknown as { value: string; label: string }[])]}
                  />
                )}
                {!isIngredient && (
                  <Field
                    type="number"
                    label="Cost per base unit"
                    hint="Default unit cost (not pack cost)"
                    value={form.cost}
                    onChange={(v) => handleChange("cost", v)}
                    step="0.01"
                    min="0"
                  />
                )}
              </>
            )}
          </div>

          {!form.has_variations && (
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
                  value={form.selling_price}
                  onChange={(v) => handleChange("selling_price", v)}
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
              checked={form.outlet_order_visible}
              onChange={(checked) => handleChange("outlet_order_visible", checked)}
            />
            <Checkbox
              label="Product has variants"
              hint="Set true if you will add variants (sizes/flavors)"
              checked={form.has_variations}
              onChange={(checked) => handleChange("has_variations", checked)}
            />
            <Checkbox
              label="Has production recipe"
              hint="Check if this finished product is produced via a recipe/BOM"
              checked={form.has_recipe}
              onChange={(checked) => handleChange("has_recipe", checked)}
            />
            <Checkbox
              label="Active"
              hint="Keep checked so teams can use it"
              checked={form.active}
              onChange={(checked) => handleChange("active", checked)}
            />
          </div>

          {result && (
            <div className={`${styles.callout} ${result.ok ? styles.calloutSuccess : styles.calloutError}`}>
              {result.message}
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" onClick={() => setForm(defaultForm)} className={styles.secondaryButton}>
              Clear form
            </button>
            <button type="submit" className={styles.primaryButton} disabled={saving || readOnly}>
              {readOnly ? "Read-only" : saving ? "Saving..." : "Save product"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function ProductCreatePageWrapper() {
  return (
    <Suspense fallback={null}>
      <ProductCreatePage />
    </Suspense>
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
