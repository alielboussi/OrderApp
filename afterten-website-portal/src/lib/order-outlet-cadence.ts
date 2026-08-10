/** Keep in sync with order-outlet-cadence.ts in afterten-orders-expo and firebase/functions. */

export type OutletOrderCadenceRule = {
  maxQty: number;
  windowDays: number;
};

export const OUTLET_CADENCE_FF78671B_PRODUCT_ID = "ff78671b-1673-42c5-a0cb-2ae70982e684";
export const OUTLET_CADENCE_42371178_PRODUCT_ID = "42371178-5520-4916-ad73-fc556e5e3c6d";
export const OUTLET_CADENCE_35F0A274_PRODUCT_ID = "35f0a274-d73a-46e5-b9dd-739b3644241f";
export const OUTLET_CADENCE_FD67BDDB_PRODUCT_ID = "fd67bddb-d5cf-4c66-8821-906ea4ee1d1f";
export const OUTLET_CADENCE_5F6ED112_PRODUCT_ID = "5f6ed112-297f-4c5a-9aee-0d2b81135634";

export const OUTLET_ORDER_CADENCE_BY_PRODUCT_ID: Record<string, OutletOrderCadenceRule> = {
  [OUTLET_CADENCE_FF78671B_PRODUCT_ID]: { maxQty: 2, windowDays: 7 },
  [OUTLET_CADENCE_42371178_PRODUCT_ID]: { maxQty: 1, windowDays: 2 },
  [OUTLET_CADENCE_35F0A274_PRODUCT_ID]: { maxQty: 3, windowDays: 3 },
  [OUTLET_CADENCE_FD67BDDB_PRODUCT_ID]: { maxQty: 2, windowDays: 7 },
  [OUTLET_CADENCE_5F6ED112_PRODUCT_ID]: { maxQty: 1, windowDays: 21 },
};

export const OUTLET_ORDER_CADENCE_PRODUCT_IDS = Object.keys(OUTLET_ORDER_CADENCE_BY_PRODUCT_ID);

export function getOutletOrderCadenceRule(productId: string | null | undefined): OutletOrderCadenceRule | null {
  const key = String(productId ?? "").trim();
  if (!key) return null;
  return OUTLET_ORDER_CADENCE_BY_PRODUCT_ID[key] ?? null;
}

export function isOutletOrderCadenceProduct(productId: string | null | undefined): boolean {
  return getOutletOrderCadenceRule(productId) != null;
}

export function getMaxOutletCadenceWindowDays(): number {
  return OUTLET_ORDER_CADENCE_PRODUCT_IDS.reduce((max, productId) => {
    const rule = OUTLET_ORDER_CADENCE_BY_PRODUCT_ID[productId];
    return Math.max(max, rule?.windowDays ?? 0);
  }, 0);
}

export function resolveOutletCadenceWindowStartMs(nowMs: number, windowDays: number): number {
  return nowMs - windowDays * 24 * 60 * 60 * 1000;
}

export type OutletCadenceOrderLine = {
  productId: string | null;
  qty: number;
  name?: string;
};

export type OutletCadenceOrderSnapshot = {
  id: string;
  createdAt: string;
  items: OutletCadenceOrderLine[];
};

function parseCreatedAtMs(createdAt: string): number | null {
  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sumOutletProductQtyInWindow(
  orders: OutletCadenceOrderSnapshot[],
  productId: string,
  windowStartMs: number,
  excludeOrderId?: string,
): number {
  let total = 0;
  for (const order of orders) {
    if (excludeOrderId && order.id === excludeOrderId) continue;
    const createdMs = parseCreatedAtMs(order.createdAt);
    if (createdMs == null || createdMs < windowStartMs) continue;
    for (const item of order.items) {
      if (String(item.productId ?? "").trim() === productId) {
        total += Number(item.qty ?? 0);
      }
    }
  }
  return total;
}

export function getOutletCadenceRemainingQty(
  productId: string,
  orderedQtyInWindow: number,
  nowMs: number = Date.now(),
): number | null {
  const rule = getOutletOrderCadenceRule(productId);
  if (!rule) return null;
  void nowMs;
  return Math.max(0, rule.maxQty - orderedQtyInWindow);
}

export function clampQtyToOutletCadence(
  productId: string,
  qty: number,
  orderedQtyInWindow: number,
): number {
  const rule = getOutletOrderCadenceRule(productId);
  if (!rule || qty <= 0) return qty;
  const remaining = getOutletCadenceRemainingQty(productId, orderedQtyInWindow);
  if (remaining == null) return qty;
  return Math.min(qty, remaining);
}

export function formatOutletCadenceWindowLabel(windowDays: number): string {
  if (windowDays === 21) return "3 weeks";
  if (windowDays === 7) return "7 days";
  if (windowDays === 1) return "1 day";
  return `${windowDays} days`;
}

export function formatOutletCadenceLimitMessage(
  productName: string,
  rule: OutletOrderCadenceRule,
  remaining: number,
): string {
  const windowLabel = formatOutletCadenceWindowLabel(rule.windowDays);
  if (remaining <= 0) {
    return `"${productName}" is limited to ${rule.maxQty} per outlet every ${windowLabel}. That limit has been reached.`;
  }
  if (remaining === 1) {
    return `"${productName}" is limited to ${rule.maxQty} per outlet every ${windowLabel}. You can order 1 more.`;
  }
  return `"${productName}" is limited to ${rule.maxQty} per outlet every ${windowLabel}. You can order up to ${remaining} more.`;
}

export type OutletCadenceViolation = {
  productId: string;
  productName: string;
  requestedQty: number;
  allowedQty: number;
  rule: OutletOrderCadenceRule;
};

export function findOutletCadenceViolations(
  orders: OutletCadenceOrderSnapshot[],
  items: OutletCadenceOrderLine[],
  options?: { excludeOrderId?: string; nowMs?: number },
): OutletCadenceViolation[] {
  const nowMs = options?.nowMs ?? Date.now();
  const excludeOrderId = options?.excludeOrderId;
  const requestedByProduct = new Map<string, { qty: number; name: string }>();

  for (const item of items) {
    const productId = String(item.productId ?? "").trim();
    if (!productId || !isOutletOrderCadenceProduct(productId)) continue;
    const qty = Number(item.qty ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const itemName = String(item.name ?? "").trim() || productId;
    const existing = requestedByProduct.get(productId);
    requestedByProduct.set(productId, {
      qty: (existing?.qty ?? 0) + qty,
      name: existing?.name ?? itemName,
    });
  }

  const violations: OutletCadenceViolation[] = [];
  for (const [productId, requested] of requestedByProduct.entries()) {
    const rule = getOutletOrderCadenceRule(productId);
    if (!rule) continue;
    const windowStartMs = resolveOutletCadenceWindowStartMs(nowMs, rule.windowDays);
    const orderedQty = sumOutletProductQtyInWindow(orders, productId, windowStartMs, excludeOrderId);
    const allowedQty = Math.max(0, rule.maxQty - orderedQty);
    if (requested.qty > allowedQty) {
      violations.push({
        productId,
        productName: requested.name,
        requestedQty: requested.qty,
        allowedQty,
        rule,
      });
    }
  }

  return violations;
}

export function buildOutletCadenceViolationMessage(violations: OutletCadenceViolation[]): string {
  if (violations.length === 0) return "";
  if (violations.length === 1) {
    const violation = violations[0];
    const windowLabel = formatOutletCadenceWindowLabel(violation.rule.windowDays);
    if (violation.allowedQty <= 0) {
      return `"${violation.productName}" is limited to ${violation.rule.maxQty} per outlet every ${windowLabel}. That limit has been reached.`;
    }
    return `"${violation.productName}" is limited to ${violation.rule.maxQty} per outlet every ${windowLabel}. Only ${violation.allowedQty} can be ordered now.`;
  }

  return violations
    .map((violation) => {
      const windowLabel = formatOutletCadenceWindowLabel(violation.rule.windowDays);
      if (violation.allowedQty <= 0) {
        return `"${violation.productName}" (${violation.rule.maxQty} / ${windowLabel})`;
      }
      return `"${violation.productName}" (max ${violation.allowedQty} now)`;
    })
    .join("; ");
}
