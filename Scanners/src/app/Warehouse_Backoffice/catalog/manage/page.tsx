"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import styles from "./manage.module.css";

type Item = { id: string; name: string; sku?: string | null; supplier_sku?: string | null; item_kind?: string | null; has_variations?: boolean | null };

type Alert = { ok: boolean; text: string } | null;

const qtyUnitOptions = [
  { value: "each", label: "Each" },
  { value: "g", label: "Gram(s)" },
  { value: "kg", label: "Kilogram(s)" },
  { value: "mg", label: "Milligram(s)" },
  { value: "ml", label: "Millilitre(s)" },
  { value: "l", label: "Litre(s)" },
  { value: "case", label: "Case(s)" },
  { value: "crate", label: "Crate(s)" },
  { value: "bottle", label: "Bottle(s)" },
  { value: "Tin Can", label: "Tin Can(s)" },
  { value: "Jar", label: "Jar(s)" },
  { value: "plastic", label: "Plastic(s)" },
  { value: "Packet", label: "Packet(s)" },
  { value: "Box", label: "Box(es)" },
];

export default function CatalogManagePage() {
  const router = useRouter();
  const { status, readOnly } = useWarehouseAuth();

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string | null }[]>([]);

  // Product quick-add
  const [productName, setProductName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [productSupplierSku, setProductSupplierSku] = useState("");
  const [productKind, setProductKind] = useState<"finished" | "ingredient" | "raw">("finished");
  const [productCost, setProductCost] = useState("0");
  const [productSellingPrice, setProductSellingPrice] = useState("0");
  const [productConsumptionUnit, setProductConsumptionUnit] = useState("each");
  const [productPurchasePackUnit, setProductPurchasePackUnit] = useState("each");
  const [productUnitsPerPurchasePack, setProductUnitsPerPurchasePack] = useState("1");
  const [productTransferUnit, setProductTransferUnit] = useState("each");
  const [productTransferQuantity, setProductTransferQuantity] = useState("1");
  const [productConsumptionQtyPerBase, setProductConsumptionQtyPerBase] = useState("1");
  const [productQtyDecimalPlaces, setProductQtyDecimalPlaces] = useState("0");
  const [productStocktakeUom, setProductStocktakeUom] = useState("");
  const [productStorageUnit, setProductStorageUnit] = useState("");
  const [productStorageWeight, setProductStorageWeight] = useState("");
  const [productStorageHomeId, setProductStorageHomeId] = useState("");
  const [productHasRecipe, setProductHasRecipe] = useState(false);
  const [productOutletOrderVisible, setProductOutletOrderVisible] = useState(true);
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productActive, setProductActive] = useState(true);
  const [productHasVars, setProductHasVars] = useState(false);
  const [productSaving, setProductSaving] = useState(false);
  const [productAlert, setProductAlert] = useState<Alert>(null);

  // Variant quick-add
  const [variantItemId, setVariantItemId] = useState("");
  const [variantName, setVariantName] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [variantSupplierSku, setVariantSupplierSku] = useState("");
  const [variantItemKind, setVariantItemKind] = useState("finished");
  const [variantConsumptionUom, setVariantConsumptionUom] = useState("each");
  const [variantStocktakeUom, setVariantStocktakeUom] = useState("");
  const [variantQtyDecimalPlaces, setVariantQtyDecimalPlaces] = useState("0");
  const [variantPurchasePackUnit, setVariantPurchasePackUnit] = useState("each");
  const [variantUnitsPerPurchasePack, setVariantUnitsPerPurchasePack] = useState("1");
  const [variantPurchaseUnitMass, setVariantPurchaseUnitMass] = useState("");
  const [variantPurchaseUnitMassUom, setVariantPurchaseUnitMassUom] = useState("kg");
  const [variantTransferUnit, setVariantTransferUnit] = useState("each");
  const [variantTransferQuantity, setVariantTransferQuantity] = useState("1");
  const [variantCost, setVariantCost] = useState("0");
  const [variantSellingPrice, setVariantSellingPrice] = useState("0");
  const [variantOutletOrderVisible, setVariantOutletOrderVisible] = useState(true);
  const [variantImageUrl, setVariantImageUrl] = useState("");
  const [variantStorageHomeId, setVariantStorageHomeId] = useState("");
  const [variantActive, setVariantActive] = useState(true);
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

  useEffect(() => {
    if (status !== "ok") return;
    async function loadWarehouses() {
      try {
        const res = await fetch("/api/warehouses");
        if (!res.ok) throw new Error("Failed to load warehouses");
        const json = await res.json().catch(() => ({}));
        const rows = Array.isArray(json) ? json : json.warehouses ?? json.data ?? [];
        setWarehouses(rows.map((row: { id: string; name?: string | null }) => ({ id: row.id, name: row.name ?? null })));
      } catch (error) {
        console.error(error);
      }
    }
    loadWarehouses();
  }, [status]);

  const toNumber = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

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
        supplier_sku: productHasVars ? null : productSupplierSku.trim() || null,
        item_kind: productKind,
        consumption_unit: productConsumptionUnit,
        purchase_pack_unit: productPurchasePackUnit || productStorageUnit || productConsumptionUnit,
        units_per_purchase_pack: toNumber(productUnitsPerPurchasePack, 1),
        transfer_unit: productTransferUnit || productConsumptionUnit,
        transfer_quantity: toNumber(productTransferQuantity, 1),
        consumption_qty_per_base: toNumber(productConsumptionQtyPerBase, 1),
        qty_decimal_places: Math.max(0, Math.min(6, Math.round(toNumber(productQtyDecimalPlaces, 0)))),
        stocktake_uom: productStocktakeUom || null,
        storage_unit: productStorageUnit || null,
        storage_weight: productStorageWeight.trim() === "" ? null : toNumber(productStorageWeight, 0),
        storage_home_id: productStorageHomeId || null,
        cost: toNumber(productCost, 0),
        selling_price: toNumber(productSellingPrice, 0),
        has_variations: productHasVars,
        has_recipe: productHasRecipe,
        outlet_order_visible: productOutletOrderVisible,
        image_url: productImageUrl.trim(),
        active: productActive,
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
      setProductSellingPrice("0");
      setProductConsumptionUnit("each");
      setProductPurchasePackUnit("each");
      setProductUnitsPerPurchasePack("1");
      setProductTransferUnit("each");
      setProductTransferQuantity("1");
      setProductConsumptionQtyPerBase("1");
      setProductQtyDecimalPlaces("0");
      setProductStocktakeUom("");
      setProductStorageUnit("");
      setProductStorageWeight("");
      setProductStorageHomeId("");
      setProductHasRecipe(false);
      setProductOutletOrderVisible(true);
      setProductImageUrl("");
      setProductActive(true);
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
        item_kind: variantItemKind,
        consumption_uom: variantConsumptionUom,
        stocktake_uom: variantStocktakeUom || null,
        qty_decimal_places: Math.max(0, Math.min(6, Math.round(toNumber(variantQtyDecimalPlaces, 0)))),
        purchase_pack_unit: variantPurchasePackUnit,
        units_per_purchase_pack: toNumber(variantUnitsPerPurchasePack, 1),
        purchase_unit_mass: variantPurchaseUnitMass.trim() === "" ? null : toNumber(variantPurchaseUnitMass, 0),
        purchase_unit_mass_uom: variantPurchaseUnitMassUom,
        transfer_unit: variantTransferUnit,
        transfer_quantity: toNumber(variantTransferQuantity, 1),
        cost: toNumber(variantCost, 0),
        selling_price: toNumber(variantSellingPrice, 0),
        outlet_order_visible: variantOutletOrderVisible,
        image_url: variantImageUrl.trim(),
        default_warehouse_id: variantStorageHomeId || null,
        active: variantActive,
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
      setVariantItemKind("finished");
      setVariantConsumptionUom("each");
      setVariantStocktakeUom("");
      setVariantQtyDecimalPlaces("0");
      setVariantPurchasePackUnit("each");
      setVariantUnitsPerPurchasePack("1");
      setVariantPurchaseUnitMass("");
      setVariantPurchaseUnitMassUom("kg");
      setVariantTransferUnit("each");
      setVariantTransferQuantity("1");
      setVariantSellingPrice("0");
      setVariantOutletOrderVisible(true);
      setVariantImageUrl("");
      setVariantStorageHomeId("");
      setVariantActive(true);
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
            <p className={styles.panelBody}>Create a catalog item; configure the same fields as the edit screen.</p>
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
                  disabled={productHasVars}
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
                Unit (stock + consumption)
                <select className={styles.select} value={productConsumptionUnit} onChange={(e) => setProductConsumptionUnit(e.target.value)}>
                  {qtyUnitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Stocktake unit
                <select className={styles.select} value={productStocktakeUom} onChange={(e) => setProductStocktakeUom(e.target.value)}>
                  <option value="">Use consumption unit</option>
                  {qtyUnitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Supplier pack unit
                <select className={styles.select} value={productPurchasePackUnit} onChange={(e) => setProductPurchasePackUnit(e.target.value)}>
                  {qtyUnitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Units inside one supplier pack
                <input
                  className={styles.input}
                  type="number"
                  step="1"
                  min="1"
                  value={productUnitsPerPurchasePack}
                  onChange={(e) => setProductUnitsPerPurchasePack(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Transfer unit
                <select className={styles.select} value={productTransferUnit} onChange={(e) => setProductTransferUnit(e.target.value)}>
                  {qtyUnitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Quantity per transfer line
                <input
                  className={styles.input}
                  type="number"
                  step="1"
                  min="1"
                  value={productTransferQuantity}
                  onChange={(e) => setProductTransferQuantity(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Consumption qty per base unit
                <input
                  className={styles.input}
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={productConsumptionQtyPerBase}
                  onChange={(e) => setProductConsumptionQtyPerBase(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Quantity decimal places
                <input
                  className={styles.input}
                  type="number"
                  step="1"
                  min="0"
                  value={productQtyDecimalPlaces}
                  onChange={(e) => setProductQtyDecimalPlaces(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Storage unit
                <select className={styles.select} value={productStorageUnit} onChange={(e) => setProductStorageUnit(e.target.value)}>
                  <option value="">Not set</option>
                  {qtyUnitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Storage qty
                <input
                  className={styles.input}
                  type="number"
                  step="0.01"
                  min="0"
                  value={productStorageWeight}
                  onChange={(e) => setProductStorageWeight(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Storage home
                <select className={styles.select} value={productStorageHomeId} onChange={(e) => setProductStorageHomeId(e.target.value)}>
                  <option value="">Select storage home</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name ?? warehouse.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Cost per base unit
                <input className={styles.input} type="number" step="0.01" value={productCost} onChange={(e) => setProductCost(e.target.value)} />
              </label>
              <label className={styles.label}>
                Selling price
                <input className={styles.input} type="number" step="0.01" value={productSellingPrice} onChange={(e) => setProductSellingPrice(e.target.value)} />
              </label>
              <label className={styles.label}>
                Allow variants
                <select
                  className={styles.select}
                  value={productHasVars ? "yes" : "no"}
                  onChange={(e) => {
                    const next = e.target.value === "yes";
                    setProductHasVars(next);
                    if (next) setProductSupplierSku("");
                  }}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              <label className={styles.label}>
                Has recipe
                <select
                  className={styles.select}
                  value={productHasRecipe ? "yes" : "no"}
                  onChange={(e) => setProductHasRecipe(e.target.value === "yes")}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              <label className={styles.label}>
                Show in outlet orders
                <select
                  className={styles.select}
                  value={productOutletOrderVisible ? "yes" : "no"}
                  onChange={(e) => setProductOutletOrderVisible(e.target.value === "yes")}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className={styles.label}>
                Active
                <select className={styles.select} value={productActive ? "yes" : "no"} onChange={(e) => setProductActive(e.target.value === "yes")}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className={styles.label}>
                Image URL
                <input className={styles.input} value={productImageUrl} onChange={(e) => setProductImageUrl(e.target.value)} />
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
            <p className={styles.panelBody}>Attach to an existing product with the full variant fields.</p>
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
                Stock kind
                <select className={styles.select} value={variantItemKind} onChange={(e) => setVariantItemKind(e.target.value)}>
                  <option value="finished">Finished</option>
                  <option value="ingredient">Ingredient</option>
                  <option value="raw">Raw</option>
                </select>
              </label>
              <label className={styles.label}>
                Consumption unit
                <select className={styles.select} value={variantConsumptionUom} onChange={(e) => setVariantConsumptionUom(e.target.value)}>
                  {qtyUnitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Stocktake unit
                <select className={styles.select} value={variantStocktakeUom} onChange={(e) => setVariantStocktakeUom(e.target.value)}>
                  <option value="">Use consumption unit</option>
                  {qtyUnitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Quantity decimal places
                <input
                  className={styles.input}
                  type="number"
                  step="1"
                  min="0"
                  value={variantQtyDecimalPlaces}
                  onChange={(e) => setVariantQtyDecimalPlaces(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Supplier pack unit
                <select className={styles.select} value={variantPurchasePackUnit} onChange={(e) => setVariantPurchasePackUnit(e.target.value)}>
                  {qtyUnitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Units inside one supplier pack
                <input
                  className={styles.input}
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={variantUnitsPerPurchasePack}
                  onChange={(e) => setVariantUnitsPerPurchasePack(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Weight/volume per purchase unit
                <input
                  className={styles.input}
                  type="number"
                  step="0.01"
                  min="0"
                  value={variantPurchaseUnitMass}
                  onChange={(e) => setVariantPurchaseUnitMass(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Mass/volume unit
                <select className={styles.select} value={variantPurchaseUnitMassUom} onChange={(e) => setVariantPurchaseUnitMassUom(e.target.value)}>
                  {qtyUnitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Transfer unit
                <select className={styles.select} value={variantTransferUnit} onChange={(e) => setVariantTransferUnit(e.target.value)}>
                  {qtyUnitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Quantity per transfer line
                <input
                  className={styles.input}
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={variantTransferQuantity}
                  onChange={(e) => setVariantTransferQuantity(e.target.value)}
                />
              </label>
              <label className={styles.label}>
                Cost per base unit
                <input className={styles.input} type="number" step="0.01" value={variantCost} onChange={(e) => setVariantCost(e.target.value)} />
              </label>
              <label className={styles.label}>
                Selling price
                <input className={styles.input} type="number" step="0.01" value={variantSellingPrice} onChange={(e) => setVariantSellingPrice(e.target.value)} />
              </label>
              <label className={styles.label}>
                Show in outlet orders
                <select
                  className={styles.select}
                  value={variantOutletOrderVisible ? "yes" : "no"}
                  onChange={(e) => setVariantOutletOrderVisible(e.target.value === "yes")}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className={styles.label}>
                Active
                <select className={styles.select} value={variantActive ? "yes" : "no"} onChange={(e) => setVariantActive(e.target.value === "yes")}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className={styles.label}>
                Image URL
                <input className={styles.input} value={variantImageUrl} onChange={(e) => setVariantImageUrl(e.target.value)} />
              </label>
              <label className={styles.label}>
                Storage home
                <select className={styles.select} value={variantStorageHomeId} onChange={(e) => setVariantStorageHomeId(e.target.value)}>
                  <option value="">Select storage home</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name ?? warehouse.id}
                    </option>
                  ))}
                </select>
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
