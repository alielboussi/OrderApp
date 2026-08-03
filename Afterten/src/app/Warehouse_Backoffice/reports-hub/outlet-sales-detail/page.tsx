"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWarehouseAuth } from "../../useWarehouseAuth";
import eb from "../../enterprise.module.css";
import type { MiddlewareSaleEvent, MiddlewareSalesResponse } from "@/lib/middleware-sales-types";

type OutletOption = { id: string; name: string };
type CashierOption = { pos_user_id: number | null; name: string; username: string };

const FIRESTORE_ROW_LIMIT = 5000;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function toDateInputValue(date: Date): string {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function cashierLabel(sale: MiddlewareSaleEvent): string {
  if (sale.cashier_name) {
    return sale.cashier_username
      ? `${sale.cashier_name} (${sale.cashier_username})`
      : sale.cashier_name;
  }
  if (sale.cashier_username) return sale.cashier_username;
  if (sale.cashier_id != null) return `MintPOS #${sale.cashier_id}`;
  return "—";
}

async function fetchOutletSales(
  outletId: string,
  since: string,
  until: string,
  cashierId: string,
): Promise<MiddlewareSalesResponse> {
  const params = new URLSearchParams({ outletId, since, until });
  if (cashierId) params.set("cashierId", cashierId);
  const res = await fetch(`/api/outlet-middleware-sales?${params.toString()}`);
  const json = (await res.json()) as MiddlewareSalesResponse;
  if (!res.ok) throw new Error(json.error || "Unable to load sales");
  return json;
}

export default function OutletSalesDetailReportPage() {
  const { status } = useWarehouseAuth();
  const today = useMemo(() => new Date(), []);
  const lastWeek = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }, []);

  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [cashiers, setCashiers] = useState<CashierOption[]>([]);
  const [cashierId, setCashierId] = useState("");
  const [startDate, setStartDate] = useState(toDateInputValue(lastWeek));
  const [endDate, setEndDate] = useState(toDateInputValue(today));
  const [search, setSearch] = useState("");
  const [sales, setSales] = useState<MiddlewareSaleEvent[]>([]);
  const [cloudBackend, setCloudBackend] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportAt, setReportAt] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;

    const loadOutlets = async () => {
      try {
        setBooting(true);
        setError(null);
        const res = await fetch("/api/outlets?scope=selling");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Unable to load outlets");
        const rows = Array.isArray(json.outlets) ? json.outlets : [];
        const mapped = rows
          .filter((row: { id?: string }) => row?.id)
          .map((row: { id: string; name?: string }) => ({
            id: row.id,
            name: row.name?.trim() || "Outlet",
          }));
        if (!active) return;
        setOutlets(mapped);
        if (mapped.length > 0) {
          setSelectedOutletIds(mapped.map((outlet: OutletOption) => outlet.id));
        }
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      } finally {
        if (active) setBooting(false);
      }
    };

    void loadOutlets();
    return () => {
      active = false;
    };
  }, [status]);

  const loadCashiers = useCallback(async (outletIds: string[]) => {
    if (outletIds.length !== 1) {
      setCashiers([]);
      setCashierId("");
      return;
    }
    try {
      const res = await fetch(`/api/cashiers?outlet_id=${encodeURIComponent(outletIds[0])}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load cashiers");
      const rows = Array.isArray(json.cashiers) ? json.cashiers : [];
      setCashiers(
        rows.map((row: { pos_user_id?: number | null; name?: string; username?: string }) => ({
          pos_user_id: row.pos_user_id ?? null,
          name: row.name ?? "",
          username: row.username ?? "",
        })),
      );
    } catch {
      setCashiers([]);
    }
  }, []);

  useEffect(() => {
    if (status !== "ok") return;
    void loadCashiers(selectedOutletIds);
  }, [status, selectedOutletIds, loadCashiers]);

  const toggleOutlet = (id: string) => {
    setSelectedOutletIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  const runReport = async () => {
    if (!startDate || !endDate) {
      setError("Select a start and end date.");
      return;
    }
    if (selectedOutletIds.length === 0) {
      setError("Select at least one outlet.");
      return;
    }

    setLoading(true);
    setError(null);
    setTruncated(false);
    try {
      const responses = await Promise.all(
        selectedOutletIds.map((outletId) => fetchOutletSales(outletId, startDate, endDate, cashierId)),
      );

      const merged = responses
        .flatMap((response) => response.sales ?? [])
        .sort((a, b) => b.sold_at.localeCompare(a.sold_at));

      const hitLimit = responses.some((response) => (response.sales_count ?? 0) >= FIRESTORE_ROW_LIMIT);
      const backend = responses.find((response) => response.cloud_backend)?.cloud_backend ?? null;

      setSales(merged);
      setTruncated(hitLimit && backend === "firebase");
      setCloudBackend(backend);
      setReportAt(new Date().toLocaleString());
      setExpanded(new Set());
    } catch (err) {
      setSales([]);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter((sale) => {
      const haystack = [
        sale.outlet_name,
        sale.pos_bill_id,
        sale.pos_sale_id,
        sale.cashier_name,
        sale.cashier_username,
        sale.shift_name,
        sale.payment_type,
        sale.lines.paragraph,
        ...sale.lines.items.map(
          (line) =>
            `${line.product_name ?? ""} ${line.variant_name ?? ""} ${line.variant_sku ?? ""}`,
        ),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sales, search]);

  const totals = useMemo(() => {
    const revenue = filteredSales.reduce((sum, sale) => sum + sale.total_amount_of_sale, 0);
    const lines = filteredSales.reduce((sum, sale) => sum + sale.lines.items.length, 0);
    return { sales: filteredSales.length, revenue, lines };
  }, [filteredSales]);

  const toggleExpanded = (saleReference: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(saleReference)) next.delete(saleReference);
      else next.add(saleReference);
      return next;
    });
  };

  const exportCsv = () => {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const headers = [
      "Sold at",
      "Outlet",
      "Bill #",
      "Cashier",
      "Shift",
      "Payment",
      "Sale total",
      "Line product",
      "Variant",
      "SKU",
      "Qty",
      "Unit price",
      "Line total",
    ];
    const rows: string[] = [];
    for (const sale of filteredSales) {
      for (const line of sale.lines.items) {
        rows.push(
          [
            formatDateTime(sale.sold_at),
            sale.outlet_name ?? sale.outlet_uuid,
            sale.pos_bill_id ?? "",
            cashierLabel(sale),
            sale.shift_name ?? "",
            sale.payment_type ?? "",
            formatCurrency(sale.total_amount_of_sale),
            line.product_name ?? "",
            line.variant_name ?? "",
            line.variant_sku ?? "",
            String(line.quantity),
            formatCurrency(line.price_after_vat_16),
            formatCurrency(line.line_total_amount),
          ]
            .map(escape)
            .join(","),
        );
      }
    }
    const csv = [headers.map(escape).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `outlet-sales-detail-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (status !== "ok") return null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className={eb.pageCard}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 className={eb.pageCardTitle} style={{ textAlign: "left" }}>
              Outlet Sales Detail
            </h3>
            <p className={eb.pageCardBody} style={{ maxWidth: 720 }}>
              Bill-level POS sales from middleware sync — each sale shows line items and the cashier who punched it.
            </p>
          </div>
          <Link href="/Warehouse_Backoffice/reports-hub" className={eb.btnSecondary}>
            Back to Reports Hub
          </Link>
        </div>
      </section>

      <section className={eb.pageCard} style={{ display: "grid", gap: 12 }}>
        <div className={eb.filterBar}>
          <label className={eb.fieldLabel}>
            Start date
            <input
              className={eb.fieldInput}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className={eb.fieldLabel}>
            End date
            <input
              className={eb.fieldInput}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <label className={eb.fieldLabel}>
            Cashier
            <select
              className={eb.fieldSelect}
              value={cashierId}
              onChange={(event) => setCashierId(event.target.value)}
              disabled={selectedOutletIds.length !== 1}
            >
              <option value="">All cashiers</option>
              {cashiers.map((cashier) =>
                cashier.pos_user_id != null ? (
                  <option key={cashier.pos_user_id} value={String(cashier.pos_user_id)}>
                    {cashier.name || cashier.username} (#{cashier.pos_user_id})
                  </option>
                ) : null,
              )}
            </select>
          </label>
          <label className={eb.fieldLabel}>
            Search
            <input
              className={eb.fieldInput}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Bill, cashier, product…"
            />
          </label>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span className={eb.fieldLabel} style={{ margin: 0 }}>
              Outlets
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={eb.btnSecondary}
                onClick={() => setSelectedOutletIds(outlets.map((outlet) => outlet.id))}
              >
                All
              </button>
              <button type="button" className={eb.btnSecondary} onClick={() => setSelectedOutletIds([])}>
                Clear
              </button>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {booting ? (
              <span className={eb.pageCardBody}>Loading outlets…</span>
            ) : outlets.length === 0 ? (
              <span className={eb.pageCardBody}>No POS outlets found.</span>
            ) : (
              outlets.map((outlet) => (
                <label key={outlet.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={selectedOutletIds.includes(outlet.id)}
                    onChange={() => toggleOutlet(outlet.id)}
                  />
                  <span>{outlet.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className={eb.btnPrimary} disabled={loading || booting} onClick={() => void runReport()}>
            {loading ? "Running…" : "Run report"}
          </button>
          <button
            type="button"
            className={eb.btnSecondary}
            disabled={filteredSales.length === 0}
            onClick={exportCsv}
          >
            Export CSV
          </button>
          {reportAt && <span className={eb.pageCardBody}>Last run: {reportAt}</span>}
          {cloudBackend && <span className={eb.pageCardBody}>Backend: {cloudBackend}</span>}
        </div>

        {error && <div className={`${eb.alertBanner} ${eb.alertRed}`}>{error}</div>}
        {truncated && (
          <div className={`${eb.alertBanner} ${eb.alertGold}`}>
            Firebase returns at most {FIRESTORE_ROW_LIMIT.toLocaleString()} bills per outlet per query. Narrow the date
            range or filter by outlet to see all sales.
          </div>
        )}
      </section>

      <section className={eb.pageCard}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div>
            <div className={eb.pageCardBody}>Sales</div>
            <strong>{totals.sales.toLocaleString()}</strong>
          </div>
          <div>
            <div className={eb.pageCardBody}>Revenue</div>
            <strong>{formatCurrency(totals.revenue)}</strong>
          </div>
          <div>
            <div className={eb.pageCardBody}>Line items</div>
            <strong>{totals.lines.toLocaleString()}</strong>
          </div>
        </div>

        {loading ? (
          <p className={eb.pageCardBody}>Loading sales…</p>
        ) : filteredSales.length === 0 ? (
          <p className={eb.pageCardBody}>No sales for the selected filters. Run the report to load data.</p>
        ) : (
          <div className={eb.tableWrap}>
            <table className={eb.dataTable}>
              <thead>
                <tr>
                  <th />
                  <th>Sold at</th>
                  <th>Outlet</th>
                  <th>Bill #</th>
                  <th>Cashier</th>
                  <th>Shift</th>
                  <th>Payment</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Lines</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => {
                  const isOpen = expanded.has(sale.sale_reference);
                  return (
                    <SaleRows
                      key={sale.sale_reference}
                      sale={sale}
                      isOpen={isOpen}
                      onToggle={() => toggleExpanded(sale.sale_reference)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SaleRows({
  sale,
  isOpen,
  onToggle,
}: {
  sale: MiddlewareSaleEvent;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr>
        <td>
          <button type="button" className={eb.btnSecondary} onClick={onToggle} style={{ padding: "4px 8px" }}>
            {isOpen ? "−" : "+"}
          </button>
        </td>
        <td>{formatDateTime(sale.sold_at)}</td>
        <td>{sale.outlet_name ?? "—"}</td>
        <td>{sale.pos_bill_id ?? "—"}</td>
        <td>{cashierLabel(sale)}</td>
        <td>{sale.shift_name ?? "—"}</td>
        <td>{sale.payment_type ?? "—"}</td>
        <td style={{ textAlign: "right" }}>{formatCurrency(sale.total_amount_of_sale)}</td>
        <td>{sale.lines.items.length}</td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={9} style={{ background: "#fafafa" }}>
            <table className={eb.dataTable} style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Variant</th>
                  <th>SKU</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Unit</th>
                  <th style={{ textAlign: "right" }}>Line total</th>
                </tr>
              </thead>
              <tbody>
                {sale.lines.items.map((line, index) => (
                  <tr key={`${sale.sale_reference}-${index}`}>
                    <td>{line.product_name ?? "—"}</td>
                    <td>{line.variant_name ?? "—"}</td>
                    <td>{line.variant_sku ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>{line.quantity}</td>
                    <td style={{ textAlign: "right" }}>{formatCurrency(line.price_after_vat_16)}</td>
                    <td style={{ textAlign: "right" }}>{formatCurrency(line.line_total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
