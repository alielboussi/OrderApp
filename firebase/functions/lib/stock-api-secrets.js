"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stockCatalogSyncDeleteMissing = exports.stockCatalogSyncDeactivateMissing = exports.stockCatalogSyncEnabled = exports.stockSyncApiToken = void 0;
const params_1 = require("firebase-functions/params");
exports.stockSyncApiToken = (0, params_1.defineSecret)("STOCK_SYNC_API_TOKEN");
exports.stockCatalogSyncEnabled = (0, params_1.defineString)("STOCK_CATALOG_SYNC_ENABLED", {
    default: "true",
});
exports.stockCatalogSyncDeactivateMissing = (0, params_1.defineString)("STOCK_CATALOG_SYNC_DEACTIVATE_MISSING", {
    default: "false",
});
exports.stockCatalogSyncDeleteMissing = (0, params_1.defineString)("STOCK_CATALOG_SYNC_DELETE_MISSING", {
    default: "true",
});
//# sourceMappingURL=stock-api-secrets.js.map