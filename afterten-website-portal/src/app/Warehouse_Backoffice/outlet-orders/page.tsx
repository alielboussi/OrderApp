"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchSellingOutlets } from "@/lib/warehouse-outlet-api";
import { getWarehouseAccessToken } from "@/lib/warehouse-auth-client";
import { formatTransferOrderDateKey } from "@/lib/transfer-order-dates";
import {
  formatTransferOrderStatus,
  getTransferOrderStatusTone,
} from "@/lib/transfer-order-status";
import { buildOutletOrderPdfFilename, buildOutletOrderPdfHtml, formatOutletOrderMoney } from "@/lib/outlet-order-pdf";
import {
  resolveBaseProductNameFromCatalog,
  sumPortalOrderItems,
  type PortalCatalogProduct,
  type PortalOrderItem,
} from "@/lib/portal-transfer-order-edit";
import { useWarehouseAuth } from "../useWarehouseAuth";
import { OrderExpandPanel } from "./OrderExpandPanel";
import eb from "../enterprise.module.css";
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
  outlets?: { name?: string | null } | Array<{ name?: string | null }> | null;
  employee_signed_name?: string | null;
  employee_signature_path?: string | null;
  employee_signature_data?: string | null;
  employee_signed_at?: string | null;
  supervisor_signed_name?: string | null;
  supervisor_signature_path?: string | null;
  supervisor_signed_at?: string | null;
  driver_signed_name?: string | null;
  driver_signature_path?: string | null;
  driver_signature_data?: string | null;
  driver_signed_at?: string | null;
  offloader_signed_name?: string | null;
  offloader_signature_path?: string | null;
  offloader_signature_data?: string | null;
  offloader_signed_at?: string | null;
  created_by?: string | null;
};

type OrderItemRow = {
  order_id: string;
  product_id?: string | null;
  variant_key?: string | null;
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

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function getOutletName(order: OrderRow, nameById?: ReadonlyMap<string, string>): string {
  const embedded = order.outlets;
  if (embedded) {
    if (Array.isArray(embedded)) {
      const name = embedded[0]?.name?.trim();
      if (name) return name;
    } else {
      const name = embedded.name?.trim();
      if (name) return name;
    }
  }
  if (order.outlet_id && nameById?.has(order.outlet_id)) {
    return nameById.get(order.outlet_id)!;
  }
  return order.outlet_id ?? "-";
}

function PdfIcon() {
  return (
    <svg className={styles.pdfIconSvg} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#DC2626"
        d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-1 16H6V4h7v5h5v10Z"
      />
      <path
        fill="#FFFFFF"
        d="M8.5 11h1.5v5H8.5v-5Zm3.25 0H10v5h1.25l1.75-2.92V16H14v-5h-1.5l-1.75 2.92V11h-1.5Z"
      />
    </svg>
  );
}

async function loadLogoDataUrl(): Promise<string | undefined> {
  const candidates = ["/Logo.jpg", "/afterten-logo.png", "/afterten_logo.png"];
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

function inlineSignatureDataUrl(data?: string | null): string | undefined {
  const trimmed = data?.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("data:") ? trimmed : `data:image/png;base64,${trimmed}`;
}

async function resolveSignatureDataUrl(options: {
  path?: string | null;
  inlineData?: string | null;
}): Promise<string | undefined> {
  const inline = inlineSignatureDataUrl(options.inlineData);
  if (inline) return inline;
  if (!options.path?.trim()) return undefined;

  const signRes = await fetch(`/api/outlet-orders/signature?path=${encodeURIComponent(options.path)}`, {
    cache: "no-store",
  });
  if (!signRes.ok) return undefined;

  const signJson = (await signRes.json()) as { signed_url?: string | null };
  if (!signJson.signed_url) return undefined;

  const resp = await fetch(signJson.signed_url);
  if (!resp.ok) return undefined;
  const blob = await resp.blob();
  return blobToDataUrl(blob);
}

function OutletOrdersPage() {
  const searchParams = useSearchParams();
  const { status } = useWarehouseAuth();

  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>(() => formatTransferOrderDateKey(new Date()));
  const [orderQuery, setOrderQuery] = useState<string>("");
  const [initialQueryApplied, setInitialQueryApplied] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [totals, setTotals] = useState<Record<string, OrderTotals>>({});
  const [loading, setLoading] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const handleOrderSaved = useCallback((orderId: string, items: PortalOrderItem[]) => {
    const totalsForOrder = sumPortalOrderItems(items);
    setTotals((current) => ({ ...current, [orderId]: totalsForOrder }));
    setError(null);
  }, []);

  const loadOrders = useCallback(async (options?: { silent?: boolean }) => {
    if (status !== "ok" || !selectedDate) return;

    try {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);

      const params = new URLSearchParams();
      params.set("date", selectedDate);
      if (selectedOutletId !== "all") {
        params.set("outlet_id", selectedOutletId);
      }

      const res = await fetch(`/api/outlet-orders?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as {
        orders?: OrderRow[];
        totals?: Record<string, OrderTotals>;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Unable to load orders");

      setOrders(json.orders ?? []);
      setTotals(json.totals ?? {});
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [selectedDate, selectedOutletId, status]);

  const outletNameById = useMemo(() => {
    const map = new Map<string, string>();
    outlets.forEach((outlet) => {
      if (outlet.id && outlet.name) map.set(outlet.id, outlet.name);
    });
    return map;
  }, [outlets]);

  useEffect(() => {
    if (initialQueryApplied) return;
    const outletId = searchParams.get("outletId");
    const date = searchParams.get("date");
    const orderNumber = searchParams.get("orderNumber");
    const orderId = searchParams.get("orderId");

    if (outletId) setSelectedOutletId(outletId);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) setSelectedDate(date);

    const combined = orderNumber || orderId;
    if (combined) setOrderQuery(combined);

    setInitialQueryApplied(true);
  }, [initialQueryApplied, searchParams]);

  useEffect(() => {
    if (status !== "ok") return;
    let active = true;
    const loadOutlets = async () => {
      try {
        setError(null);
        const mapped = await fetchSellingOutlets("selling");

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
  }, [status, selectedOutletId]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders, refreshKey]);

  useEffect(() => {
    if (status !== "ok" || !selectedDate) return;
    const intervalId = window.setInterval(() => {
      void loadOrders({ silent: true });
    }, 20000);
    return () => window.clearInterval(intervalId);
  }, [loadOrders, selectedDate, status]);

  useEffect(() => {
    const handleFocus = () => setRefreshKey((current) => current + 1);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const handleDeleteOrder = async (order: OrderRow) => {
    const orderLabel = order.order_number ?? order.id.slice(0, 8);
    const confirmed = window.confirm(
      `Delete order ${orderLabel}?\n\nThis permanently removes the order and its line items.`,
    );
    if (!confirmed) return;

    try {
      setDeleteBusyId(order.id);
      setError(null);
      const token = await getWarehouseAccessToken();
      if (!token) throw new Error("Not signed in");

      const res = await fetch(`/api/outlet-orders/${encodeURIComponent(order.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Unable to delete order");

      setOrders((current) => current.filter((row) => row.id !== order.id));
      setTotals((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setDeleteBusyId(null);
    }
  };

  const handleDownloadPdf = async (order: OrderRow) => {
    try {
      setPdfBusyId(order.id);
      setError(null);

      const orderId = order.id;
      const outletNameRaw = getOutletName(order, outletNameById);
      const outletName = outletNameRaw === "-" ? "Outlet" : outletNameRaw;
      const orderNumber = order.order_number ?? order.id.slice(0, 8);
      const createdAt = formatStamp(order.created_at);
      const placedBy = order.employee_signed_name || order.created_by || "-";

      const itemsRes = await fetch(`/api/outlet-orders/${encodeURIComponent(orderId)}/items`, { cache: "no-store" });
      const itemsJson = (await itemsRes.json()) as { items?: OrderItemRow[]; error?: string };
      if (!itemsRes.ok) throw new Error(itemsJson.error || "Unable to load order items");

      let catalog: PortalCatalogProduct[] = [];
      if (order.outlet_id) {
        try {
          const catalogRes = await fetch(
            `/api/outlet-orders/catalog?outlet_id=${encodeURIComponent(order.outlet_id)}`,
            { cache: "no-store" },
          );
          const catalogJson = (await catalogRes.json()) as { catalog?: PortalCatalogProduct[] };
          if (catalogRes.ok) {
            catalog = catalogJson.catalog ?? [];
          }
        } catch {
          catalog = [];
        }
      }

      const items = (itemsJson.items ?? []).map((row) => {
        const qty = row.qty ?? 0;
        const cost = row.cost ?? 0;
        const amount = row.amount ?? cost * qty;
        const portalItem: PortalOrderItem = {
          id: row.order_id,
          order_id: row.order_id,
          product_id: row.product_id ?? null,
          variant_key: row.variant_key ?? null,
          name: row.name ?? "Item",
          receiving_uom: row.receiving_uom,
          consumption_uom: null,
          qty,
          cost,
          amount,
          package_contains: null,
        };
        return {
          name: row.name ?? "Item",
          productId: row.product_id ?? null,
          variantKey: row.variant_key ?? null,
          productName: resolveBaseProductNameFromCatalog(row.product_id, catalog, portalItem) || undefined,
          qty,
          uom: row.receiving_uom ?? "each",
          cost,
          amount,
        };
      });

      const totalQty = items.reduce((sum, row) => sum + row.qty, 0);
      const totalAmount = items.reduce((sum, row) => sum + row.amount, 0);

      const logoDataUrl = await loadLogoDataUrl();

      const signatureEntries = [
        {
          role: "employee" as const,
          name: order.employee_signed_name ?? "",
          signedAt: order.employee_signed_at ? formatStamp(order.employee_signed_at) : undefined,
          path: order.employee_signature_path ?? undefined,
          inlineData: order.employee_signature_data ?? undefined,
        },
        {
          role: "driver" as const,
          name: order.driver_signed_name ?? "",
          signedAt: order.driver_signed_at ? formatStamp(order.driver_signed_at) : undefined,
          path: order.driver_signature_path ?? undefined,
          inlineData: order.driver_signature_data ?? undefined,
        },
        {
          role: "offloader" as const,
          name: order.offloader_signed_name ?? "",
          signedAt: order.offloader_signed_at ? formatStamp(order.offloader_signed_at) : undefined,
          path: order.offloader_signature_path ?? undefined,
          inlineData: order.offloader_signature_data ?? undefined,
        },
      ];

      const signatures = [] as Array<{
        role: "employee" | "driver" | "offloader";
        name: string;
        signedAt?: string;
        dataUrl?: string;
      }>;
      for (const sig of signatureEntries) {
        const dataUrl = await resolveSignatureDataUrl({
          path: sig.path,
          inlineData: sig.inlineData,
        });
        signatures.push({
          role: sig.role,
          name: sig.name,
          signedAt: sig.signedAt,
          dataUrl,
        });
      }

      const downloadFilename = buildOutletOrderPdfFilename({
        outletName,
        createdAt: order.created_at,
        orderNumber,
      });

      const html = buildOutletOrderPdfHtml({
        logoDataUrl,
        outletName,
        orderNumber,
        orderId,
        status: formatTransferOrderStatus(order.status),
        createdAt,
        placedBy,
        items,
        signatures,
        totalQty,
        totalAmount,
        downloadFilename,
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

  const filteredOrders = useMemo(() => {
    const query = orderQuery.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter((order) => {
      const orderNumber = (order.order_number ?? order.id).toLowerCase();
      return orderNumber.includes(query) || order.id.toLowerCase().includes(query);
    });
  }, [orders, orderQuery]);

  if (status !== "ok") {
    return (
      <section className={eb.pageCard}>
        <p className={eb.pageCardBody}>Not authorized for outlet orders.</p>
      </section>
    );
  }

  return (
    <div className={styles.shell}>
      <section className={eb.pageCard}>
        <div className={eb.sectionHeaderBlue}>
          <h3 className={eb.pageCardTitle} style={{ margin: 0 }}>
            Outlet orders
          </h3>
          <p className={eb.pageCardBody}>
            Warehouse orders placed from the Afterten Orders Android app (excludes POS sync bills).
          </p>
        </div>
      </section>

      <section className={eb.pageCard}>
        <div className={styles.filtersCard}>
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
          <label className={styles.filterLabel}>
            Order # contains
            <input
              className={styles.input}
              value={orderQuery}
              onChange={(event) => setOrderQuery(event.target.value)}
              placeholder="Search order number"
            />
          </label>
          <button
            type="button"
            className={styles.refreshButton}
            disabled={loading}
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          {loading && <span className={styles.loadingTag}>Loading…</span>}
        </div>
      </section>

      {error && (
        <section className={eb.pageCard}>
          <p className={styles.errorBanner}>{error}</p>
        </section>
      )}

      <section className={eb.pageCard}>
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <p className={styles.tableTitle}>Orders</p>
              <p className={styles.tableSubtitle}>Showing {filteredOrders.length} orders</p>
            </div>
          </div>
          <div className={styles.table}>
            <div className={`${styles.tableRow} ${styles.tableHead}`}>
              <span />
              <span>Order #</span>
              <span>Outlet</span>
              <span>Placed By</span>
              <span>Created</span>
              <span>Status</span>
              <span className={styles.alignRight}>Total Qty</span>
              <span className={styles.alignRight}>Total Amount</span>
              <span className={styles.alignCenter}>PDF</span>
              <span className={styles.alignCenter}>Delete</span>
            </div>
            {filteredOrders.map((order) => {
              const total = totals[order.id] ?? { qty: 0, amount: 0 };
              const statusText = formatTransferOrderStatus(order.status);
              const statusTone = getTransferOrderStatusTone(order.status);
              const query = orderQuery.trim().toLowerCase();
              const orderNumber = (order.order_number ?? order.id).toLowerCase();
              const isMatch = query.length > 0 && (orderNumber.includes(query) || order.id.toLowerCase().includes(query));
              const isExpanded = expandedOrderId === order.id;
              return (
                <div key={order.id} className={styles.orderBlock}>
                  <div className={`${styles.tableRow} ${isMatch ? styles.highlightRow : ""}`}>
                    <span className={styles.alignCenter}>
                      <button
                        type="button"
                        className={styles.expandButton}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? "Collapse order details" : "Expand order details"}
                        onClick={() =>
                          setExpandedOrderId((current) => (current === order.id ? null : order.id))
                        }
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>
                    </span>
                    <span>{order.order_number ?? order.id.slice(0, 8)}</span>
                    <span>{getOutletName(order, outletNameById)}</span>
                    <span>{order.employee_signed_name ?? order.created_by ?? "-"}</span>
                    <span>{formatStamp(order.created_at)}</span>
                    <span className={`${styles.statusTag} ${styles[`statusTag_${statusTone}`]}`}>
                      {statusText}
                    </span>
                    <span className={styles.alignRight}>{formatQty(total.qty)}</span>
                    <span className={styles.alignRight}>{formatOutletOrderMoney(total.amount)}</span>
                    <span className={styles.alignCenter}>
                      <button
                        type="button"
                        className={styles.pdfIconButton}
                        disabled={pdfBusyId === order.id}
                        aria-label={
                          pdfBusyId === order.id
                            ? `Preparing PDF for order ${order.order_number ?? order.id}`
                            : `Download PDF for order ${order.order_number ?? order.id}`
                        }
                        title="Download PDF"
                        onClick={() => void handleDownloadPdf(order)}
                      >
                        {pdfBusyId === order.id ? (
                          <span className={styles.pdfBusyDot} aria-hidden="true" />
                        ) : (
                          <PdfIcon />
                        )}
                      </button>
                    </span>
                    <span className={styles.alignCenter}>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        disabled={deleteBusyId === order.id}
                        onClick={() => void handleDeleteOrder(order)}
                      >
                        {deleteBusyId === order.id ? "Deleting…" : "Delete"}
                      </button>
                    </span>
                  </div>
                  {isExpanded ? (
                    <OrderExpandPanel
                      orderId={order.id}
                      outletId={order.outlet_id}
                      status={order.status}
                      onSaved={handleOrderSaved}
                      onError={setError}
                    />
                  ) : null}
                </div>
              );
            })}
            {!loading && filteredOrders.length === 0 && (
              <div className={styles.emptyState}>No orders found for the current filters.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function OutletOrdersPageWrapper() {
  return (
    <Suspense fallback={<section className={eb.pageCard}><p className={eb.pageCardBody}>Loading…</p></section>}>
      <OutletOrdersPage />
    </Suspense>
  );
}
