"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCatalogSyncLookups = buildCatalogSyncLookups;
exports.resolveSyncVariantTarget = resolveSyncVariantTarget;
exports.resolveSyncItemTarget = resolveSyncItemTarget;
exports.catalogItemFieldsChanged = catalogItemFieldsChanged;
exports.catalogVariantFieldsChanged = catalogVariantFieldsChanged;
exports.rowLinkedToApiUuid = rowLinkedToApiUuid;
exports.normalizeItemKind = normalizeItemKind;
exports.isPortalOnlyCatalogItem = isPortalOnlyCatalogItem;
exports.isApiManagedCatalogItem = isApiManagedCatalogItem;
exports.isApiManagedItemKind = isApiManagedItemKind;
exports.isPortalOnlyCatalogVariant = isPortalOnlyCatalogVariant;
function buildCatalogSyncLookups(items, variants) {
    const itemsById = new Map();
    const itemsByStockApiUuid = new Map();
    const variantsById = new Map();
    const variantsByStockApiUuid = new Map();
    const variantParentIds = new Set();
    for (const item of items) {
        itemsById.set(item.id, item.data);
        const apiUuid = String(item.data.stock_api_uuid ?? "").trim();
        if (apiUuid)
            itemsByStockApiUuid.set(apiUuid, { id: item.id, row: item.data });
    }
    for (const variant of variants) {
        variantsById.set(variant.id, variant.data);
        const itemId = String(variant.data.item_id ?? "");
        if (itemId)
            variantParentIds.add(itemId);
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
function resolveSyncVariantTarget(apiUuid, lookups) {
    if (lookups.variantsById.has(apiUuid)) {
        const row = lookups.variantsById.get(apiUuid);
        return { variantId: apiUuid, itemId: String(row.item_id ?? ""), existing: row };
    }
    const match = lookups.variantsByStockApiUuid.get(apiUuid);
    if (match)
        return { variantId: match.id, itemId: match.itemId, existing: match.row };
    return null;
}
function resolveSyncItemTarget(apiUuid, lookups) {
    if (lookups.itemsById.has(apiUuid)) {
        return { itemId: apiUuid, existing: lookups.itemsById.get(apiUuid) };
    }
    const match = lookups.itemsByStockApiUuid.get(apiUuid);
    if (match)
        return { itemId: match.id, existing: match.row };
    return null;
}
function fieldChanged(existing, synced) {
    const left = existing === null || existing === undefined ? "" : String(existing).trim();
    const right = synced === null || synced === undefined ? "" : String(synced).trim();
    if (left === right)
        return false;
    const leftNum = Number(left);
    const rightNum = Number(right);
    if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && left !== "" && right !== "") {
        return leftNum !== rightNum;
    }
    return true;
}
function catalogItemFieldsChanged(existing, synced) {
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
function catalogVariantFieldsChanged(existing, synced) {
    const keys = ["name", "active", "stock_api_missing"];
    return keys.some((key) => fieldChanged(existing[key], synced[key]));
}
function rowLinkedToApiUuid(rowId, stockApiUuid, apiUuidSet) {
    if (apiUuidSet.has(rowId))
        return true;
    const linkedUuid = String(stockApiUuid ?? "").trim();
    return Boolean(linkedUuid && apiUuidSet.has(linkedUuid));
}
function normalizeItemKind(value) {
    const kind = String(value ?? "").trim().toLowerCase();
    if (kind === "finished" || kind === "product")
        return "finished";
    if (kind === "ingredient")
        return "ingredient";
    if (kind === "raw")
        return "raw";
    return null;
}
/** Finished products are created and maintained only in the portal. */
function isPortalOnlyCatalogItem(row) {
    const kind = normalizeItemKind(row.item_kind);
    if (kind === "finished")
        return true;
    if (kind === "ingredient" || kind === "raw")
        return false;
    return !String(row.stock_api_uuid ?? "").trim();
}
/** Ingredients and raw materials are synced from the stock catalog API. */
function isApiManagedCatalogItem(row) {
    return !isPortalOnlyCatalogItem(row);
}
function isApiManagedItemKind(kind) {
    const normalized = normalizeItemKind(kind);
    return normalized === "ingredient" || normalized === "raw";
}
function isPortalOnlyCatalogVariant(itemId, lookups) {
    if (!itemId)
        return true;
    const parent = lookups.itemsById.get(itemId);
    return parent ? isPortalOnlyCatalogItem(parent) : true;
}
//# sourceMappingURL=catalog-api-sync-matching.js.map