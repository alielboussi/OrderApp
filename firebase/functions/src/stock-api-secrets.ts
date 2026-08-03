import { defineSecret, defineString } from "firebase-functions/params";

export const stockSyncApiToken = defineSecret("STOCK_SYNC_API_TOKEN");

export const stockCatalogSyncEnabled = defineString("STOCK_CATALOG_SYNC_ENABLED", {
  default: "true",
});

export const stockCatalogSyncDeactivateMissing = defineString("STOCK_CATALOG_SYNC_DEACTIVATE_MISSING", {
  default: "false",
});

export const stockCatalogSyncDeleteMissing = defineString("STOCK_CATALOG_SYNC_DELETE_MISSING", {
  default: "true",
});
