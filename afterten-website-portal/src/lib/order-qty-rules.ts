const QTY_STEP_BY_PRODUCT_ID: Record<string, number> = {};

export function getOrderQtyStep(productId: string | null | undefined): number {
  const key = String(productId ?? "").trim();
  return QTY_STEP_BY_PRODUCT_ID[key] ?? 1;
}

export function normalizeOrderQty(qty: number, productId: string | null | undefined): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const step = getOrderQtyStep(productId);
  if (step <= 1) return Math.floor(qty);
  return Math.max(step, Math.round(qty / step) * step);
}

export function bumpOrderQty(
  currentQty: number,
  productId: string | null | undefined,
  direction: 1 | -1,
): number {
  const step = getOrderQtyStep(productId);
  if (step <= 1) {
    return Math.max(0, currentQty + direction);
  }
  if (direction > 0) {
    return currentQty <= 0 ? step : currentQty + step;
  }
  return currentQty <= step ? 0 : currentQty - step;
}
