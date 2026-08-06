export type CatalogRow = Record<string, unknown> & { id?: string };

export type CatalogSyncLookups = {
  itemsById: Map<string, CatalogRow>;
  itemsByStockApiUuid: Map<string, { id: string; row: CatalogRow }>;
  variantsById: Map<string, CatalogRow>;
  variantsByStockApiUuid: Map<string, { id: string; row: CatalogRow; itemId: string }>;
  variantParentIds: Set<string>;
};

export function buildCatalogSyncLookups(items: CatalogRow[], variants: CatalogRow[]): CatalogSyncLookups {
  const itemsById = new Map<string, CatalogRow>();
  const itemsByStockApiUuid = new Map<string, { id: string; row: CatalogRow }>();
  const variantsById = new Map<string, CatalogRow>();
  const variantsByStockApiUuid = new Map<string, { id: string; row: CatalogRow; itemId: string }>();
  const variantParentIds = new Set<string>();

  for (const item of items) {
    const id = String(item.id ?? "");
    if (!id) continue;
    itemsById.set(id, item);
    const apiUuid = String(item.stock_api_uuid ?? "").trim();
    if (apiUuid) itemsByStockApiUuid.set(apiUuid, { id, row: item });
  }

  for (const variant of variants) {
    const id = String(variant.id ?? "");
    const itemId = String(variant.item_id ?? "");
    if (!id) continue;
    variantsById.set(id, variant);
    if (itemId) variantParentIds.add(itemId);
    const apiUuid = String(variant.stock_api_uuid ?? "").trim();
    if (apiUuid) variantsByStockApiUuid.set(apiUuid, { id, row: variant, itemId });
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
    "consumption_unit",
    "consumption_uom",
    "purchase_pack_unit",
    "storage_unit",
    "units_per_purchase_pack",
    "transfer_unit",
    "transfer_quantity",
    "orders_app_uom",
    "supervisor_uom",
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
