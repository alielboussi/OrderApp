"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncStockCatalogScheduled = exports.syncStockCatalog = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firebase_functions_1 = require("firebase-functions");
const stock_api_secrets_1 = require("./stock-api-secrets");
const stock_catalog_cleanup_1 = require("./stock-catalog-cleanup");
const DEFAULT_STOCK_CATALOG_API_URL = "https://afterten-stock-api-896827614552.us-central1.run.app/sync/catalog";
function nowIso() {
    return new Date().toISOString();
}
function normalizeWarehouseName(value) {
    return String(value ?? "")
        .trim()
        .replace(/^"+|"+$/g, "")
        .replace(/\s+/g, " ")
        .toLowerCase();
}
function cleanUnitName(value, fallback = "each") {
    const text = String(value ?? "").trim();
    return text.length ? text : fallback;
}
function inferItemKind(product) {
    const warehouseName = normalizeWarehouseName(product.warehouse?.name);
    if (warehouseName.includes("ingredient") ||
        warehouseName.includes("beverage") ||
        warehouseName.includes("coldroom") ||
        warehouseName.includes("storeroom")) {
        return "ingredient";
    }
    if (warehouseName.includes("raw"))
        return "raw";
    return "ingredient";
}
function mapProductUnits(product) {
    const consumptionUnit = cleanUnitName(product.unit?.name);
    const storageUnit = cleanUnitName(product.subUnit?.name, consumptionUnit);
    const unitsPerPurchasePack = Number(product.subUnit?.perUnit ?? 1);
    return {
        consumption_unit: consumptionUnit,
        consumption_uom: consumptionUnit,
        purchase_pack_unit: consumptionUnit,
        storage_unit: storageUnit,
        units_per_purchase_pack: Number.isFinite(unitsPerPurchasePack) && unitsPerPurchasePack > 0 ? unitsPerPurchasePack : 1,
        transfer_unit: consumptionUnit,
        transfer_quantity: 1,
        orders_app_uom: consumptionUnit,
    };
}
async function fetchStockCatalog() {
    const url = process.env.STOCK_CATALOG_SYNC_API_URL?.trim() || DEFAULT_STOCK_CATALOG_API_URL;
    const token = stock_api_secrets_1.stockSyncApiToken.value().trim();
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
    return (await response.json());
}
async function loadWarehouseMaps(db, apiWarehouses) {
    const byApiUuid = new Map();
    const byNormalizedName = new Map();
    const snapshot = await db.collection("warehouses").get();
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const stockApiUuid = typeof data.stock_api_uuid === "string" && data.stock_api_uuid.trim()
            ? data.stock_api_uuid.trim()
            : null;
        if (stockApiUuid)
            byApiUuid.set(stockApiUuid, doc.id);
        const normalizedName = normalizeWarehouseName(data.name);
        if (normalizedName)
            byNormalizedName.set(normalizedName, doc.id);
    }
    for (const warehouse of apiWarehouses) {
        const apiUuid = String(warehouse.uuid ?? "").trim();
        const normalizedName = normalizeWarehouseName(warehouse.name);
        if (!apiUuid || !normalizedName || byApiUuid.has(apiUuid))
            continue;
        const existingId = byNormalizedName.get(normalizedName);
        const docId = existingId ?? apiUuid;
        const ref = db.collection("warehouses").doc(docId);
        const existing = await ref.get();
        const createdAt = typeof existing.data()?.created_at === "string" ? existing.data()?.created_at : nowIso();
        await ref.set({
            name: String(warehouse.name ?? "").trim().replace(/^"+|"+$/g, "") || "Warehouse",
            active: warehouse.active !== false,
            stock_api_uuid: apiUuid,
            stock_api_synced_at: nowIso(),
            created_at: createdAt,
            updated_at: nowIso(),
        }, { merge: true });
        byApiUuid.set(apiUuid, docId);
        byNormalizedName.set(normalizedName, docId);
    }
    return { byApiUuid, byNormalizedName };
}
function resolveWarehouseId(product, maps) {
    const apiUuid = String(product.warehouse?.uuid ?? "").trim();
    if (apiUuid && maps.byApiUuid.has(apiUuid))
        return maps.byApiUuid.get(apiUuid) ?? null;
    const normalizedName = normalizeWarehouseName(product.warehouse?.name);
    if (normalizedName && maps.byNormalizedName.has(normalizedName)) {
        return maps.byNormalizedName.get(normalizedName) ?? null;
    }
    return null;
}
function collectWarehouseIds(product, maps) {
    const ids = new Set();
    const primary = resolveWarehouseId(product, maps);
    if (primary)
        ids.add(primary);
    for (const warehouse of product.alsoAllowedIn ?? []) {
        const apiUuid = String(warehouse.uuid ?? "").trim();
        if (apiUuid && maps.byApiUuid.has(apiUuid)) {
            ids.add(maps.byApiUuid.get(apiUuid));
            continue;
        }
        const normalizedName = normalizeWarehouseName(warehouse.name);
        if (normalizedName && maps.byNormalizedName.has(normalizedName)) {
            ids.add(maps.byNormalizedName.get(normalizedName));
        }
    }
    return [...ids];
}
async function syncStorageHomes(db, itemId, variantKey, warehouseIds) {
    const normalizedKey = variantKey && variantKey !== "base" ? variantKey : "base";
    const snapshot = await db.collection("item_storage_homes").where("item_id", "==", itemId).get();
    const existing = snapshot.docs.filter((doc) => String(doc.data().normalized_variant_key ?? doc.data().variant_key ?? "base") === normalizedKey);
    const keep = new Set(warehouseIds.filter(Boolean));
    const batch = db.batch();
    for (const doc of existing) {
        const warehouseId = doc.data().storage_warehouse_id;
        if (!keep.has(warehouseId))
            batch.delete(doc.ref);
    }
    for (const warehouseId of keep) {
        const docId = normalizedKey === "base"
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
async function runStockCatalogSync(options) {
    const deleteMissing = options?.deleteMissing ?? stock_api_secrets_1.stockCatalogSyncDeleteMissing.value() !== "false";
    const deactivateMissing = !deleteMissing &&
        (options?.deactivateMissing ?? stock_api_secrets_1.stockCatalogSyncDeactivateMissing.value() === "true");
    const db = (0, firestore_1.getFirestore)();
    const catalog = await fetchStockCatalog();
    const products = (catalog.products ?? []).filter((product) => String(product.uuid ?? "").trim());
    const warehouseMaps = await loadWarehouseMaps(db, catalog.warehouses ?? []);
    const [itemsSnap, variantsSnap] = await Promise.all([
        db.collection("catalog_items").get(),
        db.collection("catalog_variants").get(),
    ]);
    const itemsById = new Map(itemsSnap.docs.map((doc) => [doc.id, doc.data()]));
    const variantsById = new Map(variantsSnap.docs.map((doc) => [doc.id, doc.data()]));
    const variantParentIds = new Set(variantsSnap.docs.map((doc) => String(doc.get("item_id") ?? "")).filter(Boolean));
    const apiUuidSet = new Set(products.map((product) => String(product.uuid).trim()));
    let createdItems = 0;
    let updatedItems = 0;
    let updatedVariants = 0;
    let skippedInvalidUuid = 0;
    let deactivatedItems = 0;
    let deactivatedVariants = 0;
    let deletedItems = 0;
    let deletedVariants = 0;
    let deletedRelatedDocs = 0;
    const created = [];
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
        if (variantsById.has(uuid)) {
            const variant = variantsById.get(uuid);
            const itemId = String(variant.item_id ?? "");
            await db.collection("catalog_variants").doc(uuid).set({
                name: syncedFields.name,
                stock_api_uuid: uuid,
                stock_api_synced_at: syncedFields.stock_api_synced_at,
                stock_api_missing: false,
                active: true,
                updated_at: nowIso(),
            }, { merge: true });
            if (itemId && warehouseIds.length) {
                await syncStorageHomes(db, itemId, uuid, warehouseIds);
            }
            updatedVariants += 1;
            continue;
        }
        if (itemsById.has(uuid)) {
            await db.collection("catalog_items").doc(uuid).set({
                ...syncedFields,
                updated_at: nowIso(),
            }, { merge: true });
            if (!variantParentIds.has(uuid) && warehouseIds.length) {
                await syncStorageHomes(db, uuid, null, warehouseIds);
            }
            updatedItems += 1;
            continue;
        }
        const createdAt = nowIso();
        await db.collection("catalog_items").doc(uuid).set({
            ...syncedFields,
            item_kind: inferItemKind(product),
            sku: null,
            supplier_sku: null,
            cost: 0,
            selling_price: 0,
            orders_app_cost_price: 0,
            has_variations: false,
            has_recipe: false,
            outlet_order_visible: true,
            image_url: null,
            menu_group_id: null,
            created_at: createdAt,
            updated_at: createdAt,
        }, { merge: true });
        if (warehouseIds.length) {
            await syncStorageHomes(db, uuid, null, warehouseIds);
        }
        created.push({ uuid, name: syncedFields.name });
        createdItems += 1;
    }
    if (deactivateMissing) {
        for (const doc of itemsSnap.docs) {
            if (variantParentIds.has(doc.id))
                continue;
            if (apiUuidSet.has(doc.id))
                continue;
            if (doc.get("active") === false)
                continue;
            await doc.ref.set({ active: false, stock_api_missing: true, stock_api_synced_at: nowIso(), updated_at: nowIso() }, { merge: true });
            deactivatedItems += 1;
        }
        for (const doc of variantsSnap.docs) {
            if (apiUuidSet.has(doc.id))
                continue;
            if (doc.get("active") === false)
                continue;
            await doc.ref.set({ active: false, stock_api_missing: true, stock_api_synced_at: nowIso(), updated_at: nowIso() }, { merge: true });
            const itemId = String(doc.get("item_id") ?? "");
            if (itemId) {
                const activeVariants = await db
                    .collection("catalog_variants")
                    .where("item_id", "==", itemId)
                    .where("active", "==", true)
                    .get();
                const hasVariations = activeVariants.docs.some((variantDoc) => variantDoc.id !== "base");
                await db.collection("catalog_items").doc(itemId).set({ has_variations: hasVariations, updated_at: nowIso() }, { merge: true });
            }
            deactivatedVariants += 1;
        }
    }
    if (deleteMissing) {
        const cleanup = await (0, stock_catalog_cleanup_1.deleteCatalogRowsMissingFromApi)(catalog);
        deletedItems = cleanup.deleted_items;
        deletedVariants = cleanup.deleted_variants;
        deletedRelatedDocs = cleanup.deleted_related_docs;
    }
    const report = {
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
        },
        created,
    };
    await db.collection("stock_catalog_sync_state").doc("latest").set(report, { merge: true });
    return report;
}
exports.syncStockCatalog = (0, https_1.onCall)({ region: "africa-south1", secrets: [stock_api_secrets_1.stockSyncApiToken] }, async (request) => {
    if (!request.auth?.uid) {
        throw new https_1.HttpsError("unauthenticated", "Sign in required.");
    }
    if (stock_api_secrets_1.stockCatalogSyncEnabled.value() !== "true") {
        throw new https_1.HttpsError("failed-precondition", "Stock catalog sync is disabled.");
    }
    const deactivateMissing = request.data?.deactivateMissing === true;
    const report = await runStockCatalogSync({ deactivateMissing });
    return report;
});
exports.syncStockCatalogScheduled = (0, scheduler_1.onSchedule)({
    // Cloud Scheduler does not support africa-south1.
    region: "europe-west1",
    schedule: process.env.STOCK_CATALOG_SYNC_CRON ?? "every 5 minutes",
    timeZone: "Africa/Lusaka",
    secrets: [stock_api_secrets_1.stockSyncApiToken],
}, async () => {
    if (stock_api_secrets_1.stockCatalogSyncEnabled.value() !== "true") {
        firebase_functions_1.logger.info("Stock catalog sync skipped (STOCK_CATALOG_SYNC_ENABLED is not true).");
        return;
    }
    const report = await runStockCatalogSync();
    firebase_functions_1.logger.info("Stock catalog sync completed", report.summary);
});
//# sourceMappingURL=stock-catalog-sync.js.map