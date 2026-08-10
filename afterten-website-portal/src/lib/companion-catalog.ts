import { buildOutletOrderCatalogOrderFields, readCatalogOrderFieldsFromRow, resolveOrdersAppDisplayName } from "@/lib/catalog-order-fields";
import { resolveCatalogImageUrl } from "@/lib/catalog-image-url";
import {
  getAllCompanionProductIds,
  getCompanionProductIdsForAllowlistedSources,
} from "@/lib/order-qty-rules";
import { getFirestoreDb } from "@/lib/firebase-server";

export type CompanionCatalogRow = {
  id: string;
  product_id: string;
  product_name: string;
  variant_id: string | null;
  variant_key: string | null;
  name: string;
  selling_price: number;
  orders_app_uom: string;
  supervisor_uom: string;
  consumption_uom: string;
  units_per_purchase_pack: number;
  supervisor_uom_qty_per_unit: number;
  uom_weight_enabled: boolean;
  uom_weight_grams: number | null;
  image_url: string | null;
  orders_browse_visible: boolean;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function mapCatalogItemToCompanionRow(
  outletId: string,
  itemId: string,
  item: Record<string, unknown>,
): CompanionCatalogRow {
  const orderFields = readCatalogOrderFieldsFromRow(item);
  const catalogName = asText(item.name, "Companion item");
  const ordersAppName = resolveOrdersAppDisplayName(item, catalogName);
  const productImageUrl = resolveCatalogImageUrl(item.image_url as string | null | undefined);
  return {
    id: `${outletId}_${itemId}`,
    product_id: itemId,
    product_name: catalogName,
    variant_id: null,
    variant_key: null,
    name: ordersAppName,
    selling_price: orderFields.orders_app_cost_price,
    orders_app_uom: orderFields.orders_app_uom,
    supervisor_uom: orderFields.supervisor_uom,
    consumption_uom: orderFields.consumption_uom,
    units_per_purchase_pack: 1,
    supervisor_uom_qty_per_unit: orderFields.supervisor_uom_qty_per_unit,
    uom_weight_enabled: orderFields.uom_weight_enabled,
    uom_weight_grams: orderFields.uom_weight_grams,
    image_url: productImageUrl,
    orders_browse_visible: false,
  };
}

async function loadCompanionCatalogRows(
  outletId: string,
  companionProductIds: string[],
): Promise<CompanionCatalogRow[]> {
  if (companionProductIds.length === 0) return [];

  const db = getFirestoreDb();
  const refs = companionProductIds.map((productId) => db.collection("catalog_items").doc(productId));
  const snapshots = await db.getAll(...refs);

  return snapshots
    .filter((snap) => snap.exists && snap.data()?.active !== false)
    .map((snap) => mapCatalogItemToCompanionRow(outletId, snap.id, snap.data() ?? {}));
}

export async function enrichOutletCatalogWithCompanionProducts<T extends { product_id: string }>(
  outletId: string,
  catalog: T[],
  allowlistedSourceProductIds?: Iterable<string>,
): Promise<Array<T | CompanionCatalogRow>> {
  const existingIds = new Set(catalog.map((row) => String(row.product_id ?? "").trim()).filter(Boolean));
  const companionIds = allowlistedSourceProductIds
    ? getCompanionProductIdsForAllowlistedSources(allowlistedSourceProductIds).filter(
        (productId) => !existingIds.has(productId),
      )
    : [...getAllCompanionProductIds()].filter((productId) => !existingIds.has(productId));

  if (companionIds.length === 0) return catalog;

  const companionRows = await loadCompanionCatalogRows(outletId, companionIds);
  return [...catalog, ...companionRows];
}

export function buildCompanionOutletOrderCatalogDoc(
  outletId: string,
  item: Record<string, unknown>,
  now: string,
): { id: string; data: Record<string, unknown> } {
  const itemId = String(item.id ?? "").trim();
  const itemKind = asText(item.item_kind, "finished");
  const productImageUrl = resolveCatalogImageUrl(item.image_url as string | null | undefined);
  const name = asText(item.name, "Companion item");

  return {
    id: `${outletId}_${itemId}`,
    data: {
      outletId,
      productId: itemId,
      variantId: null,
      productName: name,
      product_name: name,
      variantKey: null,
      itemKind,
      name,
      sku: asText(item.sku) || null,
      cost: toNumber(item.cost, 0),
      ...buildOutletOrderCatalogOrderFields(item),
      imageUrl: productImageUrl,
      image_url: productImageUrl,
      productImageUrl,
      product_image_url: productImageUrl,
      hasVariations: item.has_variations === true,
      ordersBrowseVisible: false,
      orders_browse_visible: false,
      active: true,
      updatedAt: now,
    },
  };
}
