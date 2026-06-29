"use client";

import { useCallback, useEffect, useState } from "react";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import eb from "../../enterprise.module.css";

type Period = { id: string; stocktake_number?: string | null; status?: string | null };
type CountRow = {
  item_id: string;
  variant_key: string;
  item_name?: string;
  opening_qty?: number | null;
  closing_qty?: number | null;
  portal_opening_override?: number | null;
  portal_closing_override?: number | null;
};

export default function StocktakeCorrectionsPage() {
  const { status, readOnly } = useWarehouseAuth();
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [rows, setRows] = useState<CountRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ok") return;
    void fetch("/api/warehouses")
      .then((r) => r.json())
      .then((json) => setWarehouses(Array.isArray(json.warehouses) ? json.warehouses : []))
      .catch(() => setMessage("Unable to load warehouses"));
  }, [status]);

  const loadPeriods = useCallback(async (whId: string) => {
    const res = await fetch(`/api/warehouse-periods?warehouseId=${encodeURIComponent(whId)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Unable to load periods");
    setPeriods(Array.isArray(json.periods) ? json.periods : []);
  }, []);

  const loadVariance = useCallback(async (whId: string, pId: string) => {
    const res = await fetch(
      `/api/stocktake-variance?warehouseId=${encodeURIComponent(whId)}&periodId=${encodeURIComponent(pId)}`
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Unable to load variance");
    const items = Array.isArray(json.items) ? json.items : [];
    setRows(
      items.map((row: Record<string, unknown>) => ({
        item_id: String(row.item_id ?? ""),
        variant_key: String(row.variant_key ?? "base"),
        item_name: String(row.item_name ?? row.name ?? ""),
        opening_qty: row.opening_qty as number | null,
        closing_qty: row.closing_qty as number | null,
        portal_opening_override: row.portal_opening_override as number | null,
        portal_closing_override: row.portal_closing_override as number | null,
      }))
    );
  }, []);

  useEffect(() => {
    if (warehouseId) void loadPeriods(warehouseId).catch((e) => setMessage(String(e.message ?? e)));
  }, [warehouseId, loadPeriods]);

  useEffect(() => {
    if (warehouseId && periodId) {
      void loadVariance(warehouseId, periodId).catch((e) => setMessage(String(e.message ?? e)));
    }
  }, [warehouseId, periodId, loadVariance]);

  const saveOverride = async (row: CountRow, field: "opening" | "closing", value: string) => {
    if (readOnly || !warehouseId || !periodId) return;
    setMessage(null);
    try {
      const res = await fetch("/api/outlet-stocktake-corrections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse_id: warehouseId,
          stock_period_id: periodId,
          item_id: row.item_id,
          variant_key: row.variant_key,
          portal_opening_override: field === "opening" ? Number(value) : row.portal_opening_override,
          portal_closing_override: field === "closing" ? Number(value) : row.portal_closing_override,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setMessage("Portal correction saved (source of truth for variance PDFs).");
      await loadVariance(warehouseId, periodId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    }
  };

  if (status !== "ok") return null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className={eb.pageCard}>
        <h3 className={eb.pageCardTitle}>Stocktake corrections</h3>
        <p className={eb.pageCardBody}>
          Edit opening and closing quantities per product. Portal overrides become the source of truth for variance
          PDFs without changing sales or period boundaries.
        </p>
      </section>
      <section className={eb.pageCard} style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <label className={eb.pageCardBody}>
          Outlet warehouse
          <select
            className={eb.fieldInput}
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setPeriodId("");
            }}
            style={{ display: "block", marginTop: 6 }}
          >
            <option value="">Select warehouse…</option>
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>
                {wh.name}
              </option>
            ))}
          </select>
        </label>
        <label className={eb.pageCardBody}>
          Period
          <select
            className={eb.fieldInput}
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            style={{ display: "block", marginTop: 6 }}
          >
            <option value="">Select period…</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.stocktake_number ?? p.id.slice(0, 8)} ({p.status ?? "unknown"})
              </option>
            ))}
          </select>
        </label>
      </section>
      {message ? <p className={eb.pageCardBody}>{message}</p> : null}
      {rows.length > 0 ? (
        <section className={eb.pageCard}>
          <div className={eb.tableWrap}>
            <table className={eb.dataTable}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Variant</th>
                  <th>Opening</th>
                  <th>Closing</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.item_id}:${row.variant_key}`}>
                    <td>{row.item_name || row.item_id}</td>
                    <td>{row.variant_key}</td>
                    <td>
                      <input
                        className={eb.fieldInput}
                        defaultValue={row.portal_opening_override ?? row.opening_qty ?? ""}
                        onBlur={(e) => void saveOverride(row, "opening", e.target.value)}
                        disabled={readOnly}
                      />
                    </td>
                    <td>
                      <input
                        className={eb.fieldInput}
                        defaultValue={row.portal_closing_override ?? row.closing_qty ?? ""}
                        onBlur={(e) => void saveOverride(row, "closing", e.target.value)}
                        disabled={readOnly}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
