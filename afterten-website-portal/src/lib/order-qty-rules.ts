import type { PortalCatalogProduct, PortalOrderItem } from "@/lib/portal-transfer-order-edit";

export const FROZEN_WINGS_PRODUCT_ID = "ca6c3236-05e9-42ad-a771-1c03a25dd5f1";
export const RAW_CHICKEN_PIECES_PRODUCT_ID = "cd145afb-0994-4c67-bf42-a9db9c3cc3ef";
export const CHICKEN_SHAWARMA_TRAYS_PRODUCT_ID = "4313479e-0f97-4197-a638-bee916bf4a07";
export const SHAWARMA_BREAD_PRODUCT_ID = "738dad70-1667-47a9-965d-29cf9b8376bf";
export const SHAWARMA_PAPER_PRODUCT_ID = "581151dc-420d-4158-b8dd-604a4a612703";
export const BEEF_BURGER_PATTY_PRODUCT_ID = "84a62432-988c-4727-b4e0-40e5862e2a34";
export const BURGER_BREAD_PRODUCT_ID = "bdc3821e-1ea9-46ec-91f2-9ec4cb307b80";
export const PACKERS_30S_PRODUCT_ID = "36b40d08-d316-4896-ac0b-1d975b58bb0b";
export const GARLIC_SAUCE_CONTAINER_50ML_PRODUCT_ID = "5769bfc0-e22d-4577-a2bf-6b1ed34c655b";
export const ONION_RINGS_SAUCE_PRODUCT_ID = "efbf1a8d-ecbf-40ed-8fd0-c2b7a6f315b0";
export const ONION_RINGS_COATING_PRODUCT_ID = "2599ce11-3c51-498d-8aeb-9c1a09d27f61";
export const FAJITA_CHICKEN_PACKETS_PRODUCT_ID = "25ec621e-aab0-47b3-9ec2-7c2fd8e28996";
export const MOZZARELLA_CHEESE_PRODUCT_ID = "4c4e3685-e836-4490-98b0-84beaadb35b3";
export const LONG_BREAD_PRODUCT_ID = "207cc3cc-09d6-4abe-ae2d-031a2f13c595";
export const GREEN_PEPPER_PRODUCT_ID = "337bbf4a-5df8-42be-a936-b1dd2a5e8541";
export const QTY_STEP_25_PRODUCT_ID = "405807f9-03c9-401d-acb8-26980b492491";
export const QTY_STEP_20_PRODUCT_ID = "d550d20b-78f8-434f-a079-b7613cc00512";
export const QTY_STEP_1_PRODUCT_ID = "4b340326-5f47-492f-924b-4771e434ea60";
export const QTY_STEP_100_PRODUCT_ID = "9e566a0c-92f4-4934-99ea-57f3da77e141";
export const QTY_MAX_50_STEP_10_PRODUCT_ID = "65e592fd-8489-456a-87b0-e76ba3c057c2";
export const QTY_MAX_50_STEP_10_PRODUCT_ID_2 = "55884ca9-699a-46eb-bb15-239d17d5addf";
export const QTY_MAX_4_PRODUCT_ID = "3f7e0f3f-1dac-4cc1-9bac-7bad501a86ae";
export const ONE_TO_ONE_COMPANION_PRODUCT_ID = "2e9ba460-476f-4f64-9750-cae9d4ce71fe";
export const PER_PLASTIC_COMPANION_PRODUCT_ID = "3b3c6f8a-7766-491c-88c9-41d324d05174";

const TRAYS_KG_PER_BREAD_BATCH = 20;
const GREEN_PEPPER_PIECES_PER_FAJITA_BATCH = 5;
const FAJITA_PACKETS_PER_GREEN_PEPPER_BATCH = 10;
const BREAD_PLASTICS_PER_TRAYS_BATCH = 4;
const BREAD_PIECES_PER_PLASTIC = 30;
const BEEF_BURGER_PATTY_OUTLET_PIECES_PER_PACKET = 10;
const BEEF_BURGER_COMPANIONS_PER_PACKET = 10;
const COMPANIONS_PER_PLASTIC_ORDERED = 8;

const QTY_STEP_BY_PRODUCT_ID: Record<string, number> = {
  [FROZEN_WINGS_PRODUCT_ID]: 10,
  [RAW_CHICKEN_PIECES_PRODUCT_ID]: 10,
  [CHICKEN_SHAWARMA_TRAYS_PRODUCT_ID]: TRAYS_KG_PER_BREAD_BATCH,
  [BEEF_BURGER_PATTY_PRODUCT_ID]: BEEF_BURGER_PATTY_OUTLET_PIECES_PER_PACKET,
  [QTY_STEP_25_PRODUCT_ID]: 25,
  [QTY_STEP_20_PRODUCT_ID]: 20,
  [QTY_STEP_1_PRODUCT_ID]: 1,
  [QTY_STEP_100_PRODUCT_ID]: 100,
  [QTY_MAX_50_STEP_10_PRODUCT_ID]: 10,
  [QTY_MAX_50_STEP_10_PRODUCT_ID_2]: 10,
};

const MAX_ORDER_QTY_BY_PRODUCT_ID: Record<string, number> = {
  [QTY_MAX_50_STEP_10_PRODUCT_ID]: 50,
  [QTY_MAX_50_STEP_10_PRODUCT_ID_2]: 50,
  [QTY_MAX_4_PRODUCT_ID]: 4,
};

type CompanionLineRule = {
  companionProductId: string;
  computeQty: (sourceQty: number, sourceProductId: string) => number;
};

function beefBurgerPattyPacketCount(qty: number, sourceProductId: string): number {
  const normalized = normalizeOrderQty(qty, sourceProductId);
  if (normalized <= 0) return 0;
  return normalized / BEEF_BURGER_PATTY_OUTLET_PIECES_PER_PACKET;
}

function chickenShawarmaBreadQty(qty: number, sourceProductId: string): number {
  const normalized = normalizeOrderQty(qty, sourceProductId);
  if (normalized <= 0) return 0;
  return (normalized / TRAYS_KG_PER_BREAD_BATCH) * BREAD_PLASTICS_PER_TRAYS_BATCH;
}

function chickenShawarmaPaperQty(qty: number, sourceProductId: string): number {
  return chickenShawarmaBreadQty(qty, sourceProductId) * BREAD_PIECES_PER_PLASTIC;
}

function matchingOutletCompanionQty(qty: number, sourceProductId: string): number {
  return normalizeOrderQty(qty, sourceProductId);
}

function perPlasticCompanionQty(qty: number, sourceProductId: string): number {
  const normalized = normalizeOrderQty(qty, sourceProductId);
  if (normalized <= 0) return 0;
  return normalized * COMPANIONS_PER_PLASTIC_ORDERED;
}

const oneToOneCompanionRule: CompanionLineRule = {
  companionProductId: ONE_TO_ONE_COMPANION_PRODUCT_ID,
  computeQty: (qty, sourceProductId) => matchingOutletCompanionQty(qty, sourceProductId),
};

const perPlasticCompanionRule: CompanionLineRule = {
  companionProductId: PER_PLASTIC_COMPANION_PRODUCT_ID,
  computeQty: (qty, sourceProductId) => perPlasticCompanionQty(qty, sourceProductId),
};

const COMPANION_RULES_BY_SOURCE: Record<string, CompanionLineRule[]> = {
  [QTY_STEP_25_PRODUCT_ID]: [oneToOneCompanionRule],
  [QTY_STEP_20_PRODUCT_ID]: [oneToOneCompanionRule],
  [FROZEN_WINGS_PRODUCT_ID]: [oneToOneCompanionRule],
  [RAW_CHICKEN_PIECES_PRODUCT_ID]: [oneToOneCompanionRule],
  [QTY_STEP_1_PRODUCT_ID]: [perPlasticCompanionRule],
  [CHICKEN_SHAWARMA_TRAYS_PRODUCT_ID]: [
    {
      companionProductId: SHAWARMA_BREAD_PRODUCT_ID,
      computeQty: (qty, sourceProductId) => chickenShawarmaBreadQty(qty, sourceProductId),
    },
    {
      companionProductId: SHAWARMA_PAPER_PRODUCT_ID,
      computeQty: (qty, sourceProductId) => chickenShawarmaPaperQty(qty, sourceProductId),
    },
  ],
  [BEEF_BURGER_PATTY_PRODUCT_ID]: [
    {
      companionProductId: BURGER_BREAD_PRODUCT_ID,
      computeQty: (qty, sourceProductId) =>
        beefBurgerPattyPacketCount(qty, sourceProductId) * BEEF_BURGER_COMPANIONS_PER_PACKET,
    },
    {
      companionProductId: PACKERS_30S_PRODUCT_ID,
      computeQty: (qty, sourceProductId) =>
        beefBurgerPattyPacketCount(qty, sourceProductId) * BEEF_BURGER_COMPANIONS_PER_PACKET,
    },
    {
      companionProductId: GARLIC_SAUCE_CONTAINER_50ML_PRODUCT_ID,
      computeQty: (qty, sourceProductId) =>
        beefBurgerPattyPacketCount(qty, sourceProductId) * BEEF_BURGER_COMPANIONS_PER_PACKET,
    },
    {
      companionProductId: ONION_RINGS_SAUCE_PRODUCT_ID,
      computeQty: (qty, sourceProductId) => beefBurgerPattyPacketCount(qty, sourceProductId),
    },
    {
      companionProductId: ONION_RINGS_COATING_PRODUCT_ID,
      computeQty: (qty, sourceProductId) => beefBurgerPattyPacketCount(qty, sourceProductId),
    },
  ],
  [FAJITA_CHICKEN_PACKETS_PRODUCT_ID]: [
    {
      companionProductId: MOZZARELLA_CHEESE_PRODUCT_ID,
      computeQty: (qty, sourceProductId) => normalizeOrderQty(qty, sourceProductId),
    },
    {
      companionProductId: LONG_BREAD_PRODUCT_ID,
      computeQty: (qty, sourceProductId) => normalizeOrderQty(qty, sourceProductId),
    },
    {
      companionProductId: GREEN_PEPPER_PRODUCT_ID,
      computeQty: (qty, sourceProductId) => {
        const normalized = normalizeOrderQty(qty, sourceProductId);
        if (normalized <= 0) return 0;
        return Math.ceil(
          (normalized * GREEN_PEPPER_PIECES_PER_FAJITA_BATCH) / FAJITA_PACKETS_PER_GREEN_PEPPER_BATCH,
        );
      },
    },
  ],
};

const COMPANION_PRODUCT_IDS = new Set(
  Object.values(COMPANION_RULES_BY_SOURCE).flatMap((rules) =>
    rules.map((rule) => rule.companionProductId),
  ),
);

const COMPANION_FALLBACK_NAMES: Record<string, string> = {
  [SHAWARMA_BREAD_PRODUCT_ID]: "Shawarma Bread",
  [SHAWARMA_PAPER_PRODUCT_ID]: "Shawarma Paper",
  [BURGER_BREAD_PRODUCT_ID]: "Burger Bread",
  [PACKERS_30S_PRODUCT_ID]: "30 s Packers",
  [GARLIC_SAUCE_CONTAINER_50ML_PRODUCT_ID]: "Garlic Sauce Container (50ml)",
  [ONION_RINGS_SAUCE_PRODUCT_ID]: "Onion Rings Sauce",
  [ONION_RINGS_COATING_PRODUCT_ID]: "Onion Rings Coating",
  [MOZZARELLA_CHEESE_PRODUCT_ID]: "Mozzarella",
  [LONG_BREAD_PRODUCT_ID]: "Long Bread",
  [GREEN_PEPPER_PRODUCT_ID]: "Green Pepper",
  [ONE_TO_ONE_COMPANION_PRODUCT_ID]: "Companion item",
  [PER_PLASTIC_COMPANION_PRODUCT_ID]: "Companion item",
};

const COMPANION_FALLBACK_UOMS: Record<string, string> = {
  [SHAWARMA_BREAD_PRODUCT_ID]: "plastic",
  [SHAWARMA_PAPER_PRODUCT_ID]: "Packet(s)",
  [BURGER_BREAD_PRODUCT_ID]: "pc",
  [PACKERS_30S_PRODUCT_ID]: "pc",
  [GARLIC_SAUCE_CONTAINER_50ML_PRODUCT_ID]: "packet",
  [ONION_RINGS_SAUCE_PRODUCT_ID]: "portion",
  [ONION_RINGS_COATING_PRODUCT_ID]: "portion",
  [MOZZARELLA_CHEESE_PRODUCT_ID]: "packet",
  [LONG_BREAD_PRODUCT_ID]: "pc",
  [GREEN_PEPPER_PRODUCT_ID]: "pc",
  [ONE_TO_ONE_COMPANION_PRODUCT_ID]: "pc",
  [PER_PLASTIC_COMPANION_PRODUCT_ID]: "pc",
};

function getCompanionRulesForSource(sourceProductId: string): CompanionLineRule[] {
  return COMPANION_RULES_BY_SOURCE[String(sourceProductId ?? "").trim()] ?? [];
}

export function getAllCompanionProductIds(): ReadonlySet<string> {
  return COMPANION_PRODUCT_IDS;
}

export function getCompanionProductIdsForAllowlistedSources(
  sourceProductIds: Iterable<string>,
): string[] {
  const ids = new Set<string>();
  for (const sourceProductId of sourceProductIds) {
    for (const rule of getCompanionRulesForSource(sourceProductId)) {
      ids.add(rule.companionProductId);
    }
  }
  return [...ids];
}

export function getCompanionProductIdsForSourceProduct(sourceProductId: string): string[] {
  return getCompanionRulesForSource(sourceProductId).map((rule) => rule.companionProductId);
}

export function getOrderQtyStep(productId: string | null | undefined): number {
  const key = String(productId ?? "").trim();
  return QTY_STEP_BY_PRODUCT_ID[key] ?? 1;
}

export function getOrderMaxQty(productId: string | null | undefined): number | null {
  const key = String(productId ?? "").trim();
  const max = MAX_ORDER_QTY_BY_PRODUCT_ID[key];
  if (!Number.isFinite(max) || max <= 0) return null;
  return max;
}

function capOrderQty(qty: number, productId: string | null | undefined): number {
  const max = getOrderMaxQty(productId);
  if (max == null || qty <= 0) return qty;
  return Math.min(qty, max);
}

export function normalizeOrderQty(qty: number, productId: string | null | undefined): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const step = getOrderQtyStep(productId);
  const normalized =
    step <= 1 ? Math.floor(qty) : Math.max(step, Math.round(qty / step) * step);
  return capOrderQty(normalized, productId);
}

export function bumpOrderQty(
  currentQty: number,
  productId: string | null | undefined,
  direction: 1 | -1,
): number {
  const step = getOrderQtyStep(productId);
  let next: number;
  if (step <= 1) {
    next = Math.max(0, currentQty + direction);
  } else if (direction > 0) {
    next = currentQty <= 0 ? step : currentQty + step;
  } else {
    next = currentQty <= step ? 0 : currentQty - step;
  }
  return capOrderQty(next, productId);
}

export function isCompanionProduct(productId: string | null | undefined): boolean {
  const key = String(productId ?? "").trim();
  return key.length > 0 && COMPANION_PRODUCT_IDS.has(key);
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
  const uom = COMPANION_FALLBACK_UOMS[productId] ?? source.receiving_uom ?? source.consumption_uom ?? "each";
  const cost = Number(source.cost ?? 0);
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

function applyCompanionRulesToPortalItems(
  items: PortalOrderItem[],
  catalog: PortalCatalogProduct[],
  orderId: string,
  sourceProductId: string,
  sourceQty: number,
): PortalOrderItem[] {
  const rules = getCompanionRulesForSource(sourceProductId);
  if (rules.length === 0) return items;

  const companionIds = new Set(rules.map((rule) => rule.companionProductId));
  let result = items;
  const sourceItem = items.find((item) => item.product_id === sourceProductId);

  if (sourceQty <= 0) {
    return result.filter((item) => !companionIds.has(String(item.product_id ?? "").trim()));
  }

  if (!sourceItem) return result;

  for (const rule of rules) {
    const companionQty = rule.computeQty(sourceQty, sourceProductId);
    const existingIndex = result.findIndex((item) => item.product_id === rule.companionProductId);

    if (companionQty <= 0) {
      if (existingIndex >= 0) {
        result = result.filter((_, index) => index !== existingIndex);
      }
      continue;
    }

    const companionItem = resolveCompanionItem(
      orderId,
      rule.companionProductId,
      catalog,
      sourceItem,
      companionQty,
    );

    if (existingIndex >= 0) {
      result = result.map((item, index) =>
        index === existingIndex ? withQty(item, companionQty) : item,
      );
    } else {
      result = [...result, companionItem];
    }
  }

  return result;
}

export function expandPortalOrderItemsWithCompanions(
  items: PortalOrderItem[],
  catalog: PortalCatalogProduct[],
  orderId: string,
): PortalOrderItem[] {
  let result = [...items];

  for (const [sourceProductId, rules] of Object.entries(COMPANION_RULES_BY_SOURCE)) {
    const sourceItem = result.find((item) => item.product_id === sourceProductId);
    if (!sourceItem || (sourceItem.qty ?? 0) <= 0) continue;

    for (const rule of rules) {
      const companionQty = rule.computeQty(sourceItem.qty ?? 0, sourceProductId);
      const existingIndex = result.findIndex((item) => item.product_id === rule.companionProductId);
      if (existingIndex >= 0) {
        result[existingIndex] = withQty(result[existingIndex], companionQty);
        continue;
      }

      result = [
        ...result,
        resolveCompanionItem(orderId, rule.companionProductId, catalog, sourceItem, companionQty),
      ];
    }
  }

  return result;
}

export function syncCompanionPortalOrderItems(
  items: PortalOrderItem[],
  catalog: PortalCatalogProduct[],
  orderId: string,
  sourceProductId: string,
  sourceQty: number,
): PortalOrderItem[] {
  return applyCompanionRulesToPortalItems(items, catalog, orderId, sourceProductId, sourceQty);
}
