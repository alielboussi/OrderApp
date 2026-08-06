import type { PortalCatalogProduct, PortalOrderItem } from "@/lib/portal-transfer-order-edit";

export const FROZEN_WINGS_PRODUCT_ID = "ca6c3236-05e9-42ad-a771-1c03a25dd5f1";
export const RAW_CHICKEN_PIECES_PRODUCT_ID = "cd145afb-0994-4c67-bf42-a9db9c3cc3ef";
export const SLUSH_CUPS_350_PRODUCT_ID = "d54abc42-200b-40a7-96e8-3e5980677f32";
export const SLUSH_CUPS_500_PRODUCT_ID = "3a248921-64ee-495d-a90a-061412b93813";
export const SLUSH_CUP_LIDS_350_PRODUCT_ID = "e4d89763-03c5-45b5-ad04-dc94f8f2eb48";
export const SLUSH_CUP_LIDS_500_PRODUCT_ID = "8f0b9b8b-3826-4b80-ac09-d32dcb77ebbf";
export const PUFF_PIE_PRODUCT_ID = "61172398-0bf5-48d9-b493-b221d851f5e5";
export const CHICKEN_SHAWARMA_TRAYS_PRODUCT_ID = "4313479e-0f97-4197-a638-bee916bf4a07";
export const SHAWARMA_BREAD_PRODUCT_ID = "738dad70-1667-47a9-965d-29cf9b8376bf";

const QTY_STEP_BY_PRODUCT_ID: Record<string, number> = {
  [FROZEN_WINGS_PRODUCT_ID]: 10,
  [RAW_CHICKEN_PIECES_PRODUCT_ID]: 10,
  [PUFF_PIE_PRODUCT_ID]: 25,
  [CHICKEN_SHAWARMA_TRAYS_PRODUCT_ID]: 20,
  [SLUSH_CUPS_350_PRODUCT_ID]: 50,
  [SLUSH_CUPS_500_PRODUCT_ID]: 50,
  [SLUSH_CUP_LIDS_350_PRODUCT_ID]: 50,
  [SLUSH_CUP_LIDS_500_PRODUCT_ID]: 50,
};

type CompanionRule = {
  companionProductId: string;
  computeQty: (sourceQty: number) => number;
};

const COMPANION_RULES: Record<string, CompanionRule> = {
  [SLUSH_CUPS_350_PRODUCT_ID]: {
    companionProductId: SLUSH_CUP_LIDS_350_PRODUCT_ID,
    computeQty: (qty) => normalizeOrderQty(qty, SLUSH_CUP_LIDS_350_PRODUCT_ID),
  },
  [SLUSH_CUPS_500_PRODUCT_ID]: {
    companionProductId: SLUSH_CUP_LIDS_500_PRODUCT_ID,
    computeQty: (qty) => normalizeOrderQty(qty, SLUSH_CUP_LIDS_500_PRODUCT_ID),
  },
  [CHICKEN_SHAWARMA_TRAYS_PRODUCT_ID]: {
    companionProductId: SHAWARMA_BREAD_PRODUCT_ID,
    computeQty: (qty) => {
      const normalized = normalizeOrderQty(qty, CHICKEN_SHAWARMA_TRAYS_PRODUCT_ID);
      if (normalized <= 0) return 0;
      return (normalized / 20) * 4;
    },
  },
};

const COMPANION_FALLBACK_NAMES: Record<string, string> = {
  [SLUSH_CUP_LIDS_350_PRODUCT_ID]: "Slush Cup Lids 350mls",
  [SLUSH_CUP_LIDS_500_PRODUCT_ID]: "Slush Cup Lids 500mls",
  [SHAWARMA_BREAD_PRODUCT_ID]: "Shawarma Bread",
};

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

export function getCompanionProductId(sourceProductId: string): string | null {
  const key = String(sourceProductId ?? "").trim();
  return COMPANION_RULES[key]?.companionProductId ?? null;
}

/** @deprecated Use getCompanionProductId */
export function getSlushCupLidProductId(cupProductId: string): string | null {
  return getCompanionProductId(cupProductId);
}

function findCatalogProductByProductId(
  catalog: PortalCatalogProduct[],
  productId: string,
): PortalCatalogProduct | undefined {
  return catalog.find((product) => product.product_id === productId);
}

function buildFallbackPortalOrderItem(
  orderId: string,
  productId: string,
  source: PortalOrderItem,
  qty: number,
): PortalOrderItem {
  const name = COMPANION_FALLBACK_NAMES[productId] ?? "Companion item";
  const cost = Number(source.cost ?? 0);
  const uom = source.receiving_uom ?? source.consumption_uom ?? "each";
  return {
    id: `companion_${productId}`,
    order_id: orderId,
    product_id: productId,
    variant_key: null,
    name,
    receiving_uom: uom,
    consumption_uom: source.consumption_uom ?? uom,
    cost,
    qty,
    amount: qty * cost,
    package_contains: source.package_contains ?? 1,
  };
}

function buildPortalOrderItemFromCatalog(
  orderId: string,
  product: PortalCatalogProduct,
  qty: number,
): PortalOrderItem {
  const cost = Number(product.selling_price ?? 0);
  return {
    id: `companion_${product.product_id}_${orderId}`,
    order_id: orderId,
    product_id: product.product_id,
    variant_key: product.variant_key,
    name: product.name,
    receiving_uom: product.orders_app_uom,
    consumption_uom: product.consumption_uom,
    cost,
    qty,
    amount: qty * cost,
    package_contains: product.units_per_purchase_pack || 1,
  };
}

function resolveCompanionItem(
  orderId: string,
  companionProductId: string,
  catalog: PortalCatalogProduct[],
  source: PortalOrderItem,
  qty: number,
): PortalOrderItem {
  const catalogProduct = findCatalogProductByProductId(catalog, companionProductId);
  if (catalogProduct) {
    return buildPortalOrderItemFromCatalog(orderId, catalogProduct, qty);
  }
  return buildFallbackPortalOrderItem(orderId, companionProductId, source, qty);
}

function withQty(item: PortalOrderItem, qty: number): PortalOrderItem {
  const cost = Number(item.cost ?? 0);
  return {
    ...item,
    qty,
    amount: qty * cost,
  };
}

export function expandPortalOrderItemsWithCompanions(
  items: PortalOrderItem[],
  catalog: PortalCatalogProduct[],
  orderId: string,
): PortalOrderItem[] {
  const result = [...items];
  const indexByProductId = new Map<string, number>();
  for (let index = 0; index < result.length; index += 1) {
    const productId = String(result[index]?.product_id ?? "").trim();
    if (productId) indexByProductId.set(productId, index);
  }

  for (const [sourceProductId, rule] of Object.entries(COMPANION_RULES)) {
    const sourceIndex = indexByProductId.get(sourceProductId);
    if (sourceIndex == null) continue;
    const sourceItem = result[sourceIndex];
    if ((sourceItem.qty ?? 0) <= 0) continue;

    const companionQty = rule.computeQty(sourceItem.qty ?? 0);
    const existingIndex = indexByProductId.get(rule.companionProductId);
    if (existingIndex != null) {
      result[existingIndex] = withQty(result[existingIndex], companionQty);
      continue;
    }

    const companionItem = resolveCompanionItem(
      orderId,
      rule.companionProductId,
      catalog,
      sourceItem,
      companionQty,
    );
    indexByProductId.set(rule.companionProductId, result.length);
    result.push(companionItem);
  }

  return result;
}

export function syncCompanionPortalOrderItems(
  items: PortalOrderItem[],
  catalog: PortalCatalogProduct[],
  orderId: string,
  sourceProductId: string,
  qty: number,
): PortalOrderItem[] {
  const rule = COMPANION_RULES[String(sourceProductId ?? "").trim()];
  if (!rule) return items;

  const companionQty = rule.computeQty(qty);
  if (companionQty <= 0) {
    return items.filter((item) => item.product_id !== rule.companionProductId);
  }

  const existingIndex = items.findIndex((item) => item.product_id === rule.companionProductId);
  if (existingIndex >= 0) {
    return items.map((item, index) =>
      index === existingIndex ? withQty(item, companionQty) : item,
    );
  }

  const sourceItem = items.find((item) => item.product_id === sourceProductId);
  if (!sourceItem) return items;

  return [
    ...items,
    resolveCompanionItem(orderId, rule.companionProductId, catalog, sourceItem, companionQty),
  ];
}
