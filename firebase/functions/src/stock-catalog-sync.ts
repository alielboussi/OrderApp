import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import {
  stockCatalogSyncDeactivateMissing,
  stockCatalogSyncDeleteMissing,
  stockCatalogSyncEnabled,
  stockCatalogSyncCron,
  stockCatalogSyncIntervalSeconds,
  stockSyncApiToken,
} from "./stock-api-secrets";
import { deleteCatalogRowsMissingFromApi } from "./stock-catalog-cleanup";
import {
  buildCatalogSyncLookups,
  catalogItemFieldsChanged,
  catalogVariantFieldsChanged,
  isApiManagedItemKind,
  isPortalOnlyCatalogItem,
  isPortalOnlyCatalogVariant,
  resolveSyncItemTarget,
  resolveSyncVariantTarget,
  rowLinkedToApiUuid,
} from "./catalog-api-sync-matching";
import { refreshOutletOrderCatalogForItem } from "./outlet-order-catalog-refresh";

const DEFAULT_STOCK_CATALOG_API_URL =
  "https://afterten-stock-api-896827614552.us-central1.run.app/sync/catalog";
const DEFAULT_STOCK_CATALOG_SYNC_INTERVAL_SECONDS = 30;
const STOCK_CATALOG_SYNC_WINDOW_MS = 59_000;

type StockApiUnit = {
  name?: string | null;
  perUnit?: number | null;
};

type StockApiWarehouseRef = {
  uuid?: string | null;
  name?: string | null;
  active?: boolean | null;
};

type StockApiCatalogProduct = {
  uuid: string;
  name: string;
  trackStock?: boolean | null;
  unit?: StockApiUnit | null;
  subUnit?: StockApiUnit | null;
  warehouse?: StockApiWarehouseRef | null;
  alsoAllowedIn?: StockApiWarehouseRef[] | null;
};

type StockApiCatalogResponse = {
  generatedAt?: string;
  products?: StockApiCatalogProduct[];
  warehouses?: StockApiWarehouseRef[];
};

type SyncReport = {
  ok: boolean;
  generated_at: string;
  catalog_generated_at: string | null;
  summary: {
    api_products: number;
    created_items: number;
    updated_items: number;
    updated_variants: number;
    warehouses_upserted: number;
    deactivated_items: number;
    deactivated_variants: number;
    deleted_items: number;
    deleted_variants: number;
    deleted_related_docs: number;
    skipped_invalid_uuid: number;
    skipped_portal_only: number;
    outlet_catalog_refreshed: number;
  };
  created: Array<{ uuid: string; name: string }>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function resolveStockCatalogSyncIntervalMs(): number {
  const raw = stockCatalogSyncIntervalSeconds.value();
  const seconds = raw ? Number(raw) : DEFAULT_STOCK_CATALOG_SYNC_INTERVAL_SECONDS;
  if (!Number.isFinite(seconds) || seconds < 1) {
    return DEFAULT_STOCK_CATALOG_SYNC_INTERVAL_SECONDS * 1000;
  }
  return Math.min(seconds, 60) * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWarehouseName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function cleanUnitName(value: unknown, fallback = "each"): string {
  const text = String(value ?? "").trim();
  return text.length ? text : fallback;
}

function inferItemKind(product: StockApiCatalogProduct): "ingredient" | "raw" | null {
  const warehouseName = normalizeWarehouseName(product.warehouse?.name);
  if (warehouseName.includes("raw")) return "raw";
  if (
    warehouseName.includes("ingredient") ||
    warehouseName.includes("beverage") ||
    warehouseName.includes("coldroom") ||
    warehouseName.includes("storeroom")
  ) {
    return "ingredient";
  }
  return "ingredient";
}

function mapProductUnits(product: StockApiCatalogProduct) {
  const storageUnit = cleanUnitName(product.subUnit?.name, "each");
  const unitsPerPurchasePack = Number(product.subUnit?.perUnit ?? 1);
  return {
    storage_unit: storageUnit,
    units_per_purchase_pack:
      Number.isFinite(unitsPerPurchasePack) && unitsPerPurchasePack > 0 ? unitsPerPurchasePack : 1,
  };
}

async function fetchStockCatalog(): Promise<StockApiCatalogResponse> {
  const url = process.env.STOCK_CATALOG_SYNC_API_URL?.trim() || DEFAULT_STOCK_CATALOG_API_URL;
  const token = stockSyncApiToken.value().trim();
  if (!token) {
    throw new Error("STOCK_SYNC_API_TOKEN is not configured.");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Stock catalog API returned ${response.status}.`);
  }

  return (await response.json()) as StockApiCatalogResponse;
}

async function loadWarehouseMaps(
  db: FirebaseFirestore.Firestore,
  apiWarehouses: StockApiWarehouseRef[],
) {
  const byApiUuid = new Map<string, string>();
  const byNormalizedName = new Map<string, string>();
  const snapshot = await db.collection("warehouses").get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const stockApiUuid =
      typeof data.stock_api_uuid === "string" && data.stock_api_uuid.trim()
        ? data.stock_api_uuid.trim()
        : null;
    if (stockApiUuid) byApiUuid.set(stockApiUuid, doc.id);
    const normalizedName = normalizeWarehouseName(data.name);
    if (normalizedName) byNormalizedName.set(normalizedName, doc.id);
  }

  for (const warehouse of apiWarehouses) {
    const apiUuid = String(warehouse.uuid ?? "").trim();
    const normalizedName = normalizeWarehouseName(warehouse.name);
    if (!apiUuid || !normalizedName || byApiUuid.has(apiUuid)) continue;

    const existingId = byNormalizedName.get(normalizedName);
    const docId = existingId ?? apiUuid;
    const ref = db.collection("warehouses").doc(docId);
    const existing = await ref.get();
    const createdAt =
      typeof existing.data()?.created_at === "string" ? existing.data()?.created_at : nowIso();

    await ref.set(
      {
        name: String(warehouse.name ?? "").trim().replace(/^"+|"+$/g, "") || "Warehouse",
        active: warehouse.active !== false,
        stock_api_uuid: apiUuid,
        stock_api_synced_at: nowIso(),
        created_at: createdAt,
        updated_at: nowIso(),
      },
      { merge: true },
    );

    byApiUuid.set(apiUuid, docId);
    byNormalizedName.set(normalizedName, docId);
  }

  return { byApiUuid, byNormalizedName };
}

function resolveWarehouseId(
  product: StockApiCatalogProduct,
  maps: { byApiUuid: Map<string, string>; byNormalizedName: Map<string, string> },
): string | null {
  const apiUuid = String(product.warehouse?.uuid ?? "").trim();
  if (apiUuid && maps.byApiUuid.has(apiUuid)) return maps.byApiUuid.get(apiUuid) ?? null;
  const normalizedName = normalizeWarehouseName(product.warehouse?.name);
  if (normalizedName && maps.byNormalizedName.has(normalizedName)) {
    return maps.byNormalizedName.get(normalizedName) ?? null;
  }
  return null;
}

function collectWarehouseIds(
  product: StockApiCatalogProduct,
  maps: { byApiUuid: Map<string, string>; byNormalizedName: Map<string, string> },
): string[] {
  const ids = new Set<string>();
  const primary = resolveWarehouseId(product, maps);
  if (primary) ids.add(primary);
  for (const warehouse of product.alsoAllowedIn ?? []) {
    const apiUuid = String(warehouse.uuid ?? "").trim();
    if (apiUuid && maps.byApiUuid.has(apiUuid)) {
      ids.add(maps.byApiUuid.get(apiUuid)!);
      continue;
    }
    const normalizedName = normalizeWarehouseName(warehouse.name);
    if (normalizedName && maps.byNormalizedName.has(normalizedName)) {
      ids.add(maps.byNormalizedName.get(normalizedName)!);
    }
  }
  return [...ids];
}

async function syncStorageHomes(
  db: FirebaseFirestore.Firestore,
  itemId: string,
  variantKey: string | null,
  warehouseIds: string[],
) {
  const normalizedKey = variantKey && variantKey !== "base" ? variantKey : "base";
  const snapshot = await db.collection("item_storage_homes").where("item_id", "==", itemId).get();
  const existing = snapshot.docs.filter(
    (doc) =>
      String(doc.data().normalized_variant_key ?? doc.data().variant_key ?? "base") === normalizedKey,
  );
  const keep = new Set(warehouseIds.filter(Boolean));
  const batch = db.batch();
  for (const doc of existing) {
    const warehouseId = doc.data().storage_warehouse_id;
    if (!keep.has(warehouseId)) batch.delete(doc.ref);
  }
  for (const warehouseId of keep) {
    const docId =
      normalizedKey === "base"
        ? `${itemId}_base_${warehouseId}`
        : `${itemId}_${normalizedKey}_${warehouseId}`;
    batch.set(db.collection("item_storage_homes").doc(docId), {
      item_id: itemId,
      variant_key: normalizedKey,
      normalized_variant_key: normalizedKey,
      storage_warehouse_id: warehouseId,
      updated_at: nowIso(),
    });
  }
  await batch.commit();
}

async function runStockCatalogSync(options?: {
  deactivateMissing?: boolean;
  deleteMissing?: boolean;
}): Promise<SyncReport> {
  const deleteMissing =
    options?.deleteMissing ?? stockCatalogSyncDeleteMissing.value() !== "false";
  const deactivateMissing =
    !deleteMissing &&
    (options?.deactivateMissing ?? stockCatalogSyncDeactivateMissing.value() === "true");
  const db = getFirestore();
  const catalog = await fetchStockCatalog();
  const products = (catalog.products ?? []).filter((product) => String(product.uuid ?? "").trim());
  const warehouseMaps = await loadWarehouseMaps(db, catalog.warehouses ?? []);

  const [itemsSnap, variantsSnap] = await Promise.all([
    db.collection("catalog_items").get(),
    db.collection("catalog_variants").get(),
  ]);

  const lookups = buildCatalogSyncLookups(
    itemsSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
    variantsSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
  );
  const apiUuidSet = new Set(products.map((product) => String(product.uuid).trim()));
  const changedItemIds = new Set<string>();

  let createdItems = 0;
  let updatedItems = 0;
  let updatedVariants = 0;
  let skippedInvalidUuid = 0;
  let skippedPortalOnly = 0;
  let deactivatedItems = 0;
  let deactivatedVariants = 0;
  let deletedItems = 0;
  let deletedVariants = 0;
  let deletedRelatedDocs = 0;
  let outletCatalogRefreshed = 0;
  const created: Array<{ uuid: string; name: string }> = [];

  for (const product of products) {
    const uuid = String(product.uuid ?? "").trim();
    if (!uuid) {
      skippedInvalidUuid += 1;
      continue;
    }

    const warehouseIds = collectWarehouseIds(product, warehouseMaps);
    const primaryWarehouseId = warehouseIds[0] ?? null;
    const units = mapProductUnits(product);
    const syncedFields = {
      name: String(product.name ?? "").trim() || "Unnamed product",
      ...units,
      track_stock: product.trackStock !== false,
      stock_api_uuid: uuid,
      stock_api_warehouse_uuid: product.warehouse?.uuid ?? null,
      stock_api_synced_at: nowIso(),
      stock_api_missing: false,
      default_warehouse_id: primaryWarehouseId,
      active: true,
    };

    const existingVariant = resolveSyncVariantTarget(uuid, lookups);
    if (existingVariant) {
      if (isPortalOnlyCatalogVariant(existingVariant.itemId, lookups)) {
        skippedPortalOnly += 1;
        continue;
      }
      const variantPayload = {
        name: syncedFields.name,
        stock_api_uuid: uuid,
        stock_api_synced_at: syncedFields.stock_api_synced_at,
        stock_api_missing: false,
        active: true,
      };
      if (catalogVariantFieldsChanged(existingVariant.existing, variantPayload)) {
        await db.collection("catalog_variants").doc(existingVariant.variantId).set(
          {
            ...variantPayload,
            updated_at: nowIso(),
          },
          { merge: true },
        );
        updatedVariants += 1;
        if (existingVariant.itemId) changedItemIds.add(existingVariant.itemId);
      }
      if (existingVariant.itemId && warehouseIds.length) {
        await syncStorageHomes(db, existingVariant.itemId, existingVariant.variantId, warehouseIds);
      }
      continue;
    }

    const existingItem = resolveSyncItemTarget(uuid, lookups);
    if (existingItem) {
      if (isPortalOnlyCatalogItem(existingItem.existing)) {
        skippedPortalOnly += 1;
        continue;
      }
      if (catalogItemFieldsChanged(existingItem.existing, syncedFields)) {
        await db.collection("catalog_items").doc(existingItem.itemId).set(
          {
            ...syncedFields,
            updated_at: nowIso(),
          },
          { merge: true },
        );
        updatedItems += 1;
        changedItemIds.add(existingItem.itemId);
      }
      if (!lookups.variantParentIds.has(existingItem.itemId) && warehouseIds.length) {
        await syncStorageHomes(db, existingItem.itemId, null, warehouseIds);
      }
      continue;
    }

    const itemKind = inferItemKind(product);
    if (!itemKind || !isApiManagedItemKind(itemKind)) {
      skippedPortalOnly += 1;
      continue;
    }

    const createdAt = nowIso();
    await db.collection("catalog_items").doc(uuid).set(
      {
        ...syncedFields,
        item_kind: itemKind,
        sku: null,
        supplier_sku: null,
        cost: 0,
        selling_price: 0,
        consumption_unit: "pc",
        consumption_uom: "pc",
        orders_app_uom: "pc",
        supervisor_uom: "pc",
        supervisor_uom_qty_per_unit: 1,
        orders_app_cost_price: 0,
        has_variations: false,
        has_recipe: false,
        outlet_order_visible: true,
        image_url: null,
        menu_group_id: null,
        created_at: createdAt,
        updated_at: createdAt,
      },
      { merge: true },
    );
    if (warehouseIds.length) {
      await syncStorageHomes(db, uuid, null, warehouseIds);
    }
    created.push({ uuid, name: syncedFields.name });
    createdItems += 1;
    changedItemIds.add(uuid);
  }

  if (deactivateMissing) {
    for (const doc of itemsSnap.docs) {
      if (lookups.variantParentIds.has(doc.id)) continue;
      if (isPortalOnlyCatalogItem(doc.data())) continue;
      if (rowLinkedToApiUuid(doc.id, doc.get("stock_api_uuid"), apiUuidSet)) continue;
      if (doc.get("active") === false) continue;
      await doc.ref.set(
        { active: false, stock_api_missing: true, stock_api_synced_at: nowIso(), updated_at: nowIso() },
        { merge: true },
      );
      deactivatedItems += 1;
      changedItemIds.add(doc.id);
    }

    for (const doc of variantsSnap.docs) {
      const itemId = String(doc.get("item_id") ?? "");
      if (isPortalOnlyCatalogVariant(itemId, lookups)) continue;
      if (rowLinkedToApiUuid(doc.id, doc.get("stock_api_uuid"), apiUuidSet)) continue;
      if (doc.get("active") === false) continue;
      await doc.ref.set(
        { active: false, stock_api_missing: true, stock_api_synced_at: nowIso(), updated_at: nowIso() },
        { merge: true },
      );
      if (itemId) {
        const activeVariants = await db
          .collection("catalog_variants")
          .where("item_id", "==", itemId)
          .where("active", "==", true)
          .get();
        const hasVariations = activeVariants.docs.some((variantDoc) => variantDoc.id !== "base");
        await db.collection("catalog_items").doc(itemId).set(
          { has_variations: hasVariations, updated_at: nowIso() },
          { merge: true },
        );
        changedItemIds.add(itemId);
      }
      deactivatedVariants += 1;
    }
  }

  if (deleteMissing) {
    const cleanup = await deleteCatalogRowsMissingFromApi(catalog);
    deletedItems = cleanup.deleted_items;
    deletedVariants = cleanup.deleted_variants;
    deletedRelatedDocs = cleanup.deleted_related_docs;
  }

  for (const itemId of changedItemIds) {
    try {
      await refreshOutletOrderCatalogForItem(db, itemId);
      outletCatalogRefreshed += 1;
    } catch (error) {
      logger.error(`Outlet catalog refresh failed for ${itemId}`, error);
    }
  }

  const report: SyncReport = {
    ok: true,
    generated_at: nowIso(),
    catalog_generated_at: catalog.generatedAt ?? null,
    summary: {
      api_products: products.length,
      created_items: createdItems,
      updated_items: updatedItems,
      updated_variants: updatedVariants,
      warehouses_upserted: catalog.warehouses?.length ?? 0,
      deactivated_items: deactivatedItems,
      deactivated_variants: deactivatedVariants,
      deleted_items: deletedItems,
      deleted_variants: deletedVariants,
      deleted_related_docs: deletedRelatedDocs,
      skipped_invalid_uuid: skippedInvalidUuid,
      skipped_portal_only: skippedPortalOnly,
      outlet_catalog_refreshed: outletCatalogRefreshed,
    },
    created,
  };

  await db.collection("stock_catalog_sync_state").doc("latest").set(report, { merge: true });
  return report;
}

export const syncStockCatalog = onCall(
  { region: "africa-south1", secrets: [stockSyncApiToken] },
  async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  if (stockCatalogSyncEnabled.value() !== "true") {
    throw new HttpsError("failed-precondition", "Stock catalog sync is disabled.");
  }

  const deactivateMissing = request.data?.deactivateMissing === true;
  const report = await runStockCatalogSync({ deactivateMissing });
  return report;
  },
);

export const syncStockCatalogScheduled = onSchedule(
  {
    // Cloud Scheduler does not support africa-south1.
    region: "europe-west1",
    // Sub-minute cadence is achieved by looping inside each 1-minute scheduler tick.
    schedule: stockCatalogSyncCron.value(),
    timeZone: "Africa/Lusaka",
    timeoutSeconds: 120,
    secrets: [stockSyncApiToken],
  },
  async () => {
    if (stockCatalogSyncEnabled.value() !== "true") {
      logger.info("Stock catalog sync skipped (STOCK_CATALOG_SYNC_ENABLED is not true).");
      return;
    }

    const intervalMs = resolveStockCatalogSyncIntervalMs();
    const deadlineMs = Date.now() + STOCK_CATALOG_SYNC_WINDOW_MS;

    while (Date.now() < deadlineMs) {
      try {
        const report = await runStockCatalogSync();
        logger.info("Stock catalog sync completed", report.summary);
      } catch (error) {
        logger.error("Stock catalog sync failed", error);
      }

      const remainingMs = deadlineMs - Date.now();
      if (remainingMs < intervalMs) break;
      await sleep(intervalMs);
    }
  },
);
