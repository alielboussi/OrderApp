"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WasenderNotConfiguredError = exports.wasenderGroupId = exports.wasenderApiKey = void 0;
exports.isWasenderConfigured = isWasenderConfigured;
exports.sendWasenderGroupMessage = sendWasenderGroupMessage;
const params_1 = require("firebase-functions/params");
exports.wasenderApiKey = (0, params_1.defineSecret)("WASENDER_API_KEY");
exports.wasenderGroupId = (0, params_1.defineSecret)("WASENDER_GROUP_ID");
const DEFAULT_API_BASE = "https://www.wasenderapi.com";
function apiBaseUrl() {
    return (process.env.WASENDER_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, "");
}
function isWasenderConfigured() {
    return Boolean(exports.wasenderApiKey.value().trim() && exports.wasenderGroupId.value().trim());
}
class WasenderNotConfiguredError extends Error {
    constructor() {
        super("WASENDER_API_KEY or WASENDER_GROUP_ID is not configured.");
        this.name = "WasenderNotConfiguredError";
    }
}
exports.WasenderNotConfiguredError = WasenderNotConfiguredError;
async function sendWasenderGroupMessage(text) {
    const apiKey = exports.wasenderApiKey.value().trim();
    const groupId = exports.wasenderGroupId.value().trim();
    if (!apiKey || !groupId) {
        throw new WasenderNotConfiguredError();
    }
    const response = await fetch(`${apiBaseUrl()}/api/send-message`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            to: groupId,
            text,
        }),
    });
    const body = (await response.json().catch(() => ({})));
    if (!response.ok || body.success === false) {
        const detail = body.message || body.error || `Wasender API failed with status ${response.status}`;
        if (/invalid api key/i.test(detail)) {
            throw new Error("Wasender rejected the API key. Update WASENDER_API_KEY in Firebase secrets.");
        }
        throw new Error(detail);
    }
}
//# sourceMappingURL=wasender.js.map