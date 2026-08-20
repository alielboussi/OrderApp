import { initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";
import { COLLECTIONS } from "./schema";
import {
  acceptTransferOrder,
  completeTransferOrder,
  dispatchTransferOrder,
  getTransferOrderSignatureUrl,
  peekNextOrderNumber,
  placeTransferOrder,
  updateTransferOrderItems,
} from "./transfer-orders";

initializeApp({
  storageBucket: "afterten-portal-system.firebasestorage.app",
});

/**
 * Step 1 gate: proves Functions deploy + SCPGT can call Firebase later.
 * Callable from portal or firebase CLI after deploy.
 */
export const health = onCall({ region: "africa-south1" }, async () => {
  return {
    ok: true,
    service: "afterten-firebase",
    step: 2,
    region: "africa-south1",
    collections: COLLECTIONS,
    message: "Firebase foundation + schema ready",
    at: new Date().toISOString(),
  };
});

export {
  placeTransferOrder,
  completeTransferOrder,
  acceptTransferOrder,
  dispatchTransferOrder,
  getTransferOrderSignatureUrl,
  peekNextOrderNumber,
  updateTransferOrderItems,
};
export { togglePreparationChecklistItem, clearPreparationChecklist } from "./preparation";
export { registerPushToken, unregisterPushToken } from "./push-tokens";
export {
  submitDamageReport,
  reviewDamageReport,
  getDamageReportPhotoUrl,
  getDamageReportSignatureUrl,
  dispatchDamageReport,
  completeDamageReport,
} from "./damage-reports";
export { getStockControlSnapshot } from "./stock-control";
// BILLING SAFETY: do not export syncStockCatalog or any onSchedule catalog sync.
// Manual portal sync (when unlocked in code) uses the Next.js stock-api-sync route.
export { listOutletOrderCatalog } from "./outlet-order-catalog-list";
