"use client";

import { useEffect, useMemo, useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./variant.module.css";
import { useWarehouseAuth } from "../../useWarehouseAuth";

const qtyUnits = [
  "pc",
  "g",
  "kg",
  "mg",
  "ml",
  "l",
  "cup",
  "case",
  "straw",
  "toilet paper",
  "crate",
  "bottle",
  "Tin Can",
  "Jar",
  "Block",
  "Bucket",
  "Bag",
  "Tray",
  "Packet",
  "Box",
] as const;

const itemKinds = [
  { value: "finished", label: "Finished (ready to sell)" },
  { value: "ingredient", label: "Ingredient (used in production)" },
  { value: "raw", label: "Raw (unprocessed material)" },
];

const formatUnitLabel = (unit: string) => {
  const trimmed = unit.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const mapped =
    lower === "each"
      ? "Each"
      : lower === "pc" || lower === "pcs"
        ? "Pc(s)"
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
              : lower === "cup"
                ? "Cup(s)"
                : lower === "straw"
                  ? "Straw(s)"
                : lower === "toilet paper"
                  ? "Toilet Paper(s)"
              : lower === "block"
                ? "Block(s)"
              : lower === "bucket"
                ? "Bucket(s)"
                : lower === "bag"
                  ? "Bag(s)"
                  : lower === "tray"
                    ? "Tray(s)"
                  : lower === "packet"
                    ? "Packet(s)"
                    : lower === "box"
                      ? "Box(es)"
                      : null;
  if (mapped) return mapped;
  const capitalized = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return capitalized.endsWith("(s)") ? capitalized : `${capitalized}(s)`;
};

type Warehouse = { id: string; name: string };
type Item = { id: string; name: string; sku?: string | null };

const normalizeUomValue = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase() === "each" ? "pc" : trimmed;
};

const mergeStorageHomeIds = (primaryId: string, ids: string[]) => {
  if (!primaryId) return ids;
  return ids.includes(primaryId) ? ids : [primaryId, ...ids];
};


type FormState = {
  item_id: string;
  name: string;
  sku: string;
  item_kind: string;
  consumption_uom: string;
  purchase_pack_unit: string;
  units_per_purchase_pack: string;
  transfer_unit: string;
  transfer_quantity: string;
  stocktake_uom: string;
  cost: string;
  selling_price: string;
  outlet_order_visible: boolean;
  image_url: string;
  storage_home_id: string;
  storage_home_ids: string[];
  active: boolean;
};

const defaultForm: FormState = {
  item_id: "",
  name: "",
  sku: "",
  item_kind: "finished",
  consumption_uom: "pc",
  purchase_pack_unit: "pc",
  units_per_purchase_pack: "1",
  transfer_unit: "pc",
  transfer_quantity: "1",
  stocktake_uom: "pc",
  cost: "0",
  selling_price: "0",
  outlet_order_visible: true,
  image_url: "",
  storage_home_id: "",
  storage_home_ids: [],
  active: true,
};

function VariantCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, readOnly } = useWarehouseAuth();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [, setLoadingVariant] = useState(false);
  const [storageSearch, setStorageSearch] = useState("");

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
          const storageHomeId = variant.storage_home_id ?? variant.default_warehouse_id ?? "";
          const storageHomeIds = Array.isArray(variant.storage_home_ids)
            ? variant.storage_home_ids.filter((id: unknown): id is string => typeof id === "string")
            : [];
          const mergedStorageHomeIds = mergeStorageHomeIds(
            storageHomeId,
            storageHomeIds.filter((id: string) => id !== storageHomeId)
          );
          setForm({
            item_id: variant.item_id ?? incomingItemId ?? "",
            name: variant.name ?? "",
            sku: variant.sku ?? "",
            item_kind: variant.item_kind ?? "finished",
            consumption_uom: normalizeUomValue(variant.consumption_uom) || "pc",
            purchase_pack_unit: variant.purchase_pack_unit ?? normalizeUomValue(variant.consumption_uom) ?? "pc",
            units_per_purchase_pack: (variant.units_per_purchase_pack ?? 1).toString(),
            transfer_unit: normalizeUomValue(variant.transfer_unit) || normalizeUomValue(variant.consumption_uom) || "pc",
            transfer_quantity: (variant.transfer_quantity ?? 1).toString(),
            stocktake_uom: normalizeUomValue(variant.consumption_uom) || "pc",
            cost: (variant.cost ?? 0).toString(),
            selling_price: (variant.selling_price ?? 0).toString(),
            outlet_order_visible: variant.outlet_order_visible ?? true,
            image_url: variant.image_url ?? "",
            storage_home_id: storageHomeId,
            storage_home_ids: mergedStorageHomeIds,
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
  const vatExcludedPrice = useMemo(() => {
    const parsed = Number(form.selling_price);
    if (!Number.isFinite(parsed) || parsed <= 0) return "";
    return (parsed / 1.16).toFixed(2);
  }, [form.selling_price]);

  if (status !== "ok") return null;

  const handleChange = (key: keyof FormState, value: string | boolean) => {
    setForm((prev) => {
      if (key === "storage_home_id") {
        const nextId = typeof value === "string" ? value : "";
        const nextIds = nextId
          ? mergeStorageHomeIds(nextId, prev.storage_home_ids.filter((id) => id !== nextId))
          : [];
        return { ...prev, storage_home_id: nextId, storage_home_ids: nextIds };
      }
      if (key === "consumption_uom" && typeof value === "string") {
        return {
          ...prev,
          consumption_uom: value,
          stocktake_uom: value,
        };
      }
      return { ...prev, [key]: value };
    });
  };

  const toggleStorageHome = (warehouseId: string) => {
    if (!warehouseId) return;
    setForm((prev) => {
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

  const renderStorageHomesSelect = () => {
    const selectedValues = mergeStorageHomeIds(
      form.storage_home_id,
      form.storage_home_ids.filter((id) => id !== form.storage_home_id)
    );
    const query = storageSearch.trim().toLowerCase();
    const filtered = warehouseOptions.filter((warehouse) =>
      warehouse.name.toLowerCase().includes(query)
    );
    return (
      <div className={styles.field}>
        <span className={styles.label}>Storage home(s)</span>
        <small className={styles.hint}>Select one or more warehouses. Primary is the first selected.</small>
        <input
          className={styles.input}
          placeholder="Search warehouses"
          value={storageSearch}
          onChange={(event) => setStorageSearch(event.target.value)}
        />
        {query ? (
          <div className={styles.multiSelectList}>
            {filtered.length ? (
              filtered.map((warehouse) => {
                const checked = selectedValues.includes(warehouse.id);
                return (
                  <label key={warehouse.id} className={styles.checkbox}>
                    <span>{warehouse.name}</span>
                    <input
                      className={styles.checkboxInput}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStorageHome(warehouse.id)}
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


  const toNumber = (value: string, fallback: number, min = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed <= min) return fallback;
    return parsed;
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
      const resolvedStorageHomeIds = mergeStorageHomeIds(
        form.storage_home_id,
        form.storage_home_ids.filter((id) => id !== form.storage_home_id)
      );
      const payload = {
        ...form,
        units_per_purchase_pack: toNumber(form.units_per_purchase_pack, 1, 0),
        transfer_quantity: 1,
        qty_decimal_places: 2,
        cost: toNumber(form.cost, 0, -0.0001),
        selling_price: toNumber(form.selling_price, 0, -0.0001),
        storage_home_id: form.storage_home_id || null,
        storage_home_ids: resolvedStorageHomeIds,
        default_warehouse_id: form.storage_home_id || null,
        supplier_sku: null,
        purchase_pack_unit: form.purchase_pack_unit || form.consumption_uom,
        transfer_unit: form.consumption_uom,
        stocktake_uom: form.consumption_uom,
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
              label="Sku"
              hint="Single SKU for internal, supplier, and POS mapping"
              value={form.sku}
              onChange={(v) => handleChange("sku", v)}
            />
            <Field
              label="Variant name"
              hint="Example: 500g bag, 1L bottle, Large size"
              value={form.name}
              onChange={(v) => handleChange("name", v)}
              required
            />
            <Select
              label="Type"
              hint="Finished = sellable; Ingredient = used inside recipes; Raw = unprocessed input"
              value={form.item_kind}
              onChange={(v) => handleChange("item_kind", v)}
              options={itemKinds}
            />
            <Select
              label="How its consumed"
              hint="Outlet sales and transfers use this unit"
              value={form.consumption_uom}
              onChange={(v) => handleChange("consumption_uom", v)}
              options={qtyUnits.map((value) => ({ value, label: formatUnitLabel(value) }))}
            />
            <Select
              label="How its Purchased"
              hint="How purchases are entered (case, box, sack)"
              value={form.purchase_pack_unit}
              onChange={(v) => handleChange("purchase_pack_unit", v)}
              options={qtyUnits.map((value) => ({ value, label: formatUnitLabel(value) }))}
            />
            <Field
              type="number"
              label="Units Inside Purchase Product"
              hint="Used to convert purchases into consumption units (e.g., 1 case = 12 bottles)"
              value={form.units_per_purchase_pack}
              onChange={(v) => handleChange("units_per_purchase_pack", v)}
              step="1"
              min="1"
            />
            {renderStorageHomesSelect()}
            <Field
              label="Image URL (optional)"
              hint="Link to variant image"
              value={form.image_url}
              onChange={(v) => handleChange("image_url", v)}
            />
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Selling Price Setup</h3>
              <p className={styles.sectionHint}>Enter the default selling price for this variant.</p>
            </div>
            <div className={styles.sectionGrid}>
              <Field
                type="number"
                label="Cost per base unit"
                hint="Default unit cost for this variant"
                value={form.cost}
                onChange={(v) => handleChange("cost", v)}
                step="0.01"
                min="0"
              />
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
            <button type="submit" className={styles.primaryButton} disabled={saving || readOnly}>
              {readOnly ? "Read-only" : saving ? "Saving..." : "Save variant"}
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
