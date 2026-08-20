import { defineSecret } from "firebase-functions/params";

export const stockSyncApiToken = defineSecret("STOCK_SYNC_API_TOKEN");

/**
 * BILLING SAFETY — keep all false forever unless doing a one-off unlock.
 * Never add Cloud Scheduler / onSchedule for catalog sync.
 * A previous every-1-minute schedule caused ~$20–25/day Firestore charges.
 */
export const STOCK_CATALOG_SYNC_ENABLED = false;
export const STOCK_CATALOG_SYNC_DEACTIVATE_MISSING = false;
export const STOCK_CATALOG_SYNC_DELETE_MISSING = false;
