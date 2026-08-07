export type CatalogRow = Record<string, unknown>;

export type CatalogSyncLookups = {
  itemsById: Map<string, CatalogRow>;
  itemsByStockApiUuid: Map<string, { id: string; row: CatalogRow }>;
  variantsById: Map<string, CatalogRow>;
  variantsByStockApiUuid: Map<string, { id: string; row: CatalogRow; itemId: string }>;
  variantParentIds: Set<string>;
};

export function buildCatalogSyncLookups(
  items: Array<{ id: string; data: CatalogRow }>,
  variants: Array<{ id: string; data: CatalogRow }>,
): CatalogSyncLookups {
  const itemsById = new Map<string, CatalogRow>();
  const itemsByStockApiUuid = new Map<string, { id: string; row: CatalogRow }>();
  const variantsById = new Map<string, CatalogRow>();
  const variantsByStockApiUuid = new Map<string, { id: string; row: CatalogRow; itemId: string }>();
  const variantParentIds = new Set<string>();

  for (const item of items) {
    itemsById.set(item.id, item.data);
    const apiUuid = String(item.data.stock_api_uuid ?? "").trim();
    if (apiUuid) itemsByStockApiUuid.set(apiUuid, { id: item.id, row: item.data });
  }

  for (const variant of variants) {
    variantsById.set(variant.id, variant.data);
    const itemId = String(variant.data.item_id ?? "");
    if (itemId) variantParentIds.add(itemId);
    const apiUuid = String(variant.data.stock_api_uuid ?? "").trim();
    if (apiUuid) {
      variantsByStockApiUuid.set(apiUuid, { id: variant.id, row: variant.data, itemId });
    }
  }

  return {
    itemsById,
    itemsByStockApiUuid,
    variantsById,
    variantsByStockApiUuid,
    variantParentIds,
  };
}

export function resolveSyncVariantTarget(apiUuid: string, lookups: CatalogSyncLookups) {
  if (lookups.variantsById.has(apiUuid)) {
    const row = lookups.variantsById.get(apiUuid)!;
    return { variantId: apiUuid, itemId: String(row.item_id ?? ""), existing: row };
  }
  const match = lookups.variantsByStockApiUuid.get(apiUuid);
  if (match) return { variantId: match.id, itemId: match.itemId, existing: match.row };
  return null;
}

export function resolveSyncItemTarget(apiUuid: string, lookups: CatalogSyncLookups) {
  if (lookups.itemsById.has(apiUuid)) {
    return { itemId: apiUuid, existing: lookups.itemsById.get(apiUuid)! };
  }
  const match = lookups.itemsByStockApiUuid.get(apiUuid);
  if (match) return { itemId: match.id, existing: match.row };
  return null;
}

function fieldChanged(existing: unknown, synced: unknown): boolean {
  const left = existing === null || existing === undefined ? "" : String(existing).trim();
  const right = synced === null || synced === undefined ? "" : String(synced).trim();
  if (left === right) return false;
  const leftNum = Number(left);
  const rightNum = Number(right);
  if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && left !== "" && right !== "") {
    return leftNum !== rightNum;
  }
  return true;
}

export function catalogItemFieldsChanged(existing: CatalogRow, synced: CatalogRow): boolean {
  const keys = [
    "name",
    "storage_unit",
    "units_per_purchase_pack",
    "track_stock",
    "default_warehouse_id",
    "active",
    "stock_api_missing",
    "stock_api_warehouse_uuid",
  ];
  return keys.some((key) => fieldChanged(existing[key], synced[key]));
}

export function catalogVariantFieldsChanged(existing: CatalogRow, synced: CatalogRow): boolean {
  const keys = ["name", "active", "stock_api_missing"];
  return keys.some((key) => fieldChanged(existing[key], synced[key]));
}

export function rowLinkedToApiUuid(
  rowId: string,
  stockApiUuid: unknown,
  apiUuidSet: Set<string>,
): boolean {
  if (apiUuidSet.has(rowId)) return true;
  const linkedUuid = String(stockApiUuid ?? "").trim();
  return Boolean(linkedUuid && apiUuidSet.has(linkedUuid));
}

export function normalizeItemKind(value: unknown): "finished" | "ingredient" | "raw" | null {
  const kind = String(value ?? "").trim().toLowerCase();
  if (kind === "finished" || kind === "product") return "finished";
  if (kind === "ingredient") return "ingredient";
  if (kind === "raw") return "raw";
  return null;
}

/** Finished products are created and maintained only in the portal. */
export function isPortalOnlyCatalogItem(row: CatalogRow): boolean {
  const kind = normalizeItemKind(row.item_kind);
  if (kind === "finished") return true;
  if (kind === "ingredient" || kind === "raw") return false;
  return !String(row.stock_api_uuid ?? "").trim();
}

/** Ingredients and raw materials are synced from the stock catalog API. */
export function isApiManagedCatalogItem(row: CatalogRow): boolean {
  return !isPortalOnlyCatalogItem(row);
}

export function isApiManagedItemKind(kind: unknown): boolean {
  const normalized = normalizeItemKind(kind);
  return normalized === "ingredient" || normalized === "raw";
}

export function isPortalOnlyCatalogVariant(
  itemId: string,
  lookups: CatalogSyncLookups,
): boolean {
  if (!itemId) return true;
  const parent = lookups.itemsById.get(itemId);
  return parent ? isPortalOnlyCatalogItem(parent) : true;
}
