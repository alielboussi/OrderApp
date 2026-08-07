"use client";

import { useEffect, useMemo, useState, FormEvent, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import { logWarehouseAction } from "../../logging";
import { WAREHOUSE_AUDIT_ACTIONS } from "@/lib/warehouse-audit";
import { catalogApiHeaders } from "@/lib/catalog-api-headers";
import { mapCatalogUomFieldsFromRow, mergeCatalogUomOptionsForStored, parseCatalogUomInput } from "@/lib/catalog-uom-fields";
import { useUomOptions } from "@/lib/use-uom-options";
import { POS_NUMERIC_SKU_MAX, parsePosNumericSku } from "@/lib/pos-catalog-ids";
import eb from "../../enterprise.module.css";
import styles from "./product.module.css";
import { CatalogImageField } from "../CatalogImageField";
import { resolvePosMenuGroupId } from "@/lib/menu-group-pos";

const itemKinds = [
  { value: "finished", label: "Finished (ready to sell)" },
  { value: "ingredient", label: "Ingredient (used in production)" },
  { value: "raw", label: "Raw (unprocessed material)" },
];

type FormState = {
  name: string;
  sku: string;
  item_kind: "finished" | "ingredient" | "raw";
  units_per_pack: string;
  cost: string;
  selling_price: string;
  orders_app_uom: string;
  supervisor_uom: string;
  orders_app_cost_price: string;
  supervisor_uom_qty_per_unit: string;
  uom_weight_enabled: boolean;
  uom_weight_grams: string;
  has_variations: boolean;
  image_url: string;
  active: boolean;
  menu_group_id: string;
};

const defaultForm: FormState = {
  name: "",
  sku: "",
  item_kind: "finished",
  units_per_pack: "1",
  cost: "0",
  selling_price: "0",
  orders_app_uom: "",
  supervisor_uom: "",
  orders_app_cost_price: "0",
  supervisor_uom_qty_per_unit: "1",
  uom_weight_enabled: false,
  uom_weight_grams: "",
  has_variations: false,
  image_url: "",
  active: true,
  menu_group_id: "",
};


function mapItemToForm(
  item: Record<string, unknown>,
  menuGroupId: string,
  uomOptions: { value: string; label: string }[],
): FormState {
  const uoms = mapCatalogUomFieldsFromRow(item, uomOptions);

  return {
    name: String(item.name ?? ""),
    sku: String(item.sku ?? ""),
    item_kind: (item.item_kind as FormState["item_kind"]) ?? "finished",
    units_per_pack: String(item.units_per_purchase_pack ?? 1),
    cost: String(item.cost ?? 0),
    selling_price: String(item.selling_price ?? 0),
    orders_app_uom: uoms.orders_app_uom,
    supervisor_uom: uoms.supervisor_uom,
    orders_app_cost_price: String(item.orders_app_cost_price ?? item.selling_price ?? 0),
    supervisor_uom_qty_per_unit: String(item.supervisor_uom_qty_per_unit ?? 1),
    uom_weight_enabled: item.uom_weight_enabled === true || item.uomWeightEnabled === true,
    uom_weight_grams: (() => {
      const raw = item.uom_weight_grams ?? item.uomWeightGrams;
      return raw == null || raw === "" ? "" : String(raw);
    })(),
    has_variations: Boolean(item.has_variations),
    image_url: String(item.image_url ?? ""),
    active: item.active !== false,
    menu_group_id: menuGroupId,
  };
}

async function resolveMenuGroupIdForForm(storedId: string | null | undefined): Promise<string> {
  const trimmed = storedId?.trim() ?? "";
  if (!trimmed) return "";
  if (/^\d+$/.test(trimmed)) return trimmed;

  try {
    const res = await fetch(`/api/catalog/menu-groups?id=${encodeURIComponent(trimmed)}`);
    if (!res.ok) return "";
    const json = (await res.json()) as { group?: Record<string, unknown> };
    const posId = json.group ? resolvePosMenuGroupId(json.group) : null;
    return posId != null ? String(posId) : "";
  } catch {
    return "";
  }
}

function ProductCreatePage() {
  const searchParams = useSearchParams();
  const { status, readOnly, userId, userEmail } = useWarehouseAuth();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [loadedItem, setLoadedItem] = useState<Record<string, unknown> | null>(null);
  const [loadedMenuGroupId, setLoadedMenuGroupId] = useState("");
  const [loadingItem, setLoadingItem] = useState(false);
  const [menuGroups, setMenuGroups] = useState<{ id: string; name: string }[]>([]);
  const [suggestedSku, setSuggestedSku] = useState("");
  const [skuManual, setSkuManual] = useState(false);
  const { uoms: uomOptions, ready: uomOptionsReady } = useUomOptions();
  const formUomOptions = useMemo(
    () => mergeCatalogUomOptionsForStored(uomOptions, form.orders_app_uom, form.supervisor_uom),
    [uomOptions, form.orders_app_uom, form.supervisor_uom],
  );

  const editingId = searchParams?.get("id")?.trim() || "";

  const fetchNextPosSku = useCallback(async () => {
    try {
      const res = await fetch("/api/catalog/next-pos-ids");
      if (!res.ok) return;
      const json = await res.json();
      if (typeof json.next_item_sku === "string") {
        setSuggestedSku(json.next_item_sku);
      }
    } catch (error) {
      console.error("Failed to load next POS item SKU", error);
    }
  }, []);

  const vatExcludedPrice = useMemo(() => {
    const parsed = Number(form.selling_price);
    if (!Number.isFinite(parsed) || parsed <= 0) return "";
    return (parsed / 1.16).toFixed(2);
  }, [form.selling_price]);

  useEffect(() => {
    async function loadMenuGroups() {
      try {
        const res = await fetch("/api/catalog/menu-groups?mintpos_only=true");
        if (!res.ok) return;
        const json = await res.json();
        const rows = Array.isArray(json.groups) ? json.groups : [];
        setMenuGroups(
          rows.map((group: { id: string; name: string }) => ({
            id: group.id,
            name: group.name,
          })),
        );
      } catch (error) {
        console.error("Failed to load menu groups", error);
      }
    }
    if (status === "ok") loadMenuGroups();
  }, [status]);

  useEffect(() => {
    if (status !== "ok" || editingId || form.item_kind !== "finished") return;
    void fetchNextPosSku();
  }, [status, editingId, form.item_kind, fetchNextPosSku]);

  useEffect(() => {
    async function loadItem(id: string) {
      if (!id) return;
      setLoadingItem(true);
      try {
        const res = await fetch(`/api/catalog/items?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("Failed to load product");
        const json = await res.json();
        if (json?.item) {
          const item = json.item as Record<string, unknown>;
          const menuGroupId = await resolveMenuGroupIdForForm(
            typeof item.menu_group_id === "string" ? item.menu_group_id : "",
          );
          setLoadedItem(item);
          setLoadedMenuGroupId(menuGroupId);
        }
      } catch (error) {
        console.error("product load failed", error);
        setResult({ ok: false, message: error instanceof Error ? error.message : "Failed to load product" });
      } finally {
        setLoadingItem(false);
      }
    }

    if (editingId) {
      setLoadedItem(null);
      setLoadedMenuGroupId("");
      void loadItem(editingId);
    } else {
      setLoadedItem(null);
      setLoadedMenuGroupId("");
    }
  }, [editingId]);

  useEffect(() => {
    if (!editingId || !loadedItem || !uomOptionsReady) return;
    setForm({ ...defaultForm, ...mapItemToForm(loadedItem, loadedMenuGroupId, uomOptions) });
  }, [editingId, loadedItem, loadedMenuGroupId, uomOptions, uomOptionsReady]);

  const handleChange = (key: keyof FormState, value: string | boolean) => {
    if (key === "sku" && typeof value === "string") {
      setSkuManual(true);
    }
    setForm((prev) => {
      if (key === "has_variations") {
        return { ...prev, has_variations: Boolean(value) };
      }
      return { ...prev, [key]: value };
    });
  };

  const usesAutoSku =
    !editingId && form.item_kind === "finished" && !skuManual && !form.sku.trim();
  const skuHint = usesAutoSku
    ? suggestedSku
      ? `Auto-assigned on save (next available ID: ${suggestedSku})`
      : "Auto-assigned on save when left blank"
    : form.item_kind === "finished"
      ? `MintPOS product ID (1-${POS_NUMERIC_SKU_MAX}) — leave blank to auto-assign`
      : "Optional internal SKU";

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
    if (form.item_kind === "finished" && form.sku.trim() && !parsePosNumericSku(form.sku)) {
      setResult({
        ok: false,
        message: `Product SKU must be a 1-3 digit number (1-${POS_NUMERIC_SKU_MAX}).`,
      });
      return;
    }
    if (!form.has_variations) {
      if (!uomOptionsReady || uomOptions.length === 0) {
        setResult({
          ok: false,
          message: "Add at least one active UOM in Catalog → UOMs before saving order units.",
        });
        setSaving(false);
        return;
      }
      if (!form.orders_app_uom || !form.supervisor_uom) {
        setResult({
          ok: false,
          message: "Select OrdersApp UOM and Supervisor UOM from Catalog → UOMs.",
        });
        setSaving(false);
        return;
      }
      if (form.uom_weight_enabled) {
        const grams = Number(form.uom_weight_grams);
        if (!Number.isFinite(grams) || grams <= 0) {
          setResult({
            ok: false,
            message: "Enter UOM Weight in grams when the toggle is enabled.",
          });
          setSaving(false);
          return;
        }
      }
    }
    setSaving(true);
    setResult(null);
    try {
      const payload = {
        name: form.name,
        sku: usesAutoSku ? "" : form.sku.trim(),
        supplier_sku: null,
        item_kind: form.item_kind,
        qty_decimal_places: 2,
        cost: toNumber(form.cost, 0),
        selling_price: toNumber(form.selling_price, 0),
        has_variations: form.has_variations,
        image_url: form.image_url,
        active: form.active,
        menu_group_id: form.item_kind === "finished" && form.menu_group_id ? form.menu_group_id : null,
        ...(form.has_variations
          ? {}
          : {
              units_per_purchase_pack: toNumber(form.units_per_pack, 1),
              orders_app_uom: parseCatalogUomInput(form.orders_app_uom, uomOptions, ""),
              supervisor_uom: parseCatalogUomInput(form.supervisor_uom, uomOptions, ""),
              supervisor_uom_qty_per_unit: toNumber(form.supervisor_uom_qty_per_unit, 1),
              orders_app_cost_price: toNumber(form.orders_app_cost_price, 0),
              uom_weight_enabled: form.uom_weight_enabled,
              uom_weight_grams: form.uom_weight_enabled ? toNumber(form.uom_weight_grams, 0) : null,
            }),
        ...(editingId ? { id: editingId } : {}),
      };

      const res = await fetch("/api/catalog/items", {
        method: editingId ? "PUT" : "POST",
        headers: catalogApiHeaders({ userId, userEmail }),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not create product");
      }

      const savedJson = await res.json().catch(() => ({}));
      const savedItem = (savedJson.item ?? savedJson) as Record<string, unknown> | null;
      const entityId = editingId ?? (typeof savedItem?.id === "string" ? savedItem.id : null);
      const entityName = form.name || (typeof savedItem?.name === "string" ? savedItem.name : "Product");
      const savedSku =
        (typeof savedItem?.sku === "string" ? savedItem.sku : null) ?? (form.sku || null);
      const page = "/Warehouse_Backoffice/catalog/product";

      if (editingId) {
        await logWarehouseAction({
          action: WAREHOUSE_AUDIT_ACTIONS.EDIT_PRODUCT_INFORMATION,
          page,
          method: "PUT",
          entity_type: "product",
          entity_id: entityId,
          entity_name: entityName,
          details: { sku: savedSku, item_kind: form.item_kind },
        });
      } else {
        await logWarehouseAction({
          action: WAREHOUSE_AUDIT_ACTIONS.ADD_PRODUCT,
          page,
          method: "POST",
          entity_type: "product",
          entity_id: entityId,
          entity_name: entityName,
          details: { sku: savedSku, item_kind: form.item_kind },
        });
        await logWarehouseAction({
          action: WAREHOUSE_AUDIT_ACTIONS.ADD_PRODUCT_INFORMATION,
          page,
          method: "POST",
          entity_type: "product",
          entity_id: entityId,
          entity_name: entityName,
          details: {
            sku: savedSku,
            item_kind: form.item_kind,
            menu_group_id: form.menu_group_id || null,
            has_variations: form.has_variations,
          },
        });
      }

      const successMessage = editingId ? "Product updated" : "Product saved";
      setResult({ ok: true, message: successMessage });

      if (editingId && savedItem) {
        const reloadedMenuGroupId = await resolveMenuGroupIdForForm(
          typeof savedItem.menu_group_id === "string" ? savedItem.menu_group_id : "",
        );
        setForm({ ...defaultForm, ...mapItemToForm(savedItem, reloadedMenuGroupId, uomOptions) });
      } else if (editingId) {
        const reloadRes = await fetch(`/api/catalog/items?id=${encodeURIComponent(editingId)}`);
        if (reloadRes.ok) {
          const reloadJson = await reloadRes.json();
          const item = reloadJson?.item;
          if (item) {
            const reloadedMenuGroupId = await resolveMenuGroupIdForForm(item.menu_group_id ?? "");
            setForm({ ...defaultForm, ...mapItemToForm(item, reloadedMenuGroupId, uomOptions) });
          }
        }
      } else {
        setForm(defaultForm);
        setSkuManual(false);
        setSuggestedSku("");
        void fetchNextPosSku();
      }
    } catch (error) {
      console.error(error);
      setResult({ ok: false, message: error instanceof Error ? error.message : "Failed to save product" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className={eb.pageCard}>
      <form className={styles.form} onSubmit={submit}>
          <div className={styles.fieldGrid}>
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
              label="Product name"
              hint="Friendly name staff will see"
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
            {form.item_kind === "finished" ? (
              <Select
                label="POS menu group"
                hint="Required for products to appear on MintPOS screens"
                value={form.menu_group_id}
                onChange={(v) => handleChange("menu_group_id", v)}
                required
                options={[
                  { value: "", label: "Select menu group" },
                  ...menuGroups.map((group) => ({ value: group.id, label: group.name })),
                ]}
              />
            ) : null}
            <CatalogImageField
              label="Image URL (optional)"
              hint="Link to product image"
              value={form.image_url}
              onChange={(v) => handleChange("image_url", v)}
              entityType="product"
              entityId={editingId || undefined}
              disabled={readOnly || saving}
            />
          </div>

          {!form.has_variations && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Orders App</h3>
                <p className={styles.sectionHint}>
                  UOM and price shown in the outlet Orders mobile app.
                </p>
              </div>
              <div className={styles.sectionGrid}>
                <Select
                  label="OrdersApp Uom"
                  hint="Unit of measure displayed when outlets order this product"
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
          )}

          {!form.has_variations && (
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
          )}

          {!form.has_variations && (
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
          )}

          <div className={styles.toggleRow}>
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
            <p className={`${styles.callout} ${result.ok ? styles.calloutSuccess : styles.calloutError}`}>
              {result.message}
            </p>
          )}

          <div className={styles.actions}>
            <button type="button" onClick={() => { setForm(defaultForm); setSkuManual(false); setSuggestedSku(""); void fetchNextPosSku(); }} className={eb.btnSecondary}>
              Clear form
            </button>
            <button type="submit" className={eb.btnAdd} disabled={saving || readOnly}>
              {readOnly ? "Read-only" : saving ? "Saving..." : "Save product"}
            </button>
          </div>
        </form>
      </section>
    </>
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
        checked={Boolean(checked)}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

