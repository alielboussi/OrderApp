"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStockControlSnapshot = void 0;
exports.aggregateStockQuantitiesByUuid = aggregateStockQuantitiesByUuid;
const https_1 = require("firebase-functions/v2/https");
const DEFAULT_STOCK_SYNC_API_URL = "https://afterten-stock-api-896827614552.us-central1.run.app/sync/stock";
function aggregateStockQuantitiesByUuid(payload) {
    const quantities = {};
    for (const warehouse of payload.warehouses ?? []) {
        for (const item of warehouse.items ?? []) {
            const uuid = String(item.uuid ?? "").trim();
            if (!uuid)
                continue;
            const qty = Number(item.qty ?? 0);
            quantities[uuid] = (quantities[uuid] ?? 0) + (Number.isFinite(qty) ? qty : 0);
        }
    }
    return quantities;
}
async function fetchSyncStockPayload() {
    const url = process.env.STOCK_SYNC_API_URL?.trim() || DEFAULT_STOCK_SYNC_API_URL;
    const token = process.env.STOCK_SYNC_API_TOKEN?.trim();
    if (!token) {
        throw new https_1.HttpsError("failed-precondition", "Stock sync API token is not configured.");
    }
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
        },
    });
    if (!response.ok) {
        throw new https_1.HttpsError("unavailable", `Stock sync API returned ${response.status}.`);
    }
    return (await response.json());
}
exports.getStockControlSnapshot = (0, https_1.onCall)({ region: "africa-south1" }, async (request) => {
    if (!request.auth?.uid) {
        throw new https_1.HttpsError("unauthenticated", "Sign in required.");
    }
    const serverEnabled = process.env.STOCK_CONTROL_ENABLED === "true"; // Operation A gate
    if (!serverEnabled) {
        return {
            enabled: false,
            generatedAt: new Date().toISOString(),
            quantitiesByUuid: {},
        };
    }
    const payload = await fetchSyncStockPayload();
    return {
        enabled: true,
        generatedAt: payload.generatedAt ?? new Date().toISOString(),
        quantitiesByUuid: aggregateStockQuantitiesByUuid(payload),
    };
});
//# sourceMappingURL=stock-control.js.map