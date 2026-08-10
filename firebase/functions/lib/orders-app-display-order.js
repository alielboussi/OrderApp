"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORDERS_APP_PINNED_PRODUCT_ORDER = void 0;
exports.readOrdersAppDisplayOrderFromRow = readOrdersAppDisplayOrderFromRow;
exports.resolveOrdersAppDisplayRank = resolveOrdersAppDisplayRank;
exports.compareOrdersAppCatalogProducts = compareOrdersAppCatalogProducts;
/** Base product IDs shown first on the Orders app create-order grid (in this order). */
exports.ORDERS_APP_PINNED_PRODUCT_ORDER = [
    "bbafd6a5-aa46-44ea-ac60-14da9bd4eaa2",
    "a029c3dc-4b03-4290-a579-c804367389a7",
    "bc75117f-737d-48be-9450-556a46cda167",
    "405807f9-03c9-401d-acb8-26980b492491",
];
const PINNED_RANK_BY_PRODUCT_ID = new Map(exports.ORDERS_APP_PINNED_PRODUCT_ORDER.map((productId, index) => [productId, index]));
const PINNED_COUNT = exports.ORDERS_APP_PINNED_PRODUCT_ORDER.length;
const CUSTOM_ORDER_OFFSET = PINNED_COUNT;
function readOptionalDisplayOrder(value) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0)
        return null;
    return Math.floor(parsed);
}
function readOrdersAppDisplayOrderFromRow(row) {
    if (!row)
        return null;
    return readOptionalDisplayOrder(row.orders_app_display_order ?? row.ordersAppDisplayOrder);
}
/** Lower rank sorts earlier. Pinned IDs win, then catalog field, then alphabetical fallback. */
function resolveOrdersAppDisplayRank(productId, displayOrderFromCatalog) {
    const normalizedProductId = String(productId ?? "").trim();
    const pinnedRank = PINNED_RANK_BY_PRODUCT_ID.get(normalizedProductId);
    if (pinnedRank != null)
        return pinnedRank;
    if (displayOrderFromCatalog != null) {
        return CUSTOM_ORDER_OFFSET + displayOrderFromCatalog;
    }
    return Number.MAX_SAFE_INTEGER;
}
function compareOrdersAppCatalogProducts(left, right) {
    const leftRank = resolveOrdersAppDisplayRank(left.productId, left.ordersAppDisplayOrder ?? null);
    const rightRank = resolveOrdersAppDisplayRank(right.productId, right.ordersAppDisplayOrder ?? null);
    if (leftRank !== rightRank)
        return leftRank - rightRank;
    return String(left.name ?? "").localeCompare(String(right.name ?? ""), undefined, {
        sensitivity: "base",
    });
}
//# sourceMappingURL=orders-app-display-order.js.map