"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSellingOutlets, fetchSellingOutletWarehouses, groupSellingOutletWarehouses } from "@/lib/sellingOutlets";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "../enterprise.module.css";

type Outlet = { id: string; name: string };
type CatalogItem = { id: string; name: string; sku?: string | null; item_kind?: string | null };
type Variant = { id: string; item_id: string; name: string; sku?: string | null };
type OutletWarehouse = {
  outlet_id: string;
  outlet_name: string;
  warehouse_id: string;
  warehouse_name: string;
  display_name: string;
};

type DeductionLine = {
  deduct_item_id: string;
  deduct_variant_key: string;
  deduct_qty_per_sale: string;
  warehouse_id: string;
  notes?: string;
};

type SavedRule = DeductionLine & { id: string };

const emptyLine = (): DeductionLine => ({
  deduct_item_id: "",
  deduct_variant_key: "base",
  deduct_qty_per_sale: "1",
  warehouse_id: "",
});

function variantKeyFor(variant: Variant): string {
  return variant.sku?.trim() || variant.name.toLowerCase().replace(/\s+/g, "_");
}

function variantsForItem(variants: Variant[], itemId: string): Variant[] {
  return variants.filter((v) => v.item_id === itemId);
}

export default function PosSaleDeductionsPage() {
  const { status, readOnly } = useWarehouseAuth();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [outletWarehouses, setOutletWarehouses] = useState<OutletWarehouse[]>([]);
  const [outletDefaults, setOutletDefaults] = useState<Map<string, string | null>>(new Map());

  const [outletId, setOutletId] = useState("");
  const [soldItemId, setSoldItemId] = useState("");
  const [soldVariantKey, setSoldVariantKey] = useState("base");
  const [lines, setLines] = useState<DeductionLine[]>([emptyLine()]);
  const [existingRules, setExistingRules] = useState<SavedRule[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (status !== "ok") return;
    let cancelled = false;
    const load = async () => {
      const [outletList, itemRes, varRes, warehouseList] = await Promise.all([
        fetchSellingOutlets(),
        fetch("/api/catalog/items"),
        fetch("/api/catalog/variants"),
        fetchSellingOutletWarehouses(),
      ]);
      if (cancelled) return;
      setOutlets(outletList);
      setOutletId((current) => current || outletList[0]?.id || "");
      setOutletDefaults(
        new Map(outletList.map((outlet) => [outlet.id, outlet.default_sales_warehouse_id ?? null]))
      );
      if (itemRes.ok) {
        const json = await itemRes.json();
        setItems((json.items as CatalogItem[]) ?? []);
      }
      if (varRes.ok) {
        const json = await varRes.json();
        setVariants((json.variants as Variant[]) ?? []);
      }
      setOutletWarehouses(warehouseList);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const soldVariants = useMemo(() => variantsForItem(variants, soldItemId), [variants, soldItemId]);

  const warehousesForOutlet = useMemo(
    () =>
      groupSellingOutletWarehouses(
        outletWarehouses.filter((ow) => ow.outlet_id === outletId),
        outletDefaults
      ),
    [outletWarehouses, outletId, outletDefaults]
  );

  useEffect(() => {
    const primary = warehousesForOutlet[0]?.warehouse_id;
    if (!primary) return;
    setLines((prev) =>
      prev.map((line) => (line.warehouse_id ? line : { ...line, warehouse_id: primary }))
    );
  }, [outletId, warehousesForOutlet]);

  const variantLabel = useCallback(
    (itemId: string, key: string) => {
      if (key === "base") return "base";
      const match = variantsForItem(variants, itemId).find((v) => variantKeyFor(v) === key);
      return match ? `${match.name}${match.sku ? ` (${match.sku})` : ""}` : key;
    },
    [variants]
  );

  const loadRules = useCallback(async () => {
    if (!outletId || !soldItemId) {
      setExistingRules([]);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        outlet_id: outletId,
        sold_item_id: soldItemId,
        sold_variant_key: soldVariantKey,
      });
      const res = await fetch(`/api/outlet-pos-deduction-rules?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load rules");

      const rules = (json.rules as SavedRule[]) ?? [];
      setExistingRules(rules);
      if (rules.length) {
        setLines(
          rules.map((r) => ({
            deduct_item_id: r.deduct_item_id,
            deduct_variant_key: r.deduct_variant_key || "base",
            deduct_qty_per_sale: String(r.deduct_qty_per_sale),
            warehouse_id: r.warehouse_id,
            notes: r.notes ?? "",
          }))
        );
      } else {
        setLines([emptyLine()]);
      }
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Load failed" });
      setExistingRules([]);
    } finally {
      setLoading(false);
    }
  }, [outletId, soldItemId, soldVariantKey]);

  useEffect(() => {
    if (status === "ok") loadRules();
  }, [status, loadRules]);

  const saveRules = async () => {
    if (readOnly) {
      setMessage({ ok: false, text: "Read-only access." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/outlet-pos-deduction-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: outletId,
          sold_item_id: soldItemId,
          sold_variant_key: soldVariantKey,
          rules: lines.filter((l) => l.deduct_item_id && l.warehouse_id && Number(l.deduct_qty_per_sale) > 0),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setMessage({ ok: true, text: `Saved ${json.saved ?? 0} deduction line(s). Middleware applies these on each POS sale.` });
      await loadRules();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const updateLine = (index: number, patch: Partial<DeductionLine>) => {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  if (status !== "ok") return null;

  const soldItem = items.find((i) => i.id === soldItemId);

  return (
    <div>
      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderBlue}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Program POS sale deductions
          </h3>
          <p className={styles.pageCardBody}>
            When middleware syncs a sale (matched by catalog SKU), Supabase deducts these components from the outlet warehouse.
            Example: 1× Sandwich → 1 bread + 200 chicken from QC Dry Store.
          </p>
        </div>
      </section>

      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderGreen}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Sold product
          </h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <label>
            Outlet
            <select
              className={styles.fieldSelect}
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            POS sold item
            <select
              className={styles.fieldSelect}
              value={soldItemId}
              onChange={(e) => {
                setSoldItemId(e.target.value);
                setSoldVariantKey("base");
              }}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            >
              <option value="">Select product…</option>
              {items
                .filter((i) => i.item_kind === "finished" || !i.item_kind)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} {i.sku ? `(${i.sku})` : ""}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Sold variant
            <select
              className={styles.fieldSelect}
              value={soldVariantKey}
              onChange={(e) => setSoldVariantKey(e.target.value)}
              disabled={!soldItemId}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            >
              <option value="base">base</option>
              {soldVariants.map((v) => (
                <option key={v.id} value={variantKeyFor(v)}>
                  {v.name} {v.sku ? `(${v.sku})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        {soldItem && (
          <p className={styles.pageCardBody} style={{ marginTop: 12 }}>
            POS must send SKU <strong>{soldItem.sku ?? "—"}</strong> for this item. Deductions run inside{" "}
            <code>sync_pos_order</code> — no middleware code changes needed.
          </p>
        )}
      </section>

      <section className={styles.pageCard}>
        <div className={styles.sectionHeaderGold}>
          <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
            Deduction lines
          </h3>
          <p className={styles.pageCardBody}>Per sale quantity — multiply qty × sale count.</p>
        </div>

        {loading ? (
          <p className={styles.pageCardBody}>Loading existing rules…</p>
        ) : (
          <>
            {lines.map((line, index) => {
              const deductVariants = variantsForItem(variants, line.deduct_item_id);
              return (
              <div
                key={`line-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 8,
                  marginBottom: 12,
                  paddingBottom: 12,
                  borderBottom: "1px solid #eee",
                }}
              >
                <label>
                  Deduct item
                  <select
                    className={styles.fieldSelect}
                    value={line.deduct_item_id}
                    onChange={(e) =>
                      updateLine(index, { deduct_item_id: e.target.value, deduct_variant_key: "base" })
                    }
                    style={{ display: "block", width: "100%", marginTop: 4 }}
                  >
                    <option value="">Select…</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Deduct variant
                  <select
                    className={styles.fieldSelect}
                    value={line.deduct_variant_key}
                    onChange={(e) => updateLine(index, { deduct_variant_key: e.target.value })}
                    disabled={!line.deduct_item_id}
                    style={{ display: "block", width: "100%", marginTop: 4 }}
                  >
                    <option value="base">base</option>
                    {deductVariants.map((v) => (
                      <option key={v.id} value={variantKeyFor(v)}>
                        {v.name} {v.sku ? `(${v.sku})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Qty per sale
                  <input
                    className={styles.fieldInput}
                    type="number"
                    min="0"
                    step="any"
                    value={line.deduct_qty_per_sale}
                    onChange={(e) => updateLine(index, { deduct_qty_per_sale: e.target.value })}
                    style={{ display: "block", width: "100%", marginTop: 4 }}
                  />
                </label>
                <label>
                  Outlet warehouse
                  <select
                    className={styles.fieldSelect}
                    value={line.warehouse_id}
                    onChange={(e) => updateLine(index, { warehouse_id: e.target.value })}
                    style={{ display: "block", width: "100%", marginTop: 4 }}
                  >
                    <option value="">Select…</option>
                    {warehousesForOutlet.map((ow) => (
                      <option key={ow.warehouse_id} value={ow.warehouse_id}>
                        {ow.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                {lines.length > 1 && (
                  <div style={{ alignSelf: "end" }}>
                    <button
                      type="button"
                      className={styles.btnDeduct}
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
            })}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className={styles.btnGold} onClick={() => setLines((prev) => [...prev, emptyLine()])}>
                Add line
              </button>
              <button type="button" className={styles.btnAdd} disabled={saving || !soldItemId} onClick={saveRules}>
                {saving ? "Saving…" : "Save rules"}
              </button>
            </div>
          </>
        )}

        {message && (
          <p className={styles.pageCardBody} style={{ color: message.ok ? "#1a7f37" : "#c41e3a", marginTop: 12 }}>
            {message.text}
          </p>
        )}
      </section>

      {existingRules.length > 0 && (
        <section className={styles.pageCard}>
          <div className={styles.sectionHeaderBlue}>
            <h3 className={styles.pageCardTitle} style={{ margin: 0 }}>
              Active rules ({existingRules.length})
            </h3>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Deduct item</th>
                  <th>Variant</th>
                  <th>Qty / sale</th>
                  <th>Warehouse</th>
                </tr>
              </thead>
              <tbody>
                {existingRules.map((rule) => {
                  const item = items.find((i) => i.id === rule.deduct_item_id);
                  const wh = warehousesForOutlet.find((w) => w.warehouse_id === rule.warehouse_id);
                  return (
                    <tr key={rule.id}>
                      <td>{item?.name ?? rule.deduct_item_id}</td>
                      <td>{variantLabel(rule.deduct_item_id, rule.deduct_variant_key)}</td>
                      <td>{rule.deduct_qty_per_sale}</td>
                      <td>{wh?.display_name ?? wh?.outlet_name ?? rule.warehouse_id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
