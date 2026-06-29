"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import { downloadVariancePdf } from "../../stocktakes/outletStocktakePdf";
import eb from "../../enterprise.module.css";

type OutletWarehouseLink = {
  outlet_id: string;
  outlet_name: string;
  warehouse_id: string;
  warehouse_name: string;
  display_name: string;
};

type StockPeriod = {
  id: string;
  warehouse_id: string;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  stocktake_number: string | null;
};

function formatStamp(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}

export default function VarianceReportsPage() {
  const { status } = useWarehouseAuth();
  const [links, setLinks] = useState<OutletWarehouseLink[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [periods, setPeriods] = useState<StockPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const warehouseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const link of links) {
      if (!map.has(link.warehouse_id)) {
        map.set(link.warehouse_id, link.display_name || link.warehouse_name || link.warehouse_id);
      }
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [links]);

  const selectedWarehouseLabel =
    warehouseOptions.find((option) => option.id === warehouseId)?.label ?? "Warehouse";

  useEffect(() => {
    if (status !== "ok") return;
    void fetch("/api/outlet-warehouses?scope=outlet&stocktake=1")
      .then((res) => res.json())
      .then((json) => {
        const rows = Array.isArray(json.links) ? (json.links as OutletWarehouseLink[]) : [];
        setLinks(rows);
        if (rows.length > 0) {
          setWarehouseId((current) => current || rows[0].warehouse_id);
        }
      })
      .catch(() => setMessage("Unable to load outlet warehouses"));
  }, [status]);

  const loadPeriods = useCallback(async (whId: string) => {
    if (!whId) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/warehouse-periods?warehouseId=${encodeURIComponent(whId)}&limit=50`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load periods");
      setPeriods(Array.isArray(json.periods) ? json.periods : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load periods");
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (warehouseId) void loadPeriods(warehouseId);
  }, [warehouseId, loadPeriods]);

  const closedPeriods = periods.filter((period) => period.status?.toLowerCase() === "closed");
  const openPeriods = periods.filter((period) => period.status?.toLowerCase() !== "closed");

  const handleDownload = async (period: StockPeriod) => {
    setPdfBusyId(period.id);
    setMessage(null);
    try {
      const periodLabel = period.stocktake_number || period.id.slice(0, 8);
      const dateRange = `${formatStamp(period.opened_at)} → ${formatStamp(period.closed_at)}`;
      await downloadVariancePdf({
        periodId: period.id,
        warehouseLabel: selectedWarehouseLabel,
        periodLabel: `${periodLabel} · ${dateRange}`,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF download failed");
    } finally {
      setPdfBusyId(null);
    }
  };

  if (status !== "ok") return null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className={eb.pageCard}>
        <h3 className={eb.pageCardTitle}>Variance reports</h3>
        <p className={eb.pageCardBody}>
          Select an outlet warehouse and download the stocktake variance PDF for any closed period. Open periods can
          also be previewed before the period is closed.
        </p>
      </section>

      <section className={eb.pageCard} style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <label className={eb.pageCardBody}>
          Outlet warehouse
          <select
            className={eb.fieldInput}
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            style={{ display: "block", marginTop: 6 }}
          >
            <option value="">Select warehouse…</option>
            {warehouseOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {loading ? <p className={eb.pageCardBody}>Loading periods…</p> : null}
        {message ? <p className={eb.pageCardBody} style={{ color: "#b42318" }}>{message}</p> : null}
      </section>

      {warehouseId && !loading && closedPeriods.length === 0 && openPeriods.length === 0 ? (
        <section className={eb.pageCard}>
          <p className={eb.pageCardBody}>No stocktake periods found for this warehouse.</p>
        </section>
      ) : null}

      {closedPeriods.length > 0 ? (
        <section className={eb.pageCard}>
          <h3 className={eb.pageCardTitle}>Closed periods</h3>
          <div className={eb.tableWrap}>
            <table className={eb.dataTable}>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Opened</th>
                  <th>Closed</th>
                  <th style={{ width: 140 }}>Report</th>
                </tr>
              </thead>
              <tbody>
                {closedPeriods.map((period) => (
                  <tr key={period.id}>
                    <td>{period.stocktake_number || period.id.slice(0, 8)}</td>
                    <td>{formatStamp(period.opened_at)}</td>
                    <td>{formatStamp(period.closed_at)}</td>
                    <td>
                      <button
                        type="button"
                        className={eb.btnAdd}
                        disabled={pdfBusyId === period.id}
                        onClick={() => void handleDownload(period)}
                      >
                        {pdfBusyId === period.id ? "Preparing…" : "Download PDF"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {openPeriods.length > 0 ? (
        <section className={eb.pageCard}>
          <h3 className={eb.pageCardTitle}>Open periods</h3>
          <p className={eb.pageCardBody} style={{ marginTop: 0 }}>
            Preview variance for the current open period. Final reports are usually taken after closing.
          </p>
          <div className={eb.tableWrap}>
            <table className={eb.dataTable}>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Opened</th>
                  <th>Status</th>
                  <th style={{ width: 140 }}>Report</th>
                </tr>
              </thead>
              <tbody>
                {openPeriods.map((period) => (
                  <tr key={period.id}>
                    <td>{period.stocktake_number || period.id.slice(0, 8)}</td>
                    <td>{formatStamp(period.opened_at)}</td>
                    <td>{period.status}</td>
                    <td>
                      <button
                        type="button"
                        className={eb.btnSecondary}
                        disabled={pdfBusyId === period.id}
                        onClick={() => void handleDownload(period)}
                      >
                        {pdfBusyId === period.id ? "Preparing…" : "Preview PDF"}
                      </button>
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
