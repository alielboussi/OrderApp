"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listOutletOrderCatalog = exports.syncStockCatalogScheduled = exports.syncStockCatalog = exports.getStockControlSnapshot = exports.completeDamageReport = exports.dispatchDamageReport = exports.getDamageReportSignatureUrl = exports.getDamageReportPhotoUrl = exports.reviewDamageReport = exports.submitDamageReport = exports.updateTransferOrderItems = exports.peekNextOrderNumber = exports.getTransferOrderSignatureUrl = exports.dispatchTransferOrder = exports.acceptTransferOrder = exports.completeTransferOrder = exports.placeTransferOrder = exports.health = void 0;
const app_1 = require("firebase-admin/app");
const https_1 = require("firebase-functions/v2/https");
const schema_1 = require("./schema");
const transfer_orders_1 = require("./transfer-orders");
Object.defineProperty(exports, "acceptTransferOrder", { enumerable: true, get: function () { return transfer_orders_1.acceptTransferOrder; } });
Object.defineProperty(exports, "completeTransferOrder", { enumerable: true, get: function () { return transfer_orders_1.completeTransferOrder; } });
Object.defineProperty(exports, "dispatchTransferOrder", { enumerable: true, get: function () { return transfer_orders_1.dispatchTransferOrder; } });
Object.defineProperty(exports, "getTransferOrderSignatureUrl", { enumerable: true, get: function () { return transfer_orders_1.getTransferOrderSignatureUrl; } });
Object.defineProperty(exports, "peekNextOrderNumber", { enumerable: true, get: function () { return transfer_orders_1.peekNextOrderNumber; } });
Object.defineProperty(exports, "placeTransferOrder", { enumerable: true, get: function () { return transfer_orders_1.placeTransferOrder; } });
Object.defineProperty(exports, "updateTransferOrderItems", { enumerable: true, get: function () { return transfer_orders_1.updateTransferOrderItems; } });
(0, app_1.initializeApp)({
    storageBucket: "afterten-portal-system.firebasestorage.app",
});
/**
 * Step 1 gate: proves Functions deploy + SCPGT can call Firebase later.
 * Callable from portal or firebase CLI after deploy.
 */
exports.health = (0, https_1.onCall)({ region: "africa-south1" }, async () => {
    return {
        ok: true,
        service: "afterten-firebase",
        step: 2,
        region: "africa-south1",
        collections: schema_1.COLLECTIONS,
        message: "Firebase foundation + schema ready",
        at: new Date().toISOString(),
    };
});
var damage_reports_1 = require("./damage-reports");
Object.defineProperty(exports, "submitDamageReport", { enumerable: true, get: function () { return damage_reports_1.submitDamageReport; } });
Object.defineProperty(exports, "reviewDamageReport", { enumerable: true, get: function () { return damage_reports_1.reviewDamageReport; } });
Object.defineProperty(exports, "getDamageReportPhotoUrl", { enumerable: true, get: function () { return damage_reports_1.getDamageReportPhotoUrl; } });
Object.defineProperty(exports, "getDamageReportSignatureUrl", { enumerable: true, get: function () { return damage_reports_1.getDamageReportSignatureUrl; } });
Object.defineProperty(exports, "dispatchDamageReport", { enumerable: true, get: function () { return damage_reports_1.dispatchDamageReport; } });
Object.defineProperty(exports, "completeDamageReport", { enumerable: true, get: function () { return damage_reports_1.completeDamageReport; } });
var stock_control_1 = require("./stock-control");
Object.defineProperty(exports, "getStockControlSnapshot", { enumerable: true, get: function () { return stock_control_1.getStockControlSnapshot; } });
var stock_catalog_sync_1 = require("./stock-catalog-sync");
Object.defineProperty(exports, "syncStockCatalog", { enumerable: true, get: function () { return stock_catalog_sync_1.syncStockCatalog; } });
Object.defineProperty(exports, "syncStockCatalogScheduled", { enumerable: true, get: function () { return stock_catalog_sync_1.syncStockCatalogScheduled; } });
var outlet_order_catalog_list_1 = require("./outlet-order-catalog-list");
Object.defineProperty(exports, "listOutletOrderCatalog", { enumerable: true, get: function () { return outlet_order_catalog_list_1.listOutletOrderCatalog; } });
//# sourceMappingURL=index.js.map