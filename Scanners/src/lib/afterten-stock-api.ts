export const AFTERTEN_STOCK_API_BASE_URL =
  "https://afterten-stock-api-896827614552.us-central1.run.app";

export const AFTERTEN_STOCK_RECEIVE_MOVEMENTS_PATH = "/stock/movements?type=receive";

export type StockMovementRaw = {
  _id?: string | null;
  lotId?: string | null;
  productId?: string | null;
  productName?: string | null;
  sku?: string | null;
  variantSku?: string | null;
  itemSku?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  qty?: number | string | null;
  unitCost?: number | string | null;
  totalCost?: number | string | null;
  ref?: { invoiceId?: string | null } | null;
  by?: { name?: string | null } | null;
  supplier?: { name?: string | null } | null;
  supplierName?: string | null;
  supplier_name?: string | null;
  vendorName?: string | null;
  at?: string | null;
};

export type StockMovementRow = {
  movement_id: string;
  product_name: string | null;
  warehouse_name: string | null;
  supplier_name: string | null;
  qty: number | null;
  unit_cost: number | null;
  total_cost: number | null;
  movement_at: string | null;
  invoice_id: string | null;
  operator_name: string | null;
  sku: string | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolvePurchasesApiToken(headerToken?: string | null): string | null {
  const envToken = process.env.Afterten_Purchases_Api_Token?.trim();
  const fromHeader = headerToken?.trim();
  if (envToken) return envToken;
  if (process.env.NODE_ENV !== "production" && fromHeader) return fromHeader;
  return null;
}

export function readSupplierName(raw: StockMovementRaw): string | null {
  return (
    cleanText(raw.supplier?.name) ??
    cleanText(raw.supplierName) ??
    cleanText(raw.supplier_name) ??
    cleanText(raw.vendorName)
  );
}

export function normalizeStockMovement(raw: StockMovementRaw): StockMovementRow | null {
  const movementId = cleanText(raw._id);
  if (!movementId) return null;

  return {
    movement_id: movementId,
    product_name: cleanText(raw.productName),
    warehouse_name: cleanText(raw.warehouseName),
    supplier_name: readSupplierName(raw),
    qty: cleanNumber(raw.qty),
    unit_cost: cleanNumber(raw.unitCost),
    total_cost: cleanNumber(raw.totalCost),
    movement_at: cleanText(raw.at),
    invoice_id: cleanText(raw.ref?.invoiceId),
    operator_name: cleanText(raw.by?.name),
    sku: cleanText(raw.variantSku) ?? cleanText(raw.itemSku) ?? cleanText(raw.sku),
  };
}

export async function fetchReceiveMovements(token: string): Promise<StockMovementRaw[]> {
  const response = await fetch(`${AFTERTEN_STOCK_API_BASE_URL}${AFTERTEN_STOCK_RECEIVE_MOVEMENTS_PATH}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText || "Stock API request failed");
  }

  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.items) ? (payload.items as StockMovementRaw[]) : [];
}

export function filterStockMovements(
  rows: StockMovementRow[],
  filters: {
    warehouseName?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    timeFrom?: string | null;
    timeTo?: string | null;
    productSearch?: string | null;
  },
): StockMovementRow[] {
  const warehouseNeedle = filters.warehouseName?.trim().toLowerCase() || "";
  const searchNeedle = filters.productSearch?.trim().toLowerCase() || "";

  const startMs = filters.startDate
    ? Date.parse(`${filters.startDate}T00:00:00`)
    : Number.NaN;
  const endMs = filters.endDate
    ? Date.parse(`${filters.endDate}T23:59:59`)
    : Number.NaN;

  return rows.filter((row) => {
    if (warehouseNeedle) {
      const warehouse = (row.warehouse_name ?? "").toLowerCase();
      if (!warehouse.includes(warehouseNeedle)) return false;
    }

    if (row.movement_at && (Number.isFinite(startMs) || Number.isFinite(endMs))) {
      const atMs = Date.parse(row.movement_at);
      if (Number.isFinite(atMs)) {
        if (Number.isFinite(startMs) && atMs < startMs) return false;
        if (Number.isFinite(endMs) && atMs > endMs) return false;
      }
    }

    if (row.movement_at && (filters.timeFrom || filters.timeTo)) {
      const d = new Date(row.movement_at);
      if (!Number.isNaN(d.getTime())) {
        const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        if (filters.timeFrom && hhmm < filters.timeFrom) return false;
        if (filters.timeTo && hhmm > filters.timeTo) return false;
      }
    }

    if (searchNeedle) {
      const haystack = [
        row.product_name,
        row.warehouse_name,
        row.supplier_name,
        row.operator_name,
        row.invoice_id,
        row.sku,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchNeedle)) return false;
    }

    return true;
  });
}
