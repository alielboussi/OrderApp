"use client";

import { useEffect, useMemo, useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./variant.module.css";
import { useWarehouseAuth } from "../../useWarehouseAuth";

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

type Warehouse = { id: string; name: string };
type Item = { id: string; name: string; sku?: string | null };

type FormState = {
  item_id: string;
  name: string;
  sku: string;
  consumption_uom: string;
  purchase_pack_unit: string;
  units_per_purchase_pack: string;
  purchase_unit_mass: string;
  purchase_unit_mass_uom: string;
  transfer_unit: string;
  transfer_quantity: string;
  cost: string;
  outlet_order_visible: boolean;
  image_url: string;
  default_warehouse_id: string;
  active: boolean;
};

const defaultForm: FormState = {
  item_id: "",
  name: "",
  sku: "",
  consumption_uom: "each",
  purchase_pack_unit: "each",
  units_per_purchase_pack: "1",
  purchase_unit_mass: "",
  purchase_unit_mass_uom: "kg",
  transfer_unit: "each",
  transfer_quantity: "1",
  cost: "0",
  outlet_order_visible: true,
  image_url: "",
  default_warehouse_id: "",
  active: true,
};

function VariantCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useWarehouseAuth();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [loadingVariant, setLoadingVariant] = useState(false);

  const editingId = searchParams?.get("id")?.trim() || "";
  const incomingItemId = searchParams?.get("item_id")?.trim() || "";

  useEffect(() => {
    async function load() {
      try {
        const [wRes, iRes] = await Promise.all([fetch("/api/warehouses"), fetch("/api/catalog/items")]);
        if (wRes.ok) {
          const json = await wRes.json();
          setWarehouses(Array.isArray(json.warehouses) ? json.warehouses : []);
        }
        if (iRes.ok) {
          const json = await iRes.json();
          setItems(Array.isArray(json.items) ? json.items : []);
        }
      } catch (error) {
        console.error("catalog loads failed", error);
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadVariant(id: string) {
      if (!id) return;
      setLoadingVariant(true);
      try {
        const res = await fetch(`/api/catalog/variants?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("Failed to load variant");
        const json = await res.json();
        const variant = json?.variant;
        if (variant) {
          setForm({
            item_id: variant.item_id ?? incomingItemId ?? "",
            name: variant.name ?? "",
            sku: variant.sku ?? "",
            consumption_uom: variant.consumption_uom ?? "each",
            purchase_pack_unit: variant.purchase_pack_unit ?? "each",
            units_per_purchase_pack: (variant.units_per_purchase_pack ?? 1).toString(),
            purchase_unit_mass: variant.purchase_unit_mass != null ? variant.purchase_unit_mass.toString() : "",
            purchase_unit_mass_uom: variant.purchase_unit_mass_uom ?? "kg",
            transfer_unit: variant.transfer_unit ?? "each",
            transfer_quantity: (variant.transfer_quantity ?? 1).toString(),
            cost: (variant.cost ?? 0).toString(),
            outlet_order_visible: variant.outlet_order_visible ?? true,
            image_url: variant.image_url ?? "",
            default_warehouse_id: variant.default_warehouse_id ?? "",
            active: variant.active ?? true,
          });
        }
      } catch (error) {
        console.error("variant load failed", error);
        setResult({ ok: false, message: error instanceof Error ? error.message : "Failed to load variant" });
      } finally {
        setLoadingVariant(false);
      }
    }

    if (editingId) loadVariant(editingId);
    if (!editingId && incomingItemId) setForm((prev) => ({ ...prev, item_id: incomingItemId }));
  }, [editingId, incomingItemId]);

  const warehouseOptions = useMemo(() => [{ id: "", name: "Not set" }, ...warehouses], [warehouses]);
  const itemOptions = useMemo(() => [{ id: "", name: "Select parent product" }, ...items], [items]);

  if (status !== "ok") return null;

  const handleChange = (key: keyof FormState, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  const toNumber = (value: string, fallback: number, min = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed <= min) return fallback;
    return parsed;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const payload = {
        ...form,
        units_per_purchase_pack: toNumber(form.units_per_purchase_pack, 1, 0),
        purchase_unit_mass: form.purchase_unit_mass === "" ? null : toNumber(form.purchase_unit_mass, 0, 0),
        transfer_quantity: toNumber(form.transfer_quantity, 1, 0),
        cost: toNumber(form.cost, 0, -0.0001),
        default_warehouse_id: form.default_warehouse_id || null,
        ...(editingId ? { id: editingId } : {}),
      };

      const res = await fetch("/api/catalog/variants", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not create variant");
      }

      setResult({ ok: true, message: editingId ? "Variant updated" : "Variant saved" });
      if (!editingId) setForm(defaultForm);
    } catch (error) {
      console.error(error);
      setResult({ ok: false, message: error instanceof Error ? error.message : "Failed to save variant" });
    } finally {
      setSaving(false);
    }
  };

  const back = () => router.push("/Warehouse_Backoffice");
  const backOne = () => router.back();

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>Catalog</p>
            <h1 className={styles.title}>{editingId ? "Edit Variant" : "Create Variant"}</h1>
            <p className={styles.subtitle}>
              {editingId
                ? "Update an existing variant attached to a product."
                : "Attach a variant to an existing product. Use clear names so teams know what quantity to type."}
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
            <Select
              label="Parent product"
              hint="Pick the product this variant belongs to"
              value={form.item_id}
              onChange={(v) => handleChange("item_id", v)}
              options={itemOptions.map((item) => ({ value: item.id, label: item.name }))}
              required
            />
            <Field
              label="Variant name"
              hint="Example: 500g bag, 1L bottle, Large size"
              value={form.name}
              onChange={(v) => handleChange("name", v)}
              required
            />
            <Field
              label="Variant SKU or barcode"
              hint="Optional code used for scans/search"
              value={form.sku}
              onChange={(v) => handleChange("sku", v)}
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
              hint="Unit written on supplier pack for this variant"
              value={form.purchase_pack_unit}
              onChange={(v) => handleChange("purchase_pack_unit", v)}
              options={qtyUnits.map((value) => ({ value, label: value }))}
            />
            <Field
              type="number"
              label="Units inside one supplier pack"
              hint="Example: box of 6 = 6 (pack qty, not sent qty)"
              value={form.units_per_purchase_pack}
              onChange={(v) => handleChange("units_per_purchase_pack", v)}
              step="0.01"
              min="0.01"
            />
            <Field
              type="number"
              label="Weight/volume per purchase unit"
              hint="Optional. Example: 0.5 (kg) per pack"
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
              hint="Unit used when moving this variant between warehouses"
              value={form.transfer_unit}
              onChange={(v) => handleChange("transfer_unit", v)}
              options={qtyUnits.map((value) => ({ value, label: value }))}
            />
            <Field
              type="number"
              label="Quantity per transfer line"
              hint="Default quantity moved for this variant"
              value={form.transfer_quantity}
              onChange={(v) => handleChange("transfer_quantity", v)}
              step="0.01"
              min="0.01"
            />
            <Field
              type="number"
              label="Cost per base unit"
              hint="Default unit cost for this variant"
              value={form.cost}
              onChange={(v) => handleChange("cost", v)}
              step="0.01"
              min="0"
            />
            <Select
              label="Default warehouse"
              hint="Where this variant normally lives"
              value={form.default_warehouse_id}
              onChange={(v) => handleChange("default_warehouse_id", v)}
              options={warehouseOptions.map((w) => ({ value: w.id, label: w.name }))}
            />
            <Field
              label="Image URL (optional)"
              hint="Link to variant image"
              value={form.image_url}
              onChange={(v) => handleChange("image_url", v)}
            />
          </div>

          <div className={styles.toggleRow}>
            <Checkbox
              label="Show in outlet orders"
              hint="If off, this variant stays hidden from outlet ordering"
              checked={form.outlet_order_visible}
              onChange={(checked) => handleChange("outlet_order_visible", checked)}
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
              {saving ? "Saving..." : "Save variant"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function VariantCreatePageWrapper() {
  return (
    <Suspense fallback={null}>
      <VariantCreatePage />
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
};

function Field({ label, hint, value, onChange, required, type = "text", step, min }: FieldProps) {
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
};

function Select({ label, hint, value, onChange, options, required }: SelectProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <small className={styles.hint}>{hint}</small>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={styles.input} required={required}>
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
      <input className={styles.checkboxInput} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
