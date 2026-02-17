"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWarehouseBrowserClient } from "@/lib/supabase-browser";
import { useWarehouseAuth } from "../useWarehouseAuth";
import styles from "./outlet-orders.module.css";

type OutletOption = {
  id: string;
  name: string;
};

type OrderRow = {
  id: string;
  order_number: string | null;
  created_at: string | null;
  status: string | null;
  outlet_id: string | null;
  outlets?: Array<{ name: string | null }> | null;
  employee_signed_name?: string | null;
  employee_signature_path?: string | null;
  employee_signed_at?: string | null;
  supervisor_signed_name?: string | null;
  supervisor_signature_path?: string | null;
  supervisor_signed_at?: string | null;
  driver_signed_name?: string | null;
  driver_signature_path?: string | null;
  driver_signed_at?: string | null;
  offloader_signed_name?: string | null;
  offloader_signature_path?: string | null;
  offloader_signed_at?: string | null;
  created_by?: string | null;
};

type OrderItemRow = {
  order_id: string;
  name: string | null;
  receiving_uom: string | null;
  qty: number | null;
  cost: number | null;
  amount: number | null;
};

type OrderTotals = {
  qty: number;
  amount: number;
};

type WhoAmIRoles = {
  outlets: Array<{ outlet_id: string; outlet_name: string }> | null;
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

function formatStamp(raw?: string | null): string {
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function getOutletName(order: OrderRow): string | null {
  if (Array.isArray(order.outlets)) return order.outlets[0]?.name ?? null;
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadLogoDataUrl(): Promise<string | undefined> {
  const candidates = ["/afterten-logo.png", "/afterten_logo.png"];
  for (const path of candidates) {
    try {
      const resp = await fetch(path);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read logo"));
        reader.readAsDataURL(blob);
      });
      return dataUrl;
    } catch {
      continue;
    }
  }
  return undefined;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

function buildOutletOrderPdfHtml(options: {
  logoDataUrl?: string;
  outletName: string;
  orderNumber: string;
  orderId: string;
  status: string;
  createdAt: string;
  placedBy: string;
  rows: Array<{ name: string; qty: number; uom: string; cost: number; amount: number }>;
  signatures: Array<{ label: string; name: string; signedAt?: string; dataUrl?: string }>;
  totalQty: number;
  totalAmount: number;
}): string {
  const { logoDataUrl, outletName, orderNumber, orderId, status, createdAt, placedBy, rows, signatures, totalQty, totalAmount } = options;

  const signatureBlocks = signatures
    .filter((sig) => sig.name || sig.dataUrl)
    .map(
      (sig) => `
      <div class="signature-block">
        <div class="signature-meta">
          <div class="signature-label">${escapeHtml(sig.label)}</div>
          <div class="signature-name">${escapeHtml(sig.name || "-")}</div>
          ${sig.signedAt ? `<div class="signature-date">${escapeHtml(sig.signedAt)}</div>` : ""}
        </div>
        <div class="signature-box">
          ${sig.dataUrl ? `<img src="${sig.dataUrl}" alt="${escapeHtml(sig.label)}" />` : "<span>—</span>"}
        </div>
      </div>
    `
    )
    .join("");

  const tableRows = rows
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td>${formatQty(row.qty)}</td>
        <td>${escapeHtml(row.uom)}</td>
        <td>${formatMoney(row.cost)}</td>
        <td>${formatMoney(row.amount)}</td>
      </tr>
    `
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Outlet Order</title>
        <style>
          @page { size: A4; margin: 6mm 6mm; }
          * { box-sizing: border-box; }
          body {
            font-family: "Segoe UI", Arial, sans-serif;
            color: #111827;
            margin: 0;
            padding: 0;
            background: #fff;
          }
          .page {
            border: 1.5mm solid #b91c1c;
            padding: 6mm 6mm 8mm;
            min-height: 277mm;
          }
          .header {
            display: grid;
            grid-template-columns: 64px 1fr 64px;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
          }
          .logo { width: 64px; height: 64px; object-fit: contain; }
          .title { text-align: center; font-size: 16px; font-weight: 700; letter-spacing: 0.4px; }
          .subheader {
            display: grid;
            gap: 4px;
            text-align: center;
            font-size: 11px;
            color: #374151;
            margin-bottom: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
            border: 2px solid #b91c1c;
          }
          th, td {
            border: 1px solid #f2b6b6;
            padding: 6px 6px;
            font-size: 10.5px;
            text-align: center;
          }
          th {
            text-transform: uppercase;
            font-size: 9.5px;
            letter-spacing: 0.6px;
            color: #6b7280;
          }
          tbody tr:last-child td { border-bottom: none; }
          tfoot td {
            font-weight: 700;
            border-top: 1px solid #f2b6b6;
            border-left: none;
            border-right: none;
            border-bottom: none;
            background: rgba(185, 28, 28, 0.05);
          }
          .signature-grid {
            margin-top: 16px;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }
          .signature-block {
            border: 1px solid #f2b6b6;
            padding: 8px;
            border-radius: 8px;
          }
          .signature-meta { margin-bottom: 8px; font-size: 10px; color: #374151; }
          .signature-label { font-weight: 700; color: #111827; }
          .signature-name { font-size: 11px; margin-top: 2px; }
          .signature-date { font-size: 10px; margin-top: 2px; }
          .signature-box {
            border: 1px solid #b91c1c;
            border-radius: 6px;
            min-height: 70px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fff;
          }
          .signature-box img { max-height: 64px; max-width: 100%; object-fit: contain; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="Afterten" />` : "<div></div>"}
            <div class="title">Outlet Order Details</div>
            <div></div>
          </div>
          <div class="subheader">
            <div><strong>Outlet:</strong> ${escapeHtml(outletName)}</div>
            <div><strong>Order #:</strong> ${escapeHtml(orderNumber)} · <strong>Status:</strong> ${escapeHtml(status)}</div>
            <div><strong>Order ID:</strong> ${escapeHtml(orderId)}</div>
            <div><strong>Created:</strong> ${escapeHtml(createdAt)} · <strong>Placed By:</strong> ${escapeHtml(placedBy)}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>UOM</th>
                <th>Cost</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || `<tr><td colspan="5">No items found.</td></tr>`}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>${formatQty(totalQty)}</td>
                <td></td>
                <td></td>
                <td>${formatMoney(totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
          ${signatureBlocks ? `<div class="signature-grid">${signatureBlocks}</div>` : ""}
        </div>
      </body>
    </html>
  `;
}

export default function OutletOrdersPage() {
  const router = useRouter();
  const supabase = useMemo(() => getWarehouseBrowserClient(), []);
  const { status } = useWarehouseAuth();

  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [totals, setTotals] = useState<Record<string, OrderTotals>>({});
  const [loading, setLoading] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => router.push("/Warehouse_Backoffice");
  const handleBackOne = () => router.back();

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;
    const loadOutlets = async () => {
      try {
        setError(null);
        const { data: whoami, error: whoamiError } = await supabase.rpc("whoami_roles");
        if (whoamiError) throw whoamiError;
        const record = (whoami?.[0] ?? null) as WhoAmIRoles | null;
        const outletList = record?.outlets ?? [];
        const mapped = outletList
          .filter((outlet) => outlet?.outlet_id)
          .map((outlet) => ({ id: outlet.outlet_id, name: outlet.outlet_name }));

        if (mapped.length === 0) {
          const { data: fallback, error: fallbackError } = await supabase.rpc("whoami_outlet");
          if (fallbackError) throw fallbackError;
          const fallbackOutlet = fallback?.[0] as { outlet_id: string; outlet_name: string } | undefined;
          if (fallbackOutlet?.outlet_id) {
            mapped.push({ id: fallbackOutlet.outlet_id, name: fallbackOutlet.outlet_name });
          }
        }

        if (!active) return;
        setOutlets(mapped);
        if (selectedOutletId === "all" && mapped.length === 1) {
          setSelectedOutletId(mapped[0].id);
        }
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      }
    };
    loadOutlets();
    return () => {
      active = false;
    };
  }, [status, supabase, selectedOutletId]);

  useEffect(() => {
    if (status !== "ok") return;
    if (!selectedDate) return;
    let active = true;
    const loadOrders = async () => {
      try {
        setLoading(true);
        setError(null);
        const start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 1);

        let query = supabase
          .from("orders")
          .select(
            "id,order_number,created_at,status,outlet_id,outlets(name),employee_signed_name,employee_signature_path,employee_signed_at,supervisor_signed_name,supervisor_signature_path,supervisor_signed_at,driver_signed_name,driver_signature_path,driver_signed_at,offloader_signed_name,offloader_signature_path,offloader_signed_at,created_by"
          )
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString())
          .order("created_at", { ascending: false });

        if (selectedOutletId !== "all") {
          query = query.eq("outlet_id", selectedOutletId);
        }

        const { data, error: ordersError } = await query;
        if (ordersError) throw ordersError;
        const rows = (data ?? []) as OrderRow[];

        const orderIds = rows.map((row) => row.id).filter(Boolean);
        const totalsMap: Record<string, OrderTotals> = {};

        if (orderIds.length > 0) {
          const { data: itemRows, error: itemsError } = await supabase
            .from("order_items")
            .select("order_id,name,receiving_uom,qty,cost,amount")
            .in("order_id", orderIds);
          if (itemsError) throw itemsError;
          (itemRows as OrderItemRow[]).forEach((row) => {
            const qty = row.qty ?? 0;
            const amount = row.amount ?? (row.cost ?? 0) * qty;
            const existing = totalsMap[row.order_id] ?? { qty: 0, amount: 0 };
            existing.qty += qty;
            existing.amount += amount;
            totalsMap[row.order_id] = existing;
          });
        }

        if (!active) return;
        setOrders(rows);
        setTotals(totalsMap);
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    };
    loadOrders();
    return () => {
      active = false;
    };
  }, [status, selectedDate, selectedOutletId, supabase]);

  const handleDownloadPdf = async (order: OrderRow) => {
    if ((order.status ?? "").toLowerCase() !== "offloaded") return;
    try {
      setPdfBusyId(order.id);
      setError(null);

      const orderId = order.id;
      const outletName = getOutletName(order) ?? "Outlet";
      const orderNumber = order.order_number ?? order.id.slice(0, 8);
      const createdAt = formatStamp(order.created_at);
      const placedBy = order.employee_signed_name || order.created_by || "-";

      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("order_id,name,receiving_uom,qty,cost,amount")
        .eq("order_id", orderId);
      if (itemsError) throw itemsError;

      const rows = (items as OrderItemRow[]).map((row) => {
        const qty = row.qty ?? 0;
        const cost = row.cost ?? 0;
        const amount = row.amount ?? cost * qty;
        return {
          name: row.name ?? "Item",
          qty,
          uom: row.receiving_uom ?? "each",
          cost,
          amount,
        };
      });

      const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
      const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

      const logoDataUrl = await loadLogoDataUrl();

      const signatureEntries = [
        {
          label: "Outlet Employee",
          name: order.employee_signed_name ?? "",
          signedAt: order.employee_signed_at ?? undefined,
          path: order.employee_signature_path ?? undefined,
        },
        {
          label: "Supervisor",
          name: order.supervisor_signed_name ?? "",
          signedAt: order.supervisor_signed_at ?? undefined,
          path: order.supervisor_signature_path ?? undefined,
        },
        {
          label: "Driver",
          name: order.driver_signed_name ?? "",
          signedAt: order.driver_signed_at ?? undefined,
          path: order.driver_signature_path ?? undefined,
        },
        {
          label: "Offloader",
          name: order.offloader_signed_name ?? "",
          signedAt: order.offloader_signed_at ?? undefined,
          path: order.offloader_signature_path ?? undefined,
        },
      ];

      const signatures = [] as Array<{ label: string; name: string; signedAt?: string; dataUrl?: string }>;
      for (const sig of signatureEntries) {
        let dataUrl: string | undefined;
        if (sig.path) {
          const { data: signed, error: signedError } = await supabase.storage
            .from("signatures")
            .createSignedUrl(sig.path, 3600);
          if (!signedError && signed?.signedUrl) {
            const resp = await fetch(signed.signedUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              dataUrl = await blobToDataUrl(blob);
            }
          }
        }
        signatures.push({ label: sig.label, name: sig.name, signedAt: sig.signedAt ?? undefined, dataUrl });
      }

      const html = buildOutletOrderPdfHtml({
        logoDataUrl,
        outletName,
        orderNumber,
        orderId,
        status: order.status ?? "",
        createdAt,
        placedBy,
        rows,
        signatures,
        totalQty,
        totalAmount,
      });

      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.setAttribute("aria-hidden", "true");
      document.body.appendChild(frame);

      const doc = frame.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(frame);
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      const cleanup = () => {
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      };

      setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(cleanup, 1000);
      }, 400);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setPdfBusyId(null);
    }
  };

  if (status !== "ok") return null;

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.grow}>
            <p className={styles.kicker}>AfterTen Logistics</p>
            <h1 className={styles.title}>Outlet Orders</h1>
            <p className={styles.subtitle}>Filter outlet orders by date and outlet. Download PDFs after offload.</p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={handleBackOne} className={styles.backButton}>Back</button>
            <button onClick={handleBack} className={styles.backButton}>Back to Dashboard</button>
          </div>
        </header>

        <section className={styles.filtersCard}>
          <label className={styles.filterLabel}>
            Date
            <input
              type="date"
              className={styles.input}
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
          <label className={styles.filterLabel}>
            Outlet
            <select
              className={styles.select}
              value={selectedOutletId}
              onChange={(event) => setSelectedOutletId(event.target.value)}
            >
              <option value="all">All outlets</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
          </label>
          {loading && <span className={styles.loadingTag}>Loading…</span>}
        </section>

        {error && <p className={styles.errorBanner}>{error}</p>}

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <p className={styles.tableTitle}>Orders</p>
              <p className={styles.tableSubtitle}>Showing {orders.length} orders</p>
            </div>
          </div>
          <div className={styles.table}>
            <div className={`${styles.tableRow} ${styles.tableHead}`}>
              <span>Order #</span>
              <span>Outlet</span>
              <span>Placed By</span>
              <span>Created</span>
              <span>Status</span>
              <span className={styles.alignRight}>Total Qty</span>
              <span className={styles.alignRight}>Total Amount</span>
              <span className={styles.alignCenter}>PDF</span>
            </div>
            {orders.map((order) => {
              const total = totals[order.id] ?? { qty: 0, amount: 0 };
              const statusText = order.status ?? "-";
              const canDownload = statusText.toLowerCase() === "offloaded";
              return (
                <div key={order.id} className={styles.tableRow}>
                  <span>{order.order_number ?? order.id.slice(0, 8)}</span>
                  <span>{getOutletName(order) ?? order.outlet_id ?? "-"}</span>
                  <span>{order.employee_signed_name ?? order.created_by ?? "-"}</span>
                  <span>{formatStamp(order.created_at)}</span>
                  <span className={styles.statusTag}>{statusText}</span>
                  <span className={styles.alignRight}>{formatQty(total.qty)}</span>
                  <span className={styles.alignRight}>{formatMoney(total.amount)}</span>
                  <span className={styles.alignCenter}>
                    <button
                      type="button"
                      className={styles.pdfButton}
                      disabled={!canDownload || pdfBusyId === order.id}
                      onClick={() => handleDownloadPdf(order)}
                    >
                      {pdfBusyId === order.id ? "Preparing…" : "Download"}
                    </button>
                  </span>
                </div>
              );
            })}
            {!loading && orders.length === 0 && (
              <div className={styles.emptyState}>No orders found for the current filters.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
