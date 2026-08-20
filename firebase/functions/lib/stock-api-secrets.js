"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STOCK_CATALOG_SYNC_DELETE_MISSING = exports.STOCK_CATALOG_SYNC_DEACTIVATE_MISSING = exports.STOCK_CATALOG_SYNC_ENABLED = exports.stockSyncApiToken = void 0;
const params_1 = require("firebase-functions/params");
exports.stockSyncApiToken = (0, params_1.defineSecret)("STOCK_SYNC_API_TOKEN");
/**
 * BILLING SAFETY — keep all false forever unless doing a one-off unlock.
 * Never add Cloud Scheduler / onSchedule for catalog sync.
 * A previous every-1-minute schedule caused ~$20–25/day Firestore charges.
 */
exports.STOCK_CATALOG_SYNC_ENABLED = false;
exports.STOCK_CATALOG_SYNC_DEACTIVATE_MISSING = false;
exports.STOCK_CATALOG_SYNC_DELETE_MISSING = false;
//# sourceMappingURL=stock-api-secrets.js.map