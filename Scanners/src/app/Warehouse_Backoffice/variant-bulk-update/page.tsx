"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "./variant-bulk-update.module.css";

type Warehouse = { id: string; name: string };

type Item = { id: string; name: string; sku?: string | null };

type VariantSummary = {
  id: string;
  item_id: string;
  name: string;
  sku?: string | null;
  supplier_sku?: string | null;
  item_kind: string;
  consumption_uom: string;
  stocktake_uom?: string | null;
  purchase_pack_unit: string;
  units_per_purchase_pack: number;
  purchase_unit_mass?: number | null;
  purchase_unit_mass_uom?: string | null;
  transfer_unit: string;
  transfer_quantity: number;
  qty_decimal_places?: number | null;
  cost: number;
  selling_price?: number | null;
  outlet_order_visible: boolean;
  image_url?: string | null;
  default_warehouse_id?: string | null;
  active: boolean;
};

const qtyUnits = ["each", "g", "kg", "mg", "ml", "l", "case", "crate", "bottle", "Tin Can", "Jar"] as const;
const itemKinds = [
  { value: "finished", label: "Finished (ready to sell)" },
  { value: "ingredient", label: "Ingredient (used in production)" },
  { value: "raw", label: "Raw (unprocessed material)" },
];

const unitOptions = qtyUnits.map((value) => ({ value, label: value }));

const fieldOptions = [
  { value: "sku", label: "SKU", type: "text" },
  { value: "supplier_sku", label: "Supplier SKU", type: "text" },
  { value: "item_kind", label: "Item kind", type: "select", options: itemKinds },
  { value: "consumption_uom", label: "Consumption unit", type: "select", options: unitOptions },
  { value: "stocktake_uom", label: "Stocktake unit", type: "select", options: [{ value: "", label: "Use consumption unit" }, ...unitOptions] },
  { value: "purchase_pack_unit", label: "Supplier pack unit", type: "select", options: unitOptions },
  { value: "units_per_purchase_pack", label: "Units inside one supplier pack", type: "number" },
  { value: "purchase_unit_mass", label: "Weight/volume per purchase unit", type: "number-null" },
  { value: "purchase_unit_mass_uom", label: "Mass/volume unit", type: "select", options: unitOptions },
  { value: "transfer_unit", label: "Transfer unit", type: "select", options: unitOptions },
  { value: "transfer_quantity", label: "Quantity per transfer line", type: "number" },
  { value: "qty_decimal_places", label: "Quantity decimal places", type: "number-int" },
  { value: "cost", label: "Cost per base unit", type: "number" },
  { value: "selling_price", label: "Selling price", type: "number" },
  { value: "outlet_order_visible", label: "Show in outlet orders", type: "boolean" },
  { value: "image_url", label: "Image URL", type: "text-null" },
  { value: "active", label: "Active", type: "boolean" },
  { value: "default_warehouse_id", label: "Storage home", type: "select-warehouse" },
] as const;

type FieldOption = (typeof fieldOptions)[number];

type FieldType = FieldOption["type"];

function parseFieldValue(field: FieldOption, raw: string) {
  const trimmed = raw.trim();
  switch (field.type) {
    case "text":
      if (!trimmed) return { ok: false as const, error: "Value is required" };
      return { ok: true as const, value: trimmed };
    case "text-null":
      return { ok: true as const, value: trimmed.length ? trimmed : null };
    case "number": {
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num <= 0) return { ok: false as const, error: "Enter a number greater than 0" };
      return { ok: true as const, value: num };
    }
    case "number-null": {
      if (!trimmed) return { ok: true as const, value: null };
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num < 0) return { ok: false as const, error: "Enter a non-negative number" };
      return { ok: true as const, value: num };
    }
    case "number-int": {
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num < 0) return { ok: false as const, error: "Enter a non-negative integer" };
      return { ok: true as const, value: Math.max(0, Math.min(6, Math.round(num))) };
    }
    case "boolean":
      if (trimmed === "true" || trimmed === "false") return { ok: true as const, value: trimmed === "true" };
      return { ok: false as const, error: "Pick Yes or No" };
    case "select":
    case "select-warehouse":
      return { ok: true as const, value: trimmed.length ? trimmed : null };
    default:
      return { ok: false as const, error: "Unsupported field" };
  }
}

function formatFieldValue(fieldKey: string, variant: VariantSummary) {
  const value = (variant as Record<string, unknown>)[fieldKey];
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export default function VariantBulkUpdatePage() {
  const router = useRouter();
  const { status, readOnly } = useWarehouseAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [variants, setVariants] = useState<VariantSummary[]>([]);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [selectedField, setSelectedField] = useState<string>("units_per_purchase_pack");
  const [fieldValue, setFieldValue] = useState<string>("");
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const [iRes, wRes] = await Promise.all([fetch("/api/catalog/items"), fetch("/api/warehouses")]);
        if (iRes.ok) {
          const json = await iRes.json();
          setItems(Array.isArray(json.items) ? json.items : []);
        }
        if (wRes.ok) {
          const json = await wRes.json();
          setWarehouses(Array.isArray(json.warehouses) ? json.warehouses : []);
        }
      } catch (error) {
        console.error("bulk update load failed", error);
      }
    }
    if (status === "ok") {
      loadCatalog();
    }
  }, [status]);

  useEffect(() => {
    if (!selectedItemId) {
      setVariants([]);
      setSelectedVariantIds([]);
      return;
    }
    let active = true;
    const loadVariants = async () => {
      try {
        const res = await fetch(`/api/catalog/variants?item_id=${encodeURIComponent(selectedItemId)}`);
        if (!res.ok) throw new Error("Failed to load variants");
        const json = await res.json();
        if (!active) return;
        const rows = Array.isArray(json?.variants) ? (json.variants as VariantSummary[]) : [];
        setVariants(rows);
        setSelectedVariantIds((prev) => prev.filter((id) => rows.some((v) => v.id === id)));
      } catch (error) {
        console.error("variant load failed", error);
        if (active) setVariants([]);
      }
    };
    loadVariants();
    return () => {
      active = false;
    };
  }, [selectedItemId]);

  const fieldMeta = useMemo(() => fieldOptions.find((field) => field.value === selectedField), [selectedField]);

  const warehouseOptions = useMemo(
    () => [{ id: "", name: "Not set" }, ...warehouses].map((w) => ({ value: w.id, label: w.name })),
    [warehouses]
  );

  const renderFieldInput = () => {
    if (!fieldMeta) return null;
    if (fieldMeta.type === "select") {
      return (
        <select
          className={styles.select}
          value={fieldValue}
          onChange={(event) => setFieldValue(event.target.value)}
          aria-label="Bulk field value"
        >
          {fieldMeta.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    if (fieldMeta.type === "select-warehouse") {
      return (
        <select
          className={styles.select}
          value={fieldValue}
          onChange={(event) => setFieldValue(event.target.value)}
          aria-label="Bulk field value"
        >
          {warehouseOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    if (fieldMeta.type === "boolean") {
      return (
        <select
          className={styles.select}
          value={fieldValue}
          onChange={(event) => setFieldValue(event.target.value)}
          aria-label="Bulk field value"
        >
          <option value="">Select</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }
    return (
      <input
        className={styles.input}
        type={fieldMeta.type.startsWith("number") ? "number" : "text"}
        step={fieldMeta.type === "number-int" ? "1" : "0.01"}
        min={fieldMeta.type === "number-null" ? "0" : fieldMeta.type.startsWith("number") ? "0.01" : undefined}
        value={fieldValue}
        onChange={(event) => setFieldValue(event.target.value)}
        placeholder={fieldMeta.type.includes("null") ? "Leave blank for none" : "Enter value"}
        aria-label="Bulk field value"
      />
    );
  };

  const toggleVariant = (id: string) => {
    setSelectedVariantIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const selectAll = () => {
    setSelectedVariantIds(variants.map((variant) => variant.id));
  };

  const clearAll = () => {
    setSelectedVariantIds([]);
  };

  const applyBulk = async () => {
    if (!fieldMeta) return;
    if (!selectedVariantIds.length) {
      setResult("Select at least one variant.");
      return;
    }
    const parsed = parseFieldValue(fieldMeta, fieldValue);
    if (!parsed.ok) {
      setResult(parsed.error);
      return;
    }
    setApplying(true);
    setResult(null);
    try {
      const updateValue = parsed.value as unknown;
      const selectedVariants = variants.filter((variant) => selectedVariantIds.includes(variant.id));
      await Promise.all(
        selectedVariants.map(async (variant) => {
          const res = await fetch("/api/catalog/variants", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: variant.id,
              item_id: variant.item_id,
              name: variant.name,
              [fieldMeta.value]: updateValue,
            }),
          });
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            const details = payload?.details ? ` (${JSON.stringify(payload.details)})` : "";
            const message = (payload?.error || `Update failed for ${variant.name || variant.id}`) + details;
            throw new Error(message);
          }
        })
      );

      const res = await fetch(`/api/catalog/variants?item_id=${encodeURIComponent(selectedItemId)}`);
      if (res.ok) {
        const json = await res.json();
        const rows = Array.isArray(json?.variants) ? (json.variants as VariantSummary[]) : [];
        setVariants(rows);
      }
      setResult("Bulk update applied.");
    } catch (error) {
      console.error("bulk update failed", error);
      setResult(error instanceof Error ? error.message : "Bulk update failed");
    } finally {
      setApplying(false);
    }
  };

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>Catalog</p>
            <h1 className={styles.title}>Bulk Variant Update</h1>
            <p className={styles.subtitle}>Select a product, pick variants, choose a field, and apply one value.</p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={() => router.back()} className={styles.backButton}>
              Back
            </button>
            <button onClick={() => router.push("/Warehouse_Backoffice")} className={styles.backButton}>
              Back to Dashboard
            </button>
          </div>
        </header>

        <section className={styles.form}>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Parent product</span>
              <span className={styles.hint}>Pick the product whose variants you want to update.</span>
              <select
                className={styles.select}
                value={selectedItemId}
                onChange={(event) => setSelectedItemId(event.target.value)}
                aria-label="Select parent product"
              >
                <option value="">Select product</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Field to update</span>
              <span className={styles.hint}>Choose which field you want to apply across selected variants.</span>
              <select
                className={styles.select}
                value={selectedField}
                onChange={(event) => setSelectedField(event.target.value)}
                aria-label="Select field to update"
              >
                {fieldOptions.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Value</span>
              <span className={styles.hint}>This value will be applied to all selected variants.</span>
              {renderFieldInput()}
            </label>
          </div>

          <div className={styles.actionRow}>
            <button type="button" onClick={selectAll} className={styles.secondaryButton}>
              Select all
            </button>
            <button type="button" onClick={clearAll} className={styles.secondaryButton}>
              Clear
            </button>
            <button type="button" onClick={applyBulk} className={styles.primaryButton} disabled={readOnly || applying}>
              {applying ? "Applying..." : readOnly ? "Read-only" : "Apply"}
            </button>
          </div>

          {result && <p className={styles.callout}>{result}</p>}

          <div className={styles.variantGrid}>
            {variants.length === 0 ? (
              <p className={styles.emptyState}>No variants loaded. Select a product to see variants.</p>
            ) : (
              variants.map((variant) => (
                <label key={variant.id} className={styles.variantCard}>
                  <div>
                    <p className={styles.variantName}>{variant.name}</p>
                    <p className={styles.variantMeta}>Current: {formatFieldValue(selectedField, variant)}</p>
                  </div>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={selectedVariantIds.includes(variant.id)}
                    onChange={() => toggleVariant(variant.id)}
                  />
                </label>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
