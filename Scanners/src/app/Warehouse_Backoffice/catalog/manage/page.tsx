"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import styles from "./manage.module.css";

type Item = { id: string; name: string; sku?: string | null; supplier_sku?: string | null; item_kind?: string | null; has_variations?: boolean | null };

type Alert = { ok: boolean; text: string } | null;

const PRODUCT_DEFAULTS = {
  consumption_unit: "each",
  consumption_qty_per_base: 1,
  storage_unit: null as string | null,
  storage_weight: null as number | null,
  has_recipe: false,
  outlet_order_visible: true,
  image_url: "",
  default_warehouse_id: null as string | null,
  active: true,
};

const VARIANT_DEFAULTS = {
  consumption_uom: "each",
  purchase_pack_unit: "each",
  units_per_purchase_pack: 1,
  purchase_unit_mass: null as number | null,
  transfer_quantity: 1,
  default_warehouse_id: null as string | null,
  active: true,
};

export default function CatalogManagePage() {
  const router = useRouter();
  const { status, readOnly } = useWarehouseAuth();

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Product quick-add
  const [productName, setProductName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [productSupplierSku, setProductSupplierSku] = useState("");
  const [productKind, setProductKind] = useState<"finished" | "ingredient" | "raw">("finished");
  const [productCost, setProductCost] = useState("0");
  const [productHasVars, setProductHasVars] = useState(false);
  const [productSaving, setProductSaving] = useState(false);
  const [productAlert, setProductAlert] = useState<Alert>(null);

  // Variant quick-add
  const [variantItemId, setVariantItemId] = useState("");
  const [variantName, setVariantName] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [variantSupplierSku, setVariantSupplierSku] = useState("");
  const [variantCost, setVariantCost] = useState("0");
  const [variantSaving, setVariantSaving] = useState(false);
  const [variantAlert, setVariantAlert] = useState<Alert>(null);

  useEffect(() => {
    if (status !== "ok") return;
    async function loadItems() {
      setLoadingItems(true);
      try {
        const res = await fetch("/api/catalog/items");
        if (!res.ok) throw new Error("Failed to load products");
        const json = await res.json();
        const list: Item[] = Array.isArray(json.items) ? json.items : [];
        setItems(list);
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingItems(false);
      }
    }
    loadItems();
  }, [status]);

  const quickCreateProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) {
      setProductAlert({ ok: false, text: "Read-only access: saving is disabled." });
      return;
    }
    if (!productName.trim()) {
      setProductAlert({ ok: false, text: "Name is required" });
      return;
    }
    setProductSaving(true);
    setProductAlert(null);
    try {
      const payload = {
        name: productName.trim(),
        sku: productSku.trim(),
        supplier_sku: productSupplierSku.trim(),
        item_kind: productKind,
        cost: Number(productCost) || 0,
        has_variations: productHasVars,
        ...PRODUCT_DEFAULTS,
      };
      const res = await fetch("/api/catalog/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not save product");
      }
      setProductAlert({ ok: true, text: "Product saved" });
      setProductName("");
      setProductSku("");
      setProductSupplierSku("");
      setProductCost("0");
      setProductHasVars(false);
      setLoadingItems(true);
      const refreshed = await fetch("/api/catalog/items");
      if (refreshed.ok) {
        const json = await refreshed.json();
        setItems(Array.isArray(json.items) ? json.items : []);
      }
    } catch (error) {
      console.error(error);
      setProductAlert({ ok: false, text: error instanceof Error ? error.message : "Failed to save" });
    } finally {
      setProductSaving(false);
      setLoadingItems(false);
    }
  };

  const quickCreateVariant = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) {
      setVariantAlert({ ok: false, text: "Read-only access: saving is disabled." });
      return;
    }
    if (!variantItemId) {
      setVariantAlert({ ok: false, text: "Choose a product" });
      return;
    }
    if (!variantName.trim()) {
      setVariantAlert({ ok: false, text: "Variant name is required" });
      return;
    }
    setVariantSaving(true);
    setVariantAlert(null);
    try {
      const payload = {
        item_id: variantItemId,
        name: variantName.trim(),
        sku: variantSku.trim(),
        supplier_sku: variantSupplierSku.trim(),
        cost: Number(variantCost) || 0,
        ...VARIANT_DEFAULTS,
      };
      const res = await fetch("/api/catalog/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not save variant");
      }
      setVariantAlert({ ok: true, text: "Variant saved" });
      setVariantName("");
      setVariantSku("");
      setVariantSupplierSku("");
      setVariantCost("0");
    } catch (error) {
      console.error(error);
      setVariantAlert({ ok: false, text: error instanceof Error ? error.message : "Failed to save" });
    } finally {
      setVariantSaving(false);
    }
  };

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>Catalog</p>
            <h1 className={styles.title}>Manage products & variants</h1>
            <p className={styles.subtitle}>
              Quick-create products and variants on one page.
            </p>
          </div>
          <div className={styles.headerButtons}>
            <button className={styles.backButton} onClick={() => router.back()}>Back</button>
            <button className={styles.backButton} onClick={() => router.push("/Warehouse_Backoffice")}>Back to dashboard</button>
          </div>
        </header>

        <div className={styles.grid}>
          <section className={styles.panel}>
            <h2 className={styles.panelHeader}>Add product</h2>
            <p className={styles.panelBody}>Create a catalog item; defaults keep units simple.</p>
            <form onSubmit={quickCreateProduct} className={styles.fieldGrid}>
              <label className={styles.label}>
                Name
                <input className={styles.input} value={productName} onChange={(e) => setProductName(e.target.value)} required />
              </label>
              <label className={styles.label}>
                Internal SKU
                <input className={styles.input} value={productSku} onChange={(e) => setProductSku(e.target.value)} />
              </label>
              <label className={styles.label}>
                Supplier SKU
                <input
                  className={styles.input}
                  value={productSupplierSku}
                  onChange={(e) => setProductSupplierSku(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Type
                <select
                  className={styles.select}
                  value={productKind}
                  onChange={(e) => setProductKind(e.target.value as "finished" | "ingredient" | "raw")}
                >
                  <option value="finished">Finished</option>
                  <option value="ingredient">Ingredient</option>
                  <option value="raw">Raw</option>
                </select>
              </label>
              <label className={styles.label}>
                Cost
                <input className={styles.input} type="number" step="0.01" value={productCost} onChange={(e) => setProductCost(e.target.value)} />
              </label>
              <label className={styles.label}>
                Allow variants
                <select className={styles.select} value={productHasVars ? "yes" : "no"} onChange={(e) => setProductHasVars(e.target.value === "yes")}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              <div className={styles.actions}>
                <button type="submit" className={styles.primaryButton} disabled={productSaving || readOnly}>
                  {readOnly ? "Read-only" : productSaving ? "Saving..." : "Save product"}
                </button>
              </div>
            </form>
            {productAlert && (
              <div className={`${styles.callout} ${productAlert.ok ? styles.calloutSuccess : styles.calloutError}`}>
                {productAlert.text}
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelHeader}>Add variant</h2>
            <p className={styles.panelBody}>Attach to an existing product.</p>
            <form onSubmit={quickCreateVariant} className={styles.fieldGrid}>
              <label className={styles.label}>
                Parent product
                <select
                  className={styles.select}
                  value={variantItemId}
                  onChange={(e) => setVariantItemId(e.target.value)}
                  required
                  disabled={loadingItems || items.length === 0}
                >
                  <option value="">Select product…</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Variant name
                <input className={styles.input} value={variantName} onChange={(e) => setVariantName(e.target.value)} required />
              </label>
              <label className={styles.label}>
                Internal SKU
                <input className={styles.input} value={variantSku} onChange={(e) => setVariantSku(e.target.value)} />
              </label>
              <label className={styles.label}>
                Supplier SKU
                <input
                  className={styles.input}
                  value={variantSupplierSku}
                  onChange={(e) => setVariantSupplierSku(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Cost
                <input className={styles.input} type="number" step="0.01" value={variantCost} onChange={(e) => setVariantCost(e.target.value)} />
              </label>
              <div className={styles.actions}>
                <button type="submit" className={styles.primaryButton} disabled={variantSaving || readOnly}>
                  {readOnly ? "Read-only" : variantSaving ? "Saving..." : "Save variant"}
                </button>
              </div>
            </form>
            {variantAlert && (
              <div className={`${styles.callout} ${variantAlert.ok ? styles.calloutSuccess : styles.calloutError}`}>
                {variantAlert.text}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
button { background: none; border: none; }
button:hover { transform: translateY(-1px); }
input, select, button { font-family: inherit; }
`;
