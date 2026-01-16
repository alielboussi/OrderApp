"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import styles from "./product.module.css";

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
] as const;
const itemKinds = [
  { value: "finished", label: "Finished (ready to sell)" },
  { value: "ingredient", label: "Ingredient (used in production)" },
  { value: "raw", label: "Raw (unprocessed material)" },
];

type Warehouse = { id: string; name: string };

type FormState = {
  name: string;
  sku: string;
  item_kind: "finished" | "ingredient" | "raw";
  base_unit: string;
  consumption_uom: string;
  purchase_pack_unit: string;
  units_per_purchase_pack: string;
  purchase_unit_mass: string;
  purchase_unit_mass_uom: string;
  transfer_unit: string;
  transfer_quantity: string;
  cost: string;
  has_variations: boolean;
  outlet_order_visible: boolean;
  image_url: string;
  default_warehouse_id: string;
  active: boolean;
};

const defaultForm: FormState = {
  name: "",
  sku: "",
  item_kind: "finished",
  base_unit: "each",
  consumption_uom: "each",
  purchase_pack_unit: "each",
  units_per_purchase_pack: "1",
  purchase_unit_mass: "",
  purchase_unit_mass_uom: "kg",
  transfer_unit: "each",
  transfer_quantity: "1",
  cost: "0",
  has_variations: false,
  outlet_order_visible: true,
  image_url: "",
  default_warehouse_id: "",
  active: true,
};

export default function ProductCreatePage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const disableVariantControlled = form.has_variations;

  useEffect(() => {
    async function loadWarehouses() {
      try {
        const res = await fetch("/api/warehouses");
        if (!res.ok) throw new Error("Failed to load warehouses");
        const json = await res.json();
        setWarehouses(Array.isArray(json.warehouses) ? json.warehouses : []);
      } catch (error) {
        console.error("warehouses load failed", error);
      }
    }
    loadWarehouses();
  }, []);

  const warehouseOptions = useMemo(() => [{ id: "", name: "Not set" }, ...warehouses], [warehouses]);

  if (status !== "ok") return null;

  const handleChange = (key: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toNumber = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const payload = {
        ...form,
        units_per_purchase_pack: toNumber(form.units_per_purchase_pack, 1),
        purchase_unit_mass: form.purchase_unit_mass === "" ? null : toNumber(form.purchase_unit_mass, 0),
        transfer_quantity: toNumber(form.transfer_quantity, 1),
        cost: toNumber(form.cost, 0),
        default_warehouse_id: form.default_warehouse_id || null,
      };

      const res = await fetch("/api/catalog/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not create product");
      }

      setResult({ ok: true, message: "Product saved to catalog_items" });
      setForm(defaultForm);
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
            <h1 className={styles.title}>Create Product</h1>
            <p className={styles.subtitle}>
              Insert a new product into catalog_items. Labels below tell you exactly what to type (pack qty vs sent qty, etc.).
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
              label="SKU or barcode"
              hint="Optional code used for scans/search"
              value={form.sku}
              onChange={(v) => handleChange("sku", v)}
            />
            <Select
              label="Stock kind"
              hint="Finished = sellable; Ingredient = used inside recipes; Raw = unprocessed input"
              value={form.item_kind}
              onChange={(v) => handleChange("item_kind", v)}
              options={itemKinds}
            />
            {!disableVariantControlled && (
              <>
                <Select
                  label="Base unit (single piece)"
                  hint="Smallest unit you track (e.g., each, kg)"
                  value={form.base_unit}
                  onChange={(v) => handleChange("base_unit", v)}
                  options={qtyUnits.map((value) => ({ value, label: value }))}
                />
                <Select
                  label="Consumption unit"
                  hint="Unit used when deducting/consuming"
                  value={form.consumption_uom}
                  onChange={(v) => handleChange("consumption_uom", v)}
                  options={qtyUnits.map((value) => ({ value, label: value }))}
                />
                <Select
                  label="Supplier pack unit"
                  hint="Unit written on supplier pack (box, kg, each)"
                  value={form.purchase_pack_unit}
                  onChange={(v) => handleChange("purchase_pack_unit", v)}
                  options={qtyUnits.map((value) => ({ value, label: value }))}
                />
                <Field
                  type="number"
                  label="Units inside one supplier pack"
                  hint="Example: box of 12 = 12 (pack qty, not sent qty)"
                  value={form.units_per_purchase_pack}
                  onChange={(v) => handleChange("units_per_purchase_pack", v)}
                  step="0.01"
                  min="0"
                />
                <Field
                  type="number"
                  label="Weight/volume per purchase unit"
                  hint="Optional. Example: 2.5 (kg) per bag"
                  value={form.purchase_unit_mass}
                  onChange={(v) => handleChange("purchase_unit_mass", v)}
                  step="0.01"
                  min="0"
                />
                <Select
                  label="Mass/volume unit"
                  hint="Used only if weight/volume is set"
                  value={form.purchase_unit_mass_uom}
                  onChange={(v) => handleChange("purchase_unit_mass_uom", v)}
                  options={qtyUnits.map((value) => ({ value, label: value }))}
                />
                <Select
                  label="Transfer unit"
                  hint="Unit used when moving stock between warehouses"
                  value={form.transfer_unit}
                  onChange={(v) => handleChange("transfer_unit", v)}
                  options={qtyUnits.map((value) => ({ value, label: value }))}
                />
                <Field
                  type="number"
                  label="Quantity per transfer line"
                  hint="Default quantity moved when you create a transfer line"
                  value={form.transfer_quantity}
                  onChange={(v) => handleChange("transfer_quantity", v)}
                  step="0.01"
                  min="0"
                />
                <Field
                  type="number"
                  label="Cost per base unit"
                  hint="Default unit cost (not pack cost)"
                  value={form.cost}
                  onChange={(v) => handleChange("cost", v)}
                  step="0.01"
                  min="0"
                />
              </>
            )}
            <Select
              label="Default warehouse"
              hint="Where this product normally lives"
              value={form.default_warehouse_id}
              onChange={(v) => handleChange("default_warehouse_id", v)}
              options={warehouseOptions.map((w) => ({ value: w.id, label: w.name }))}
            />
            <Field
              label="Image URL (optional)"
              hint="Link to product image"
              value={form.image_url}
              onChange={(v) => handleChange("image_url", v)}
            />
          </div>

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
            <button type="submit" className={styles.primaryButton} disabled={saving}>
              {saving ? "Saving..." : "Save product"}
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
