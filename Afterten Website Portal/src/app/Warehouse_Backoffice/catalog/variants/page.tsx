"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import { logWarehouseAction } from "../../logging";
import { WAREHOUSE_AUDIT_ACTIONS } from "@/lib/warehouse-audit";
import { catalogApiHeaders } from "@/lib/catalog-api-headers";
import { useUomOptions } from "@/lib/use-uom-options";
import { POS_NUMERIC_SKU_MAX, parsePosNumericSku } from "@/lib/pos-catalog-ids";
import { isPackConsumptionUom, packUnitsLabel } from "@/lib/uom-pack";
import eb from "../../enterprise.module.css";
import styles from "../product/product.module.css";

const itemKinds = [
  { value: "finished", label: "Finished (ready to sell)" },
  { value: "ingredient", label: "Ingredient (used in production)" },
  { value: "raw", label: "Raw (unprocessed material)" },
];

type Item = {
  id: string;
  name: string;
  sku?: string | null;
  item_kind?: string | null;
  has_variations?: boolean | null;
};

type FormState = {
  item_id: string;
  name: string;
  sku: string;
  item_kind: string;
  consumption_uom: string;
  units_per_pack: string;
  cost: string;
  selling_price: string;
  image_url: string;
  active: boolean;
};

const defaultForm: FormState = {
  item_id: "",
  name: "",
  sku: "",
  item_kind: "finished",
  consumption_uom: "pc",
  units_per_pack: "1",
  cost: "0",
  selling_price: "0",
  image_url: "",
  active: true,
};

const normalizeUomValue = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase() === "each" ? "pc" : trimmed;
};

function VariantFormPage() {
  const searchParams = useSearchParams();
  const { status, readOnly, userId, userEmail } = useWarehouseAuth();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [, setLoadingVariant] = useState(false);
  const [suggestedSku, setSuggestedSku] = useState("");
  const [skuManual, setSkuManual] = useState(false);
  const uomOptions = useUomOptions();

  const editingId = searchParams?.get("id")?.trim() || "";
  const incomingItemId = searchParams?.get("item_id")?.trim() || "";

  const fetchNextPosSku = useCallback(async (productId?: string) => {
    const itemId = productId ?? form.item_id;
    if (!itemId) {
      setSuggestedSku("");
      return;
    }
    try {
      const res = await fetch(`/api/catalog/next-pos-ids?item_id=${encodeURIComponent(itemId)}`);
      if (!res.ok) return;
      const json = await res.json();
      if (typeof json.next_variant_sku === "string") {
        setSuggestedSku(json.next_variant_sku);
      }
    } catch (error) {
      console.error("Failed to load next POS variant SKU", error);
    }
  }, [form.item_id]);

  const vatExcludedPrice = useMemo(() => {
    const parsed = Number(form.selling_price);
    if (!Number.isFinite(parsed) || parsed <= 0) return "";
    return (parsed / 1.16).toFixed(2);
  }, [form.selling_price]);

  useEffect(() => {
    async function loadItems() {
      try {
        const res = await fetch("/api/catalog/items");
        if (!res.ok) return;
        const json = await res.json();
        setItems(Array.isArray(json.items) ? json.items : []);
      } catch (error) {
        console.error("Failed to load products", error);
      }
    }
    if (status === "ok") loadItems();
  }, [status]);

  useEffect(() => {
    if (!incomingItemId || editingId) return;
    setForm((prev) => (prev.item_id ? prev : { ...prev, item_id: incomingItemId }));
  }, [incomingItemId, editingId]);

  useEffect(() => {
    if (status !== "ok" || editingId || form.item_kind !== "finished" || !form.item_id) return;
    void fetchNextPosSku(form.item_id);
  }, [status, editingId, form.item_kind, form.item_id, fetchNextPosSku]);

  useEffect(() => {
    async function loadVariant(id: string) {
      setLoadingVariant(true);
      try {
        const res = await fetch(`/api/catalog/variants?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("Failed to load variant");
        const json = await res.json();
        const variant = json?.variant;
        if (!variant) return;
        setForm({
          item_id: variant.item_id ?? incomingItemId ?? "",
          name: variant.name ?? "",
          sku: variant.sku ?? "",
          item_kind: variant.item_kind ?? "finished",
          consumption_uom: normalizeUomValue(variant.consumption_uom) || "pc",
          units_per_pack: String(variant.units_per_purchase_pack ?? 1),
          cost: (variant.cost ?? 0).toString(),
          selling_price: (variant.selling_price ?? 0).toString(),
          image_url: variant.image_url ?? "",
          active: variant.active ?? true,
        });
      } catch (error) {
        console.error("variant load failed", error);
        setResult({ ok: false, message: error instanceof Error ? error.message : "Failed to load variant" });
      } finally {
        setLoadingVariant(false);
      }
    }
    if (editingId) void loadVariant(editingId);
  }, [editingId, incomingItemId]);

  const parentOptions = useMemo(() => {
    const selectedId = form.item_id || incomingItemId;
    return items
      .filter((item) => {
        if ((item.item_kind ?? "finished") !== "finished") return false;
        if (item.id === selectedId) return true;
        return Boolean(item.has_variations);
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [items, form.item_id, incomingItemId]);

  if (status !== "ok") {
    return (
      <section className={eb.pageCard}>
        <p className={eb.pageCardBody}>Not authorized for catalog.</p>
      </section>
    );
  }

  const handleChange = (key: keyof FormState, value: string | boolean) => {
    if (key === "sku" && typeof value === "string") {
      setSkuManual(true);
    }
    if (key === "item_id" && typeof value === "string") {
      setSkuManual(false);
      setForm((prev) => ({ ...prev, item_id: value, sku: "" }));
      void fetchNextPosSku(value);
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const usesAutoSku =
    !editingId && form.item_kind === "finished" && !skuManual && !form.sku.trim();
  const skuHint = usesAutoSku
    ? suggestedSku
      ? `Auto-assigned on save (next for this product: ${suggestedSku})`
      : form.item_id
        ? "Auto-assigned on save when left blank"
        : "Select a parent product first"
    : form.item_kind === "finished"
      ? `Numeric MintPOS ID (1-${POS_NUMERIC_SKU_MAX}) — unique on this product`
      : "Optional internal SKU";

  const toNumber = (value: string, fallback: number, min = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed <= min) return fallback;
    return parsed;
  };

  const resetForm = () => {
    const keepItemId = incomingItemId || form.item_id;
    setSkuManual(false);
    setForm({ ...defaultForm, item_id: keepItemId });
    void fetchNextPosSku();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) {
      setResult({ ok: false, message: "Read-only access: saving is disabled." });
      return;
    }
    if (!form.item_id) {
      setResult({ ok: false, message: "Select a parent product first." });
      return;
    }
    if (form.item_kind === "finished" && form.sku.trim() && !parsePosNumericSku(form.sku)) {
      setResult({
        ok: false,
        message: `Variant SKU must be a 1-3 digit number (1-${POS_NUMERIC_SKU_MAX}).`,
      });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const payload = {
        item_id: form.item_id,
        name: form.name,
        sku: usesAutoSku ? "" : form.sku.trim(),
        item_kind: form.item_kind,
        consumption_uom: form.consumption_uom,
        units_per_purchase_pack: toNumber(form.units_per_pack, 1),
        qty_decimal_places: 2,
        cost: toNumber(form.cost, 0, -0.0001),
        selling_price: toNumber(form.selling_price, 0, -0.0001),
        image_url: form.image_url,
        active: form.active,
        supplier_sku: null,
        ...(editingId ? { id: editingId } : {}),
      };

      const res = await fetch("/api/catalog/variants", {
        method: editingId ? "PUT" : "POST",
        headers: catalogApiHeaders({ userId, userEmail }),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not save variant");
      }

      const savedJson = await res.json().catch(() => ({}));
      const savedVariant = (savedJson.variant ?? savedJson) as { id?: string; name?: string; sku?: string | null } | null;
      const entityId = editingId ?? savedVariant?.id ?? null;
      const entityName = form.name || savedVariant?.name || "Variant";
      const savedSku = savedVariant?.sku ?? (usesAutoSku ? suggestedSku : form.sku.trim() || null);

      await logWarehouseAction({
        action: editingId ? WAREHOUSE_AUDIT_ACTIONS.EDIT_VARIANT : WAREHOUSE_AUDIT_ACTIONS.ADD_VARIANT,
        page: "/Warehouse_Backoffice/catalog/variants",
        method: editingId ? "PUT" : "POST",
        entity_type: "variant",
        entity_id: entityId,
        entity_name: entityName,
        details: { item_id: form.item_id, sku: savedSku },
      });

      setResult({ ok: true, message: editingId ? "Variant updated" : "Variant saved" });

      if (editingId) {
        const reloadRes = await fetch(`/api/catalog/variants?id=${encodeURIComponent(editingId)}`);
        if (reloadRes.ok) {
          const reloadJson = await reloadRes.json();
          const variant = reloadJson?.variant;
          if (variant) {
            setForm({
              item_id: variant.item_id ?? "",
              name: variant.name ?? "",
              sku: variant.sku ?? "",
              item_kind: variant.item_kind ?? "finished",
              consumption_uom: normalizeUomValue(variant.consumption_uom) || "pc",
              units_per_pack: String(variant.units_per_purchase_pack ?? 1),
              cost: (variant.cost ?? 0).toString(),
              selling_price: (variant.selling_price ?? 0).toString(),
              image_url: variant.image_url ?? "",
              active: variant.active ?? true,
            });
          }
        }
      } else {
        resetForm();
      }
    } catch (error) {
      console.error(error);
      setResult({ ok: false, message: error instanceof Error ? error.message : "Failed to save variant" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={eb.pageCard}>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.fieldGrid}>
          <Select
            label="Parent product"
            hint="Pick the product this variant belongs to (must have variants enabled on the product)"
            value={form.item_id}
            onChange={(v) => handleChange("item_id", v)}
            options={[
              { value: "", label: "Select parent product" },
              ...parentOptions.map((item) => ({
                value: item.id,
                label: item.sku ? `${item.name} (${item.sku})` : item.name,
              })),
            ]}
            required
          />
          <Field
            label="Sku"
            hint={skuHint}
            value={form.sku}
            onChange={(v) => handleChange("sku", v)}
            placeholder={usesAutoSku && suggestedSku ? suggestedSku : undefined}
            maxLength={form.item_kind === "finished" ? 3 : undefined}
            inputMode={form.item_kind === "finished" ? "numeric" : undefined}
          />
          <Field
            label="Variant name"
            hint="Example: Heineken, Large size, 500ml bottle"
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
            hint="Single unit for outlet orders (e.g. g, pc, plastic)"
            value={form.consumption_uom}
            onChange={(v) => handleChange("consumption_uom", v)}
            options={uomOptions}
          />
          {isPackConsumptionUom(form.consumption_uom) ? (
            <Field
              type="number"
              label={packUnitsLabel(form.consumption_uom)}
              hint="Pieces inside one pack when ordering in pack units"
              value={form.units_per_pack}
              onChange={(v) => handleChange("units_per_pack", v)}
              step="1"
              min="1"
            />
          ) : null}
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
            label="Active"
            hint="Keep checked so teams can use it"
            checked={form.active}
            onChange={(checked) => handleChange("active", checked)}
          />
        </div>

        {result ? (
          <p className={`${styles.callout} ${result.ok ? styles.calloutSuccess : styles.calloutError}`}>
            {result.message}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button type="button" onClick={resetForm} className={eb.btnSecondary}>
            Clear form
          </button>
          <button type="submit" className={eb.btnAdd} disabled={saving || readOnly}>
            {readOnly ? "Read-only" : saving ? "Saving..." : "Save variant"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function CatalogVariantsPageWrapper() {
  return (
    <Suspense
      fallback={
        <section className={eb.pageCard}>
          <p className={eb.pageCardBody}>Loading…</p>
        </section>
      }
    >
      <VariantFormPage />
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
  placeholder?: string;
  maxLength?: number;
  inputMode?: "numeric" | "text";
};

function Field({
  label,
  hint,
  value,
  onChange,
  required,
  type = "text",
  step,
  min,
  disabled,
  placeholder,
  maxLength,
  inputMode,
}: FieldProps) {
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
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
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
        className={styles.select}
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
