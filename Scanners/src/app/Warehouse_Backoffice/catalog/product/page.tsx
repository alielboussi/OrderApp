"use client";

import { useEffect, useMemo, useState, type CSSProperties, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";

const qtyUnits = ["each", "g", "kg", "mg", "ml", "l"] as const;
const itemKinds = [
  { value: "finished", label: "Finished (ready to sell)" },
  { value: "ingredient", label: "Ingredient (used in production)" },
];

type Warehouse = { id: string; name: string };

type FormState = {
  name: string;
  sku: string;
  item_kind: "finished" | "ingredient";
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
  locked_from_warehouse_id: string;
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
  locked_from_warehouse_id: "",
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
        locked_from_warehouse_id: form.locked_from_warehouse_id || null,
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

  const back = () => router.push("/Warehouse_Backoffice/catalog");

  return (
    <div style={styles.page}>
      <style>{globalStyles}</style>
      <main style={styles.shell}>
        <header style={styles.hero}>
          <div style={{ flex: 1 }}>
            <p style={styles.kicker}>Catalog</p>
            <h1 style={styles.title}>Create Product</h1>
            <p style={styles.subtitle}>
              Insert a new product into catalog_items. Labels below tell you exactly what to type (pack qty vs sent qty, etc.).
            </p>
          </div>
          <button onClick={back} style={styles.backButton}>
            Back
          </button>
        </header>

        <form style={styles.form} onSubmit={submit}>
          <div style={styles.fieldGrid}>
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
              hint="Finished = sellable; Ingredient = used inside recipes"
              value={form.item_kind}
              onChange={(v) => handleChange("item_kind", v)}
              options={itemKinds}
            />
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
            <Select
              label="Default warehouse"
              hint="Where this product normally lives"
              value={form.default_warehouse_id}
              onChange={(v) => handleChange("default_warehouse_id", v)}
              options={warehouseOptions.map((w) => ({ value: w.id, label: w.name }))}
            />
            <Select
              label="Lock ordering to warehouse"
              hint="If set, outlets will draw only from this warehouse"
              value={form.locked_from_warehouse_id}
              onChange={(v) => handleChange("locked_from_warehouse_id", v)}
              options={warehouseOptions.map((w) => ({ value: w.id, label: w.name }))}
            />
            <Field
              label="Image URL (optional)"
              hint="Link to product image"
              value={form.image_url}
              onChange={(v) => handleChange("image_url", v)}
            />
          </div>

          <div style={styles.toggleRow}>
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
            <div style={{ ...styles.callout, borderColor: result.ok ? "#22c55e" : "#f87171" }}>
              {result.message}
            </div>
          )}

          <div style={styles.actions}>
            <button type="button" onClick={() => setForm(defaultForm)} style={styles.secondaryButton}>
              Clear form
            </button>
            <button type="submit" style={styles.primaryButton} disabled={saving}>
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
};

function Field({ label, hint, value, onChange, required, type = "text", step, min }: FieldProps) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <small style={styles.hint}>{hint}</small>
      <input
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.input}
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
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <small style={styles.hint}>{hint}</small>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={styles.input} required={required}>
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
    <label style={styles.checkbox}>
      <div>
        <span style={styles.label}>{label}</span>
        <small style={styles.hint}>{hint}</small>
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at 20% 20%, #182647, #060b16 70%)",
    display: "flex",
    justifyContent: "center",
    padding: "40px 24px 60px",
    color: "#f4f6ff",
    fontFamily: '"Space Grotesk", "Segoe UI", system-ui, sans-serif',
  },
  shell: {
    width: "100%",
    maxWidth: 1200,
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  hero: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    borderRadius: 28,
    border: "1px solid rgba(255,255,255,0.1)",
    padding: 22,
    background: "rgba(6,11,22,0.78)",
    boxShadow: "0 28px 60px rgba(0,0,0,0.48)",
  },
  kicker: {
    margin: 0,
    fontSize: 13,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#8da2ff",
  },
  title: {
    margin: "8px 0 6px",
    fontSize: 38,
    letterSpacing: -0.4,
    fontWeight: 700,
  },
  subtitle: {
    margin: 0,
    color: "#c6d2ff",
    maxWidth: 640,
    lineHeight: 1.5,
    fontSize: 16,
  },
  backButton: {
    background: "transparent",
    color: "#f8fafc",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: 999,
    padding: "10px 18px",
    fontWeight: 600,
    letterSpacing: 1,
    cursor: "pointer",
  },
  form: {
    borderRadius: 22,
    border: "1px solid rgba(125,211,252,0.35)",
    background: "rgba(12,17,33,0.88)",
    padding: 22,
    boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 12,
    borderRadius: 16,
    border: "1.5px solid rgba(125,211,252,0.35)",
    background: "rgba(17,24,39,0.6)",
  },
  label: {
    fontSize: 14,
    fontWeight: 700,
    color: "#e2e8f0",
    letterSpacing: 0.3,
  },
  hint: {
    fontSize: 12,
    color: "#93c5fd",
  },
  input: {
    marginTop: 4,
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(34,197,94,0.7)",
    background: "#0c152b",
    color: "#f8fafc",
    padding: "12px 12px",
    fontSize: 15,
  },
  checkbox: {
    border: "1.5px solid rgba(34,197,94,0.7)",
    borderRadius: 14,
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    background: "rgba(17,24,39,0.6)",
  },
  toggleRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  },
  callout: {
    border: "1.5px solid",
    borderRadius: 14,
    padding: 12,
    background: "rgba(12,17,33,0.8)",
    color: "#f8fafc",
    fontWeight: 600,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    flexWrap: "wrap",
  },
  primaryButton: {
    background: "linear-gradient(90deg, #22c55e, #16a34a)",
    color: "#0b1020",
    border: "1px solid #22c55e",
    borderRadius: 14,
    padding: "12px 18px",
    fontWeight: 800,
    letterSpacing: 0.5,
    cursor: "pointer",
    minWidth: 150,
  },
  secondaryButton: {
    background: "transparent",
    color: "#f8fafc",
    border: "1px solid rgba(255,255,255,0.35)",
    borderRadius: 14,
    padding: "12px 18px",
    fontWeight: 700,
    letterSpacing: 0.5,
    cursor: "pointer",
    minWidth: 120,
  },
};

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
input, select, button { font-family: inherit; }
input:focus, select:focus { outline: 2px solid #22c55e; }
button:hover { transform: translateY(-1px); }
`;
