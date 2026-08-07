"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import { logWarehouseAction } from "../../logging";
import { WAREHOUSE_AUDIT_ACTIONS } from "@/lib/warehouse-audit";
import { catalogApiHeaders } from "@/lib/catalog-api-headers";
import { mapCatalogUomFieldsFromRow, mergeCatalogUomOptionsForStored, parseCatalogUomInput } from "@/lib/catalog-uom-fields";
import { useUomOptions } from "@/lib/use-uom-options";
import { POS_NUMERIC_SKU_MAX, isValidPosVariantMintSku } from "@/lib/pos-catalog-ids";
import eb from "../../enterprise.module.css";
import styles from "../product/product.module.css";
import { CatalogImageField } from "../CatalogImageField";

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
  orders_app_uom: string;
  supervisor_uom: string;
  orders_app_cost_price: string;
  supervisor_uom_qty_per_unit: string;
  uom_weight_enabled: boolean;
  uom_weight_grams: string;
  image_url: string;
  active: boolean;
};

const defaultForm: FormState = {
  item_id: "",
  name: "",
  sku: "",
  item_kind: "finished",
  consumption_uom: "",
  units_per_pack: "1",
  cost: "0",
  selling_price: "0",
  orders_app_uom: "",
  supervisor_uom: "",
  orders_app_cost_price: "0",
  supervisor_uom_qty_per_unit: "1",
  uom_weight_enabled: false,
  uom_weight_grams: "",
  image_url: "",
  active: true,
};

function mapVariantToForm(
  variant: Record<string, unknown>,
  options: { value: string; label: string }[],
  incomingItemId = "",
): FormState {
  const uoms = mapCatalogUomFieldsFromRow(variant, options);
  return {
    item_id: String(variant.item_id ?? incomingItemId ?? ""),
    name: String(variant.name ?? ""),
    sku: String(variant.sku ?? ""),
    item_kind: String(variant.item_kind ?? "finished"),
    consumption_uom: uoms.consumption_unit,
    units_per_pack: String(variant.units_per_purchase_pack ?? 1),
    cost: String(variant.cost ?? 0),
    selling_price: String(variant.selling_price ?? 0),
    orders_app_uom: uoms.orders_app_uom,
    supervisor_uom: uoms.supervisor_uom,
    orders_app_cost_price: String(variant.orders_app_cost_price ?? variant.selling_price ?? 0),
    supervisor_uom_qty_per_unit: String(variant.supervisor_uom_qty_per_unit ?? 1),
    uom_weight_enabled: variant.uom_weight_enabled === true,
    uom_weight_grams:
      variant.uom_weight_grams == null || variant.uom_weight_grams === ""
        ? ""
        : String(variant.uom_weight_grams),
    image_url: String(variant.image_url ?? ""),
    active: variant.active !== false,
  };
}

function VariantFormPage() {
  const searchParams = useSearchParams();
  const { status, readOnly, userId, userEmail } = useWarehouseAuth();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [loadedVariant, setLoadedVariant] = useState<Record<string, unknown> | null>(null);
  const [, setLoadingVariant] = useState(false);
  const [suggestedSku, setSuggestedSku] = useState("");
  const [skuManual, setSkuManual] = useState(false);
  const { uoms: uomOptions, ready: uomOptionsReady } = useUomOptions();
  const formUomOptions = useMemo(
    () => mergeCatalogUomOptionsForStored(uomOptions, form.orders_app_uom, form.supervisor_uom),
    [uomOptions, form.orders_app_uom, form.supervisor_uom],
  );

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
        const variant = json?.variant as Record<string, unknown> | undefined;
        if (!variant) return;
        setLoadedVariant(variant);
      } catch (error) {
        console.error("variant load failed", error);
        setResult({ ok: false, message: error instanceof Error ? error.message : "Failed to load variant" });
      } finally {
        setLoadingVariant(false);
      }
    }
    if (editingId) {
      setLoadedVariant(null);
      void loadVariant(editingId);
    } else {
      setLoadedVariant(null);
    }
  }, [editingId]);

  useEffect(() => {
    if (!editingId || !loadedVariant || !uomOptionsReady) return;
    setForm(mapVariantToForm(loadedVariant, uomOptions, incomingItemId));
  }, [editingId, loadedVariant, uomOptions, uomOptionsReady, incomingItemId]);

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
      ? `MintPOS variant SKU: 1-${POS_NUMERIC_SKU_MAX} or till barcode (4-20 digits)`
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
    if (form.item_kind === "finished" && form.sku.trim() && !isValidPosVariantMintSku(form.sku)) {
      setResult({
        ok: false,
        message: `Variant SKU must be a numeric MintPOS ID (1-${POS_NUMERIC_SKU_MAX}) or till barcode (4-20 digits).`,
      });
      return;
    }
    if (!uomOptionsReady || uomOptions.length === 0) {
      setResult({
        ok: false,
        message: "Add at least one active UOM in Catalog → UOMs before saving order units.",
      });
      return;
    }
    if (!form.orders_app_uom || !form.supervisor_uom) {
      setResult({
        ok: false,
        message: "Select OrdersApp UOM and Supervisor UOM from Catalog → UOMs.",
      });
      return;
    }
    if (form.uom_weight_enabled) {
      const grams = Number(form.uom_weight_grams);
      if (!Number.isFinite(grams) || grams <= 0) {
        setResult({
          ok: false,
          message: "Enter UOM Weight in grams when the toggle is enabled.",
        });
        return;
      }
    }
    setSaving(true);
    setResult(null);
    try {
      const payload = {
        item_id: form.item_id,
        name: form.name,
        sku: usesAutoSku ? "" : form.sku.trim(),
        item_kind: form.item_kind,
        units_per_purchase_pack: toNumber(form.units_per_pack, 1),
        qty_decimal_places: 2,
        cost: toNumber(form.cost, 0, -0.0001),
        selling_price: toNumber(form.selling_price, 0, -0.0001),
        orders_app_uom: parseCatalogUomInput(form.orders_app_uom, uomOptions, ""),
        supervisor_uom: parseCatalogUomInput(form.supervisor_uom, uomOptions, ""),
        supervisor_uom_qty_per_unit: toNumber(form.supervisor_uom_qty_per_unit, 1),
        orders_app_cost_price: toNumber(form.orders_app_cost_price, 0, -0.0001),
        uom_weight_enabled: form.uom_weight_enabled,
        uom_weight_grams: form.uom_weight_enabled ? toNumber(form.uom_weight_grams, 0) : null,
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
        const detailMessage =
          typeof json.details?.message === "string" ? json.details.message : null;
        throw new Error(json.error || detailMessage || "Could not save variant");
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
            setForm(mapVariantToForm(variant, uomOptions, incomingItemId));
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
          <CatalogImageField
            label="Image URL (optional)"
            hint="Link to variant image"
            value={form.image_url}
            onChange={(v) => handleChange("image_url", v)}
            entityType="variant"
            entityId={editingId || undefined}
            disabled={readOnly || saving}
          />
        </div>

        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Orders App</h3>
            <p className={styles.sectionHint}>UOM and price shown in the outlet Orders mobile app for this variant.</p>
          </div>
          <div className={styles.sectionGrid}>
            <Select
              label="OrdersApp Uom"
              hint="Unit of measure displayed when outlets order this variant"
              value={form.orders_app_uom}
              onChange={(v) => handleChange("orders_app_uom", v)}
              options={formUomOptions}
              disabled={!uomOptionsReady || formUomOptions.length === 0}
            />
            <Select
              label="Supervisor Uom"
              hint="Unit of measure shown on supervisor order screens and warehouse portal"
              value={form.supervisor_uom}
              onChange={(v) => handleChange("supervisor_uom", v)}
              options={formUomOptions}
              disabled={!uomOptionsReady || formUomOptions.length === 0}
            />
            <Field
              type="number"
              label="Outlet units in one supervisor unit"
              hint="Example: 25 means 25 outlet pieces = 1 supervisor tray"
              value={form.supervisor_uom_qty_per_unit}
              onChange={(v) => handleChange("supervisor_uom_qty_per_unit", v)}
              step="1"
              min="1"
            />
            <Field
              type="number"
              label="Orders app cost price"
              hint="Selling price shown in the Orders app review screen"
              value={form.orders_app_cost_price}
              onChange={(v) => handleChange("orders_app_cost_price", v)}
              step="0.01"
              min="0"
            />
          </div>
        </div>

        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>UOM Weight</h3>
            <p className={styles.sectionHint}>
              When enabled, the accepted-orders API reports total ordered weight in grams per outlet UOM unit.
            </p>
          </div>
          <div className={styles.sectionGrid}>
            <Checkbox
              label="Enable UOM Weight"
              hint="Use grams per outlet UOM for API total ordered (e.g. 2500g per packet)"
              checked={form.uom_weight_enabled}
              onChange={(checked) => handleChange("uom_weight_enabled", checked)}
            />
            <Field
              type="number"
              label="Weight per outlet UOM (grams)"
              hint="Grams in one OrdersApp UOM unit — only used when enabled"
              value={form.uom_weight_grams}
              onChange={(v) => handleChange("uom_weight_grams", v)}
              step="1"
              min="1"
              disabled={!form.uom_weight_enabled}
            />
          </div>
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
        value={value ?? ""}
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
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={styles.select}
        required={required}
        disabled={disabled}
      >
        <option value="">{options.length ? "Select from UOM catalog…" : "No UOMs — add in Catalog → UOMs"}</option>
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
