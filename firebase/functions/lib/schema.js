"use strict";
/**
 * Firestore collection paths and document shapes for Afterten migration.
 * SCPGT + portal + Cloud Functions share these conventions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLLECTIONS = void 0;
exports.posSalesBillPath = posSalesBillPath;
exports.posSalesBillsCollection = posSalesBillsCollection;
exports.COLLECTIONS = {
    outlets: "outlets",
    outletHeartbeats: "outlet_heartbeats",
    posSyncFailures: "pos_sync_failures",
    outletCounters: "outlet_counters",
    catalogItems: "catalog_items",
    catalogVariants: "catalog_variants",
    catalogMenuGroups: "catalog_menu_groups",
    outletCatalogSyncEvents: "outlet_catalog_sync_events",
    outletCatalogBindings: "outlet_catalog_bindings",
    outletCashiers: "outlet_cashiers",
    outletCashierSyncEvents: "outlet_cashier_sync_events",
    transferOrders: "transfer_orders",
    transferOrderCounters: "transfer_order_counters",
    outletOrderCatalog: "outlet_order_catalog",
    outletOrderRoutes: "outlet_order_routes",
    appUsers: "app_users",
};
/** pos_sales/{outletId}/bills/{sourceEventId} */
function posSalesBillPath(outletId, sourceEventId) {
    return `pos_sales/${outletId}/bills/${sourceEventId}`;
}
function posSalesBillsCollection(outletId) {
    return `pos_sales/${outletId}/bills`;
}
//# sourceMappingURL=schema.js.map