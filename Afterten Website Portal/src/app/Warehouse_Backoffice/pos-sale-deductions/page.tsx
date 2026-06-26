"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchPosDeductionOutlets,
  fetchPosDeductionOutletWarehouses,
  groupSellingOutletWarehouses,
  type SellingOutletOption,
} from "@/lib/sellingOutlets";
import { useWarehouseAuth } from "../useWarehouseAuth";
import eb from "../enterprise.module.css";
import local from "./pos-sale-deductions.module.css";

type Outlet = { id: string; name: string; default_sales_warehouse_id?: string | null };
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

type SavedRule = DeductionLine & {
  id: string;
  outlet_id: string;
  sold_item_id: string;
  sold_variant_key: string;
};

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

function outletNameById(outlets: Outlet[], id: string): string {
  return outlets.find((o) => o.id === id)?.name ?? id;
}

function warehouseLabel(
  warehouseId: string,
  outletId: string,
  outletWarehouses: OutletWarehouse[],
  warehouseOptions: SellingOutletOption[],
): string {
  const fromLink = outletWarehouses.find(
    (row) => row.warehouse_id === warehouseId && row.outlet_id === outletId,
  );
  if (fromLink) return fromLink.warehouse_name || fromLink.display_name;
  const fromOption = warehouseOptions.find((row) => row.warehouse_id === warehouseId);
  if (fromOption) return fromOption.warehouse_name || fromOption.display_name;
  return warehouseId;
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
  const [allRules, setAllRules] = useState<SavedRule[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (status !== "ok") return;
    let cancelled = false;

    const load = async () => {
      setLoadError(null);
      try {
        const [outletList, itemRes, varRes, warehouseList] = await Promise.all([
          fetchPosDeductionOutlets(),
          fetch("/api/catalog/items"),
          fetch("/api/catalog/variants"),
          fetchPosDeductionOutletWarehouses(),
        ]);
        if (cancelled) return;

        setOutlets(outletList);
        setOutletId((current) => current || outletList[0]?.id || "");
        setOutletDefaults(
          new Map(outletList.map((outlet) => [outlet.id, outlet.default_sales_warehouse_id ?? null])),
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
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load page data");
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const soldVariants = useMemo(() => variantsForItem(variants, soldItemId), [variants, soldItemId]);

  const finishedItems = useMemo(
    () => items.filter((i) => i.item_kind === "finished" || !i.item_kind),
    [items],
  );

  const warehousesForOutlet = useMemo(() => {
    const grouped = groupSellingOutletWarehouses(
      outletWarehouses.filter((ow) => ow.outlet_id === outletId),
      outletDefaults,
    );
    if (grouped.length) return grouped;

    const defaultWh = outletDefaults.get(outletId);
    const outlet = outlets.find((o) => o.id === outletId);
    if (defaultWh && outlet) {
      return [
        {
          outlet_id: outlet.id,
          outlet_name: outlet.name,
          warehouse_id: defaultWh,
          warehouse_name: "Default warehouse",
          display_name: outlet.name,
        },
      ];
    }
    return [];
  }, [outletWarehouses, outletId, outletDefaults, outlets]);

  const warehouseOptionsByOutlet = useMemo(() => {
    const map = new Map<string, SellingOutletOption[]>();
    for (const outlet of outlets) {
      map.set(
        outlet.id,
        groupSellingOutletWarehouses(
          outletWarehouses.filter((row) => row.outlet_id === outlet.id),
          outletDefaults,
        ),
      );
    }
    return map;
  }, [outlets, outletWarehouses, outletDefaults]);

  useEffect(() => {
    const primary = warehousesForOutlet[0]?.warehouse_id;
    if (!primary) return;
    setLines((prev) =>
      prev.map((line) => (line.warehouse_id ? line : { ...line, warehouse_id: primary })),
    );
  }, [outletId, warehousesForOutlet]);

  const variantLabel = useCallback(
    (itemId: string, key: string) => {
      if (key === "base") return "base";
      const match = variantsForItem(variants, itemId).find((v) => variantKeyFor(v) === key);
      return match ? `${match.name}${match.sku ? ` (${match.sku})` : ""}` : key;
    },
    [variants],
  );

  const loadAllRules = useCallback(async () => {
    setLoadingAll(true);
    try {
      const res = await fetch("/api/outlet-pos-deduction-rules", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load rules");
      const rules = ((json.rules as SavedRule[]) ?? []).filter((rule) =>
        outlets.some((outlet) => outlet.id === rule.outlet_id),
      );
      setAllRules(rules);
    } catch {
      setAllRules([]);
    } finally {
      setLoadingAll(false);
    }
  }, [outlets]);

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
          })),
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
    if (status === "ok" && outlets.length) void loadAllRules();
  }, [status, outlets, loadAllRules]);

  useEffect(() => {
    if (status === "ok") void loadRules();
  }, [status, loadRules]);

  const saveRules = async () => {
    if (readOnly) {
      setMessage({ ok: false, text: "Read-only access." });
      return;
    }
    if (!outletId) {
      setMessage({ ok: false, text: "Select an outlet first." });
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
      setMessage({
        ok: true,
        text: `Saved ${json.saved ?? 0} deduction line(s). Middleware applies these on each POS sale.`,
      });
      await loadRules();
      await loadAllRules();
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
  const selectedOutlet = outlets.find((o) => o.id === outletId);

  return (
    <div>
      {loadError && (
        <div className={`${eb.alertBanner} ${eb.alertRed}`}>
          <span>{loadError}</span>
        </div>
      )}

      <section className={eb.pageCard}>
        <div className={eb.sectionHeaderBlue}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            POS sale deductions
          </h3>
          <p className={eb.pageCardBody} style={{ marginTop: 8 }}>
            Program what stock to deduct when middleware syncs a POS sale. Till 1, Till 2, and Quick Corner are
            excluded — they do not use the ordering app.
          </p>
        </div>
        <div className={eb.summaryGrid}>
          <div className={`${eb.summaryCard} ${eb.summaryCardBlue}`}>
            <p className={eb.summaryLabel}>Outlets</p>
            <p className={eb.summaryValue}>{outlets.length}</p>
          </div>
          <div className={`${eb.summaryCard} ${eb.summaryCardGreen}`}>
            <p className={eb.summaryLabel}>Programmed rules</p>
            <p className={eb.summaryValue}>{allRules.length}</p>
          </div>
          <div className={`${eb.summaryCard} ${eb.summaryCardGold}`}>
            <p className={eb.summaryLabel}>Finished products</p>
            <p className={eb.summaryValue}>{finishedItems.length}</p>
          </div>
        </div>
      </section>

      <section className={eb.pageCard}>
        <div className={eb.sectionHeaderGreen}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            Sold product
          </h3>
          <p className={eb.pageCardBody}>Choose the outlet and the POS item that triggers deductions.</p>
        </div>

        {outlets.length === 0 ? (
          <p className={local.emptyState}>No eligible outlets found. Active outlets except Till 1, Till 2, and Quick Corner appear here.</p>
        ) : (
          <div className={eb.filterBar}>
            <label className={eb.fieldLabel}>
              Outlet
              <select
                className={eb.fieldSelect}
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
              >
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={eb.fieldLabel}>
              POS sold item
              <select
                className={eb.fieldSelect}
                value={soldItemId}
                onChange={(e) => {
                  setSoldItemId(e.target.value);
                  setSoldVariantKey("base");
                }}
              >
                <option value="">Select product…</option>
                {finishedItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.sku ? ` (${i.sku})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className={eb.fieldLabel}>
              Sold variant
              <select
                className={eb.fieldSelect}
                value={soldVariantKey}
                onChange={(e) => setSoldVariantKey(e.target.value)}
                disabled={!soldItemId}
              >
                <option value="base">base</option>
                {soldVariants.map((v) => (
                  <option key={v.id} value={variantKeyFor(v)}>
                    {v.name}
                    {v.sku ? ` (${v.sku})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {selectedOutlet && soldItem && (
          <p className={eb.pageCardBody} style={{ marginTop: 12 }}>
            <strong>{selectedOutlet.name}</strong> — POS SKU <strong>{soldItem.sku ?? "—"}</strong>. Deductions run
            inside middleware sync when a matching sale is posted.
          </p>
        )}
      </section>

      <section className={eb.pageCard}>
        <div className={eb.sectionHeaderGold}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            Deduction lines
          </h3>
          <p className={eb.pageCardBody}>Quantities are per single sale (qty × items sold).</p>
        </div>

        {!soldItemId ? (
          <p className={local.emptyState}>Select a sold product above to program deduction lines.</p>
        ) : loading ? (
          <p className={eb.pageCardBody}>Loading existing rules…</p>
        ) : (
          <>
            {lines.map((line, index) => {
              const deductVariants = variantsForItem(variants, line.deduct_item_id);
              return (
                <div key={`line-${index}`} className={local.deductionLine}>
                  <div className={local.deductionLineHeader} style={{ gridColumn: "1 / -1" }}>
                    <span className={local.lineBadge}>Line {index + 1}</span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className={eb.btnDeduct}
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <label className={eb.fieldLabel}>
                    Deduct item
                    <select
                      className={eb.fieldSelect}
                      value={line.deduct_item_id}
                      onChange={(e) =>
                        updateLine(index, { deduct_item_id: e.target.value, deduct_variant_key: "base" })
                      }
                    >
                      <option value="">Select…</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={eb.fieldLabel}>
                    Deduct variant
                    <select
                      className={eb.fieldSelect}
                      value={line.deduct_variant_key}
                      onChange={(e) => updateLine(index, { deduct_variant_key: e.target.value })}
                      disabled={!line.deduct_item_id}
                    >
                      <option value="base">base</option>
                      {deductVariants.map((v) => (
                        <option key={v.id} value={variantKeyFor(v)}>
                          {v.name}
                          {v.sku ? ` (${v.sku})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={eb.fieldLabel}>
                    Qty per sale
                    <input
                      className={eb.fieldInput}
                      type="number"
                      min="0"
                      step="any"
                      value={line.deduct_qty_per_sale}
                      onChange={(e) => updateLine(index, { deduct_qty_per_sale: e.target.value })}
                    />
                  </label>
                  <label className={eb.fieldLabel}>
                    Outlet warehouse
                    <select
                      className={eb.fieldSelect}
                      value={line.warehouse_id}
                      onChange={(e) => updateLine(index, { warehouse_id: e.target.value })}
                    >
                      <option value="">Select…</option>
                      {warehousesForOutlet.map((ow) => (
                        <option key={ow.warehouse_id} value={ow.warehouse_id}>
                          {ow.warehouse_name || ow.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}

            <div className={local.toolbar}>
              <button type="button" className={eb.btnGold} onClick={() => setLines((prev) => [...prev, emptyLine()])}>
                Add line
              </button>
              <button
                type="button"
                className={eb.btnAdd}
                disabled={saving || !soldItemId || !outletId || readOnly}
                onClick={() => void saveRules()}
              >
                {saving ? "Saving…" : "Save rules"}
              </button>
            </div>
          </>
        )}

        {message && (
          <p className={message.ok ? local.alertOk : local.alertError}>{message.text}</p>
        )}
      </section>

      <section className={eb.pageCard}>
        <div className={eb.sectionHeaderBlue}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            All programmed rules
          </h3>
          <p className={eb.pageCardBody}>Every active deduction rule across eligible outlets.</p>
        </div>
        <div className={eb.tableWrap}>
          <table className={eb.dataTable}>
            <thead>
              <tr>
                <th>Outlet</th>
                <th>Sold product</th>
                <th>Sold variant</th>
                <th>Deduct item</th>
                <th>Deduct variant</th>
                <th>Qty / sale</th>
                <th>Warehouse</th>
              </tr>
            </thead>
            <tbody>
              {loadingAll ? (
                <tr>
                  <td colSpan={7}>Loading rules…</td>
                </tr>
              ) : allRules.length === 0 ? (
                <tr>
                  <td colSpan={7}>No deduction rules programmed yet.</td>
                </tr>
              ) : (
                allRules.map((rule) => {
                  const sold = items.find((i) => i.id === rule.sold_item_id);
                  const deduct = items.find((i) => i.id === rule.deduct_item_id);
                  const whOptions = warehouseOptionsByOutlet.get(rule.outlet_id) ?? [];
                  return (
                    <tr key={rule.id}>
                      <td>{outletNameById(outlets, rule.outlet_id)}</td>
                      <td>{sold?.name ?? rule.sold_item_id}</td>
                      <td>{variantLabel(rule.sold_item_id, rule.sold_variant_key)}</td>
                      <td>{deduct?.name ?? rule.deduct_item_id}</td>
                      <td>{variantLabel(rule.deduct_item_id, rule.deduct_variant_key)}</td>
                      <td>{rule.deduct_qty_per_sale}</td>
                      <td>
                        {warehouseLabel(
                          rule.warehouse_id,
                          rule.outlet_id,
                          outletWarehouses,
                          whOptions,
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {existingRules.length > 0 && soldItemId && (
        <section className={eb.pageCard}>
          <div className={eb.sectionHeaderGreen}>
            <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
              Current selection ({existingRules.length})
            </h3>
          </div>
          <div className={eb.tableWrap}>
            <table className={eb.dataTable}>
              <thead>
                <tr>
                  <th>Outlet</th>
                  <th>Deduct item</th>
                  <th>Variant</th>
                  <th>Qty / sale</th>
                  <th>Warehouse</th>
                </tr>
              </thead>
              <tbody>
                {existingRules.map((rule) => {
                  const item = items.find((i) => i.id === rule.deduct_item_id);
                  return (
                    <tr key={rule.id}>
                      <td>{outletNameById(outlets, rule.outlet_id)}</td>
                      <td>{item?.name ?? rule.deduct_item_id}</td>
                      <td>{variantLabel(rule.deduct_item_id, rule.deduct_variant_key)}</td>
                      <td>{rule.deduct_qty_per_sale}</td>
                      <td>
                        {warehouseLabel(
                          rule.warehouse_id,
                          rule.outlet_id,
                          outletWarehouses,
                          warehousesForOutlet,
                        )}
                      </td>
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
