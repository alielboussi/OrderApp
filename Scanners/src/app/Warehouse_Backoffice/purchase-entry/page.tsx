"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "./purchase-entry.module.css";

type WarehouseOption = {
  id: string;
  name: string | null;
  active?: boolean | null;
};

type SupplierOption = {
  id: string;
  name: string | null;
};

type WarehouseItem = {
  warehouse_id: string;
  item_id: string;
  item_name: string | null;
  variant_key: string | null;
  variant_name: string | null;
  sku: string | null;
  net_units: number | null;
  unit_cost: number | null;
  item_kind: string | null;
  image_url: string | null;
  has_recipe: boolean | null;
  consumption_uom: string | null;
  purchase_pack_unit: string | null;
  transfer_unit: string | null;
  transfer_quantity: number | null;
};

type PurchaseCartItem = {
  itemId: string;
  itemName: string;
  variantKey: string | null;
  variantName: string | null;
  qty: number;
  unitCost: number | null;
  uom: string;
};


const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json();
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function normalizeUom(item?: { consumption_uom?: string | null; transfer_unit?: string | null; purchase_pack_unit?: string | null }) {
  const unit = item?.consumption_uom || item?.transfer_unit || item?.purchase_pack_unit || "each";
  return unit.trim() || "each";
}

export default function WarehousePurchaseEntryPage() {
  const router = useRouter();
  const { status } = useWarehouseAuth();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const [itemSearch, setItemSearch] = useState("");
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<WarehouseItem | null>(null);
  const [qtyInput, setQtyInput] = useState("");
  const [unitCostInput, setUnitCostInput] = useState("");
  const [cart, setCart] = useState<PurchaseCartItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadWarehouses = async () => {
      try {
        const payload = await fetchJson<{ warehouses?: WarehouseOption[] }>("/api/warehouses");
        if (!active) return;
        const filtered = (payload.warehouses ?? []).filter((row) => row.id);
        setWarehouses(filtered);
      } catch (err) {
        if (active) setError(toErrorMessage(err));
      }
    };

    const loadSuppliers = async () => {
      try {
        const payload = await fetchJson<{ suppliers?: SupplierOption[] }>("/api/suppliers");
        if (!active) return;
        setSuppliers(payload.suppliers ?? []);
      } catch (err) {
        if (active) setError(toErrorMessage(err));
      }
    };

    void loadWarehouses();
    void loadSuppliers();

    return () => {
      active = false;
    };
  }, [status]);

  useEffect(() => {
    if (status !== "ok") return;
    if (!selectedWarehouseId) return;
    if (!itemSearch.trim()) {
      setItems([]);
      return;
    }

    let active = true;
    const timeout = window.setTimeout(async () => {
      try {
        setLoading(true);
        const { data, error: listError } = await supabase.rpc("list_warehouse_items", {
          p_warehouse_id: selectedWarehouseId,
          p_outlet_id: null,
          p_search: itemSearch.trim() || null,
        });
        if (listError) throw listError;
        if (!active) return;
        const rows = (data ?? []) as WarehouseItem[];
        setItems(rows.filter((row) => row.item_id));
      } catch (err) {
        if (active) setError(toErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [itemSearch, selectedWarehouseId, status, supabase]);

  const addToCart = () => {
    if (!selectedItem) {
      setError("Select an item to add.");
      return;
    }
    const qty = Number(qtyInput);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Enter a valid quantity.");
      return;
    }
    const costRaw = unitCostInput.trim();
    const unitCost = costRaw ? Number(costRaw) : null;
    if (unitCost !== null && !Number.isFinite(unitCost)) {
      setError("Enter a valid unit cost.");
      return;
    }

    const variantKey = selectedItem.variant_key ?? "base";
    const variantName = selectedItem.variant_name ?? null;
    const uom = normalizeUom(selectedItem);

    setCart((prev) => [
      {
        itemId: selectedItem.item_id,
        itemName: selectedItem.item_name ?? "Item",
        variantKey,
        variantName,
        qty,
        unitCost,
        uom,
      },
      ...prev,
    ]);

    setQtyInput("");
    setUnitCostInput("");
    setError(null);
  };

  const removeCartItem = (index: number) => {
    setCart((prev) => prev.filter((_row, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedWarehouseId) {
      setError("Select a warehouse.");
      return;
    }
    if (!selectedSupplierId) {
      setError("Select a supplier.");
      return;
    }
    if (!invoiceNumber.trim()) {
      setError("Invoice number is required.");
      return;
    }
    if (cart.length === 0) {
      setError("Add at least one item.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        p_warehouse_id: selectedWarehouseId,
        p_supplier_id: selectedSupplierId,
        p_reference_code: invoiceNumber.trim(),
        p_items: cart.map((item) => ({
          product_id: item.itemId,
          variant_key: item.variantKey ?? "base",
          qty: item.qty,
          qty_input_mode: "units",
          unit_cost: item.unitCost,
        })),
        p_note: null,
      };

      const { data, error: submitError } = await supabase.rpc("record_purchase_receipt", payload);
      if (submitError) throw submitError;

      const reference = typeof data?.reference_code === "string" ? data.reference_code : invoiceNumber.trim();
      setSuccess(`Purchase ${reference} recorded.`);
      setCart([]);
      setInvoiceNumber("");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <style>{globalStyles}</style>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Purchase Entry</h1>
            <p className={styles.subtitle}>Record beverages storeroom purchase receipts.</p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={handleBackOne} className={styles.backButton}>
              Back
            </button>
            <button onClick={handleBack} className={styles.backButton}>
              Back to Dashboard
            </button>
          </div>
        </header>

        {error && <p className={styles.errorBanner}>{error}</p>}
        {success && <p className={styles.successBanner}>{success}</p>}

        <section className={styles.grid}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Receipt details</h2>
            <label className={styles.fieldLabel}>
              Warehouse
              <select
                className={styles.select}
                value={selectedWarehouseId}
                onChange={(event) => setSelectedWarehouseId(event.target.value)}
              >
                <option value="">Select warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name ?? warehouse.id}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.fieldLabel}>
              Supplier
              <select
                className={styles.select}
                value={selectedSupplierId}
                onChange={(event) => setSelectedSupplierId(event.target.value)}
                disabled={!suppliers.length}
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name ?? supplier.id}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.fieldLabel}>
              Invoice number
              <input
                className={styles.input}
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value.toUpperCase())}
                placeholder="INV-0001"
              />
            </label>
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Add items</h2>
            <label className={styles.fieldLabel}>
              Search items
              <input
                className={styles.input}
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                placeholder="Search by name or SKU"
              />
            </label>
            <div className={styles.itemList}>
              {items.length === 0 ? (
                <p className={styles.helperText}>{itemSearch.trim() ? "No items found." : "Start typing to search items."}</p>
              ) : (
                items.map((item) => (
                  <button
                    key={`${item.item_id}-${item.variant_key ?? "base"}`}
                    type="button"
                    className={`${styles.itemOption} ${selectedItem?.item_id === item.item_id && selectedItem?.variant_key === item.variant_key ? styles.itemOptionActive : ""}`}
                    onClick={() => setSelectedItem(item)}
                  >
                    <span>
                      {item.item_name ?? item.item_id}
                      {item.variant_name
                        ? ` • ${item.variant_name}`
                        : item.variant_key && item.variant_key !== "base"
                          ? ` • ${item.variant_key}`
                          : ""}
                    </span>
                    {item.variant_key && item.variant_key !== "base" && <span className={styles.itemTag}>Variant</span>}
                  </button>
                ))
              )}
            </div>

            {selectedItem && (
              <div className={styles.variantPanel}>
                <label className={styles.fieldLabel}>
                  Quantity ({normalizeUom(selectedItem)})
                  <input
                    className={styles.input}
                    value={qtyInput}
                    onChange={(event) => setQtyInput(event.target.value)}
                    placeholder="0"
                  />
                </label>
                <label className={styles.fieldLabel}>
                  Unit cost (optional)
                  <input
                    className={styles.input}
                    value={unitCostInput}
                    onChange={(event) => setUnitCostInput(event.target.value)}
                    placeholder="0"
                  />
                </label>
                <button type="button" className={styles.primaryButton} onClick={addToCart}>
                  Add item
                </button>
              </div>
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeaderRow}>
            <h2 className={styles.panelTitle}>Items to submit</h2>
          </div>
          {cart.length === 0 ? (
            <p className={styles.helperText}>No items added yet.</p>
          ) : (
            <div className={styles.cartList}>
              {cart.map((row, index) => (
                <div key={`${row.itemId}-${row.variantKey ?? "base"}-${index}`} className={styles.cartRow}>
                  <div>
                    <p className={styles.cartTitle}>{row.itemName}</p>
                    <p className={styles.cartMeta}>Variant: {row.variantName ?? "Base"}</p>
                    <p className={styles.cartMeta}>Qty: {row.qty} {row.uom}</p>
                    {row.unitCost != null && <p className={styles.cartMeta}>Unit cost: {row.unitCost}</p>}
                  </div>
                  <button type="button" className={styles.ghostButton} onClick={() => removeCartItem(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className={styles.actionRow}>
          <button type="button" className={styles.outlineButton} onClick={handleBack}>
            Back to dashboard
          </button>
          <button type="button" className={styles.primaryButton} onClick={handleSubmit} disabled={saving}>
            {saving ? "Submitting..." : "Submit purchase"}
          </button>
        </div>
      </main>
    </div>
  );
}

const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

button {
  background: none;
  border: none;
}

button:hover {
  transform: translateY(-2px);
}
`;
