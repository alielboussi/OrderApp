"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../useWarehouseAuth";
import { useUomOptions } from "@/lib/use-uom-options";
import eb from "../enterprise.module.css";
import styles from "./variant-bulk-update.module.css";
import { CatalogImageThumb } from "../catalog/CatalogImageThumb";
import { CatalogCardImageMenu } from "../catalog/CatalogCardImageMenu";

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

type FieldType =
  | "text"
  | "text-null"
  | "number"
  | "number-null"
  | "number-int"
  | "boolean"
  | "select"
  | "select-warehouse";

type FieldOption = {
  value: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
};

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
  const { status, readOnly, userId, userEmail } = useWarehouseAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [variants, setVariants] = useState<VariantSummary[]>([]);
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [selectedField, setSelectedField] = useState<string>("consumption_uom");
  const [fieldValue, setFieldValue] = useState<string>("");
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const unitOptions = useUomOptions();

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

  const fieldOptions: FieldOption[] = useMemo(
    () => [
      { value: "consumption_uom", label: "How its consumed", type: "select", options: unitOptions },
      { value: "cost", label: "Cost per base unit", type: "number" },
      { value: "selling_price", label: "Selling price", type: "number" },
      { value: "active", label: "Active", type: "boolean" },
    ],
    [unitOptions]
  );

  const fieldMeta = useMemo(
    () => fieldOptions.find((field) => field.value === selectedField),
    [fieldOptions, selectedField]
  );

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

  const handleVariantImageUpdated = (variantId: string, imageUrl: string) => {
    setVariants((prev) =>
      prev.map((entry) => (entry.id === variantId ? { ...entry, image_url: imageUrl } : entry)),
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
      setResult({ text: "Select at least one variant.", ok: false });
      return;
    }
    const parsed = parseFieldValue(fieldMeta, fieldValue);
    if (!parsed.ok) {
      setResult({ text: parsed.error, ok: false });
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
      setResult({ text: "Bulk update applied.", ok: true });
    } catch (error) {
      console.error("bulk update failed", error);
      setResult({ text: error instanceof Error ? error.message : "Bulk update failed", ok: false });
    } finally {
      setApplying(false);
    }
  };

  if (status !== "ok") {
    return (
      <section className={eb.pageCard}>
        <p className={eb.pageCardBody}>Not authorized for catalog.</p>
      </section>
    );
  }

  return (
    <div>
      <section className={eb.pageCard}>
        <div className={eb.sectionHeaderBlue}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            Bulk variant update
          </h3>
          <p className={eb.pageCardBody}>
            Select a product, pick variants, choose a field, and apply one value across all selected rows.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={eb.btnSecondary} onClick={() => router.push("/Warehouse_Backoffice/catalog/menu")}>
            View menu
          </button>
        </div>
        {selectedVariantIds.length > 0 && (
          <div className={eb.summaryGrid} style={{ marginTop: 16 }}>
            <div className={`${eb.summaryCard} ${eb.summaryCardBlue}`}>
              <p className={eb.summaryLabel}>Selected</p>
              <p className={eb.summaryValue}>{selectedVariantIds.length}</p>
            </div>
            <div className={`${eb.summaryCard} ${eb.summaryCardGreen}`}>
              <p className={eb.summaryLabel}>Loaded</p>
              <p className={eb.summaryValue}>{variants.length}</p>
            </div>
          </div>
        )}
      </section>

      <section className={eb.pageCard}>
        <div className={styles.form}>
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
              <span className={styles.hint}>Choose which field to apply across selected variants.</span>
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
            <button type="button" onClick={selectAll} className={eb.btnSecondary}>
              Select all
            </button>
            <button type="button" onClick={clearAll} className={eb.btnSecondary}>
              Clear
            </button>
            <button type="button" onClick={applyBulk} className={eb.btnAdd} disabled={readOnly || applying}>
              {applying ? "Applying…" : readOnly ? "Read-only" : "Apply update"}
            </button>
          </div>

          {result && (
            <p className={`${styles.callout} ${result.ok ? styles.calloutSuccess : styles.calloutError}`}>{result.text}</p>
          )}

          <div>
            <p className={styles.sectionTitle}>Variants</p>
            <div className={styles.variantGrid}>
              {variants.length === 0 ? (
                <p className={styles.emptyState}>No variants loaded. Select a product to see variants.</p>
              ) : (
                variants.map((variant) => (
                  <label key={variant.id} className={styles.variantCard}>
                    <div className={styles.variantCardImageWrap}>
                      <CatalogImageThumb url={variant.image_url} alt={variant.name} />
                      {!readOnly ? (
                        <CatalogCardImageMenu
                          entityType="variant"
                          entityId={variant.id}
                          itemId={variant.item_id}
                          actor={{ userId, userEmail }}
                          onImageUpdated={(imageUrl) => handleVariantImageUpdated(variant.id, imageUrl)}
                        />
                      ) : null}
                    </div>
                    <div className={styles.variantCardBody}>
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
          </div>
        </div>
      </section>
    </div>
  );
}
