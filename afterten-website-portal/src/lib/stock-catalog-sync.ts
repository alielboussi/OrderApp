import { getFirestoreDb } from "@/lib/firebase-server";
import {
  listFirestoreCatalogItems,
  listFirestoreCatalogVariants,
  refreshFirestoreHasVariations,
  syncFirestoreBaseStorageHomes,
  syncFirestoreVariantStorageHomes,
  updateFirestoreCatalogItem,
  updateFirestoreCatalogVariant,
  upsertFirestoreCatalogItemById,
} from "@/lib/firestore-catalog-store";
import { refreshOutletOrderCatalogForItem } from "@/lib/firestore-outlet-catalog-access";
import {
  fetchStockCatalog,
  type StockApiCatalogProduct,
  type StockApiWarehouseRef,
} from "@/lib/stock-api-client";
import { runStockCatalogCleanup } from "@/lib/stock-catalog-cleanup";
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
} from "@/lib/catalog-api-sync-matching";

/**
 * BILLING SAFETY: hardcoded OFF.
 * Full catalog sync scans catalog_items + catalog_variants and previously caused
 * ~$20–25/day when run on a schedule. Do NOT flip this via env. To run a rare
 * manual sync, change this constant in code, deploy, run once, then set false again.
 * Never reintroduce Cloud Scheduler / onSchedule for this.
 */
export const STOCK_CATALOG_SYNC_ENABLED = false;

/** Default false so a mistaken sync cannot mass-delete portal catalog rows. */
export const STOCK_CATALOG_SYNC_DELETE_MISSING = false;

type WarehouseMaps = {
  byApiUuid: Map<string, string>;
  byNormalizedName: Map<string, string>;
};

export type StockCatalogSyncReport = {
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
  api_missing_from_portal_before: Array<{ uuid: string; name: string }>;
};

function nowIso(): string {
  return new Date().toISOString();
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
    units_per_purchase_pack: Number.isFinite(unitsPerPurchasePack) && unitsPerPurchasePack > 0
      ? unitsPerPurchasePack
      : 1,
  };
}

function buildSyncedFields(product: StockApiCatalogProduct, warehouseId: string | null) {
  const units = mapProductUnits(product);
  return {
    name: String(product.name ?? "").trim() || "Unnamed product",
    ...units,
    track_stock: product.trackStock !== false,
    stock_api_uuid: product.uuid,
    stock_api_warehouse_uuid: product.warehouse?.uuid ?? null,
    stock_api_synced_at: nowIso(),
    stock_api_missing: false,
    default_warehouse_id: warehouseId,
    active: true,
  };
}

async function loadWarehouseMaps(apiWarehouses: StockApiWarehouseRef[]): Promise<WarehouseMaps> {
  const db = getFirestoreDb();
  const snapshot = await db.collection("warehouses").get();
  const byApiUuid = new Map<string, string>();
  const byNormalizedName = new Map<string, string>();

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
    if (!apiUuid || !normalizedName) continue;
    if (byApiUuid.has(apiUuid)) continue;

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
  maps: WarehouseMaps,
): string | null {
  const apiUuid = String(product.warehouse?.uuid ?? "").trim();
  if (apiUuid && maps.byApiUuid.has(apiUuid)) {
    return maps.byApiUuid.get(apiUuid) ?? null;
  }

  const normalizedName = normalizeWarehouseName(product.warehouse?.name);
  if (normalizedName && maps.byNormalizedName.has(normalizedName)) {
    return maps.byNormalizedName.get(normalizedName) ?? null;
  }

  return null;
}

function collectWarehouseIds(product: StockApiCatalogProduct, maps: WarehouseMaps): string[] {
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

async function persistSyncState(report: StockCatalogSyncReport) {
  await getFirestoreDb().collection("stock_catalog_sync_state").doc("latest").set(report, { merge: true });
}

export async function getLatestStockCatalogSyncReport(): Promise<StockCatalogSyncReport | null> {
  const snap = await getFirestoreDb().collection("stock_catalog_sync_state").doc("latest").get();
  if (!snap.exists) return null;
  return snap.data() as StockCatalogSyncReport;
}

export async function syncStockCatalogToPortal(options?: {
  deactivateMissing?: boolean;
  deleteMissing?: boolean;
}): Promise<StockCatalogSyncReport> {
  const deleteMissing =
    options?.deleteMissing ?? STOCK_CATALOG_SYNC_DELETE_MISSING;
  const deactivateMissing =
    !deleteMissing && (options?.deactivateMissing ?? false);

  const catalog = await fetchStockCatalog();
  const products = (catalog.products ?? []).filter((product) => String(product.uuid ?? "").trim());
  const warehouseMaps = await loadWarehouseMaps(catalog.warehouses ?? []);

  const [items, variants] = await Promise.all([
    listFirestoreCatalogItems(),
    listFirestoreCatalogVariants({ activeOnly: false }),
  ]);

  const lookups = buildCatalogSyncLookups(items, variants);
  const apiUuidSet = new Set(products.map((product) => String(product.uuid).trim()));
  const changedItemIds = new Set<string>();
  const created: Array<{ uuid: string; name: string }> = [];

  let createdItems = 0;
  let updatedItems = 0;
  let updatedVariants = 0;
  let skippedInvalidUuid = 0;
  let skippedPortalOnly = 0;

  for (const product of products) {
    const uuid = String(product.uuid ?? "").trim();
    if (!uuid) {
      skippedInvalidUuid += 1;
      continue;
    }

    const warehouseIds = collectWarehouseIds(product, warehouseMaps);
    const primaryWarehouseId = warehouseIds[0] ?? null;
    const syncedFields = buildSyncedFields(product, primaryWarehouseId);
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
        await updateFirestoreCatalogVariant(existingVariant.variantId, variantPayload);
        updatedVariants += 1;
        if (existingVariant.itemId) changedItemIds.add(existingVariant.itemId);
      }
      if (existingVariant.itemId && warehouseIds.length) {
        await syncFirestoreVariantStorageHomes(existingVariant.itemId, existingVariant.variantId, warehouseIds);
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
        // Portal order UOMs/names are never part of syncedFields — merge leaves them intact.
        await updateFirestoreCatalogItem(existingItem.itemId, syncedFields);
        updatedItems += 1;
        changedItemIds.add(existingItem.itemId);
      }
      if (lookups.variantParentIds.has(existingItem.itemId)) {
        continue;
      }
      if (warehouseIds.length) {
        await syncFirestoreBaseStorageHomes(existingItem.itemId, warehouseIds);
      }
      continue;
    }

    const itemKind = inferItemKind(product);
    if (!itemKind || !isApiManagedItemKind(itemKind)) {
      skippedPortalOnly += 1;
      continue;
    }

    await upsertFirestoreCatalogItemById(uuid, {
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
    });
    if (warehouseIds.length) {
      await syncFirestoreBaseStorageHomes(uuid, warehouseIds);
    }
    created.push({ uuid, name: syncedFields.name });
    createdItems += 1;
    changedItemIds.add(uuid);
  }

  let deactivatedItems = 0;
  let deactivatedVariants = 0;
  let deletedItems = 0;
  let deletedVariants = 0;
  let deletedRelatedDocs = 0;

  if (deactivateMissing) {
    for (const item of items) {
      const itemId = String(item.id ?? "");
      if (!itemId || lookups.variantParentIds.has(itemId)) continue;
      if (isPortalOnlyCatalogItem(item)) continue;
      if (rowLinkedToApiUuid(itemId, item.stock_api_uuid, apiUuidSet)) continue;
      if (item.active === false) continue;
      await updateFirestoreCatalogItem(itemId, {
        active: false,
        stock_api_missing: true,
        stock_api_synced_at: nowIso(),
      });
      deactivatedItems += 1;
      changedItemIds.add(itemId);
    }

    for (const variant of variants) {
      const variantId = String(variant.id ?? "");
      if (!variantId || rowLinkedToApiUuid(variantId, variant.stock_api_uuid, apiUuidSet)) continue;
      const itemId = String(variant.item_id ?? "");
      if (isPortalOnlyCatalogVariant(itemId, lookups)) continue;
      if (variant.active === false) continue;
      await updateFirestoreCatalogVariant(variantId, {
        active: false,
        stock_api_missing: true,
        stock_api_synced_at: nowIso(),
      });
      if (itemId) {
        await refreshFirestoreHasVariations(itemId);
        changedItemIds.add(itemId);
      }
      deactivatedVariants += 1;
    }
  }

  if (deleteMissing) {
    const cleanup = await runStockCatalogCleanup({
      dryRun: false,
      refreshOutletCatalogs: true,
      catalogPayload: catalog,
    });
    deletedItems = cleanup.plan.summary.items_to_delete;
    deletedVariants = cleanup.plan.summary.variants_to_delete;
    deletedRelatedDocs = Math.max(0, (cleanup.deleted_docs ?? 0) - deletedItems - deletedVariants);
  }

  let outletCatalogRefreshed = 0;
  for (const itemId of changedItemIds) {
    try {
      await refreshOutletOrderCatalogForItem(itemId);
      outletCatalogRefreshed += 1;
    } catch (error) {
      console.error(`[stock-catalog-sync] outlet catalog refresh failed for ${itemId}`, error);
    }
  }

  const apiMissingBefore = products
    .filter((product) => {
      const uuid = String(product.uuid).trim();
      return !resolveSyncItemTarget(uuid, lookups) && !resolveSyncVariantTarget(uuid, lookups);
    })
    .map((product) => ({ uuid: product.uuid, name: product.name }));

  const report: StockCatalogSyncReport = {
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
    api_missing_from_portal_before: apiMissingBefore,
  };

  await persistSyncState(report);
  return report;
}
