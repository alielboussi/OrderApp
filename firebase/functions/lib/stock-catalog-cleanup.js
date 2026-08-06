"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCatalogRowsMissingFromApi = deleteCatalogRowsMissingFromApi;
const firestore_1 = require("firebase-admin/firestore");
function chunk(values, size) {
    const chunks = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}
async function deleteDocs(db, paths) {
    if (!paths.length)
        return 0;
    let deleted = 0;
    for (const group of chunk(paths, 400)) {
        const batch = db.batch();
        for (const path of group) {
            const slash = path.indexOf("/");
            if (slash < 0)
                continue;
            batch.delete(db.collection(path.slice(0, slash)).doc(path.slice(slash + 1)));
        }
        await batch.commit();
        deleted += group.length;
    }
    return deleted;
}
async function planCleanup(db, catalogPayload) {
    const [itemsSnap, variantsSnap] = await Promise.all([
        db.collection("catalog_items").get(),
        db.collection("catalog_variants").get(),
    ]);
    const apiUuids = new Set((catalogPayload.products ?? [])
        .map((product) => String(product.uuid ?? "").trim())
        .filter(Boolean));
    function linkedToApi(docId, stockApiUuid) {
        if (apiUuids.has(docId))
            return true;
        const linkedUuid = String(stockApiUuid ?? "").trim();
        return Boolean(linkedUuid && apiUuids.has(linkedUuid));
    }
    const variantsByItem = new Map();
    for (const doc of variantsSnap.docs) {
        const itemId = String(doc.get("item_id") ?? "").trim();
        if (!itemId)
            continue;
        const list = variantsByItem.get(itemId) ?? [];
        list.push({ id: doc.id });
        variantsByItem.set(itemId, list);
    }
    const variantsToDelete = [];
    const keptVariantIds = new Set();
    for (const doc of variantsSnap.docs) {
        if (linkedToApi(doc.id, doc.get("stock_api_uuid"))) {
            keptVariantIds.add(doc.id);
            continue;
        }
        variantsToDelete.push({ id: doc.id });
    }
    const itemsToDelete = [];
    const keptItemIds = new Set();
    for (const doc of itemsSnap.docs) {
        const itemId = doc.id;
        const variants = variantsByItem.get(itemId) ?? [];
        const keptVariants = variants.filter((variant) => keptVariantIds.has(variant.id));
        if (variants.length > 0) {
            if (keptVariants.length === 0) {
                itemsToDelete.push({ id: itemId });
                continue;
            }
            keptItemIds.add(itemId);
            continue;
        }
        if (linkedToApi(itemId, doc.get("stock_api_uuid"))) {
            keptItemIds.add(itemId);
            continue;
        }
        itemsToDelete.push({ id: itemId });
    }
    const deleteItemIds = new Set(itemsToDelete.map((row) => row.id));
    const deleteVariantIds = new Set(variantsToDelete.map((row) => row.id));
    const [allowlistSnap, orderCatalogSnap, storageSnap, posMapSnap, orderRoutesSnap, bindingsSnap,] = await Promise.all([
        db.collection("outlet_catalog_allowlist").get(),
        db.collection("outlet_order_catalog").get(),
        db.collection("item_storage_homes").get(),
        db.collection("pos_item_map").get(),
        db.collection("outlet_order_routes").get(),
        db.collection("outlet_catalog_bindings").get(),
    ]);
    let orphanAllowlist = 0;
    let orphanOrderCatalog = 0;
    let orphanStorage = 0;
    let orphanPosMap = 0;
    let orphanRoutes = 0;
    const paths = [];
    for (const doc of allowlistSnap.docs) {
        const itemId = String(doc.get("item_id") ?? "");
        const variantId = doc.get("variant_id") ? String(doc.get("variant_id")) : null;
        if (deleteItemIds.has(itemId) || (variantId && deleteVariantIds.has(variantId))) {
            orphanAllowlist += 1;
            paths.push(`outlet_catalog_allowlist/${doc.id}`);
        }
    }
    for (const doc of orderCatalogSnap.docs) {
        const productId = String(doc.get("productId") ?? doc.get("product_id") ?? "");
        const variantId = doc.get("variantId") ?? doc.get("variant_id");
        const variantKey = variantId ? String(variantId) : null;
        if (deleteItemIds.has(productId) || (variantKey && deleteVariantIds.has(variantKey))) {
            orphanOrderCatalog += 1;
            paths.push(`outlet_order_catalog/${doc.id}`);
        }
    }
    for (const doc of storageSnap.docs) {
        const itemId = String(doc.get("item_id") ?? "");
        if (deleteItemIds.has(itemId)) {
            orphanStorage += 1;
            paths.push(`item_storage_homes/${doc.id}`);
        }
    }
    for (const doc of posMapSnap.docs) {
        const itemId = String(doc.get("catalog_item_id") ?? doc.get("item_id") ?? "");
        const variantId = doc.get("catalog_variant_id") ?? doc.get("variant_id");
        if (deleteItemIds.has(itemId) || (variantId && deleteVariantIds.has(String(variantId)))) {
            orphanPosMap += 1;
            paths.push(`pos_item_map/${doc.id}`);
        }
    }
    for (const doc of orderRoutesSnap.docs) {
        const itemId = String(doc.get("itemId") ?? doc.get("item_id") ?? "");
        const variantKey = String(doc.get("variantKey") ?? doc.get("variant_key") ?? "");
        if (deleteItemIds.has(itemId) || (variantKey && variantKey !== "base" && deleteVariantIds.has(variantKey))) {
            orphanRoutes += 1;
            paths.push(`outlet_order_routes/${doc.id}`);
        }
    }
    for (const doc of bindingsSnap.docs) {
        const itemId = String(doc.get("catalogItemId") ?? doc.get("catalog_item_id") ?? "");
        const variantId = doc.get("catalogVariantId") ?? doc.get("catalog_variant_id");
        if (deleteItemIds.has(itemId) || (variantId && deleteVariantIds.has(String(variantId)))) {
            paths.push(`outlet_catalog_bindings/${doc.id}`);
        }
    }
    for (const variantId of deleteVariantIds) {
        paths.push(`catalog_variants/${variantId}`);
    }
    for (const itemId of deleteItemIds) {
        paths.push(`catalog_items/${itemId}`);
    }
    const deleted_docs = await deleteDocs(db, paths);
    return {
        plan: {
            summary: {
                items_to_delete: itemsToDelete.length,
                variants_to_delete: variantsToDelete.length,
                orphan_allowlist_rows: orphanAllowlist,
                orphan_order_catalog_rows: orphanOrderCatalog,
                orphan_storage_homes: orphanStorage,
                orphan_pos_item_map_rows: orphanPosMap,
                orphan_order_route_rows: orphanRoutes,
            },
            items_to_delete: itemsToDelete,
            variants_to_delete: variantsToDelete,
        },
        deleted_docs,
    };
}
async function deleteCatalogRowsMissingFromApi(catalogPayload) {
    const db = (0, firestore_1.getFirestore)();
    const result = await planCleanup(db, catalogPayload);
    const deletedItems = result.plan.summary.items_to_delete;
    const deletedVariants = result.plan.summary.variants_to_delete;
    return {
        deleted_docs: result.deleted_docs,
        deleted_items: deletedItems,
        deleted_variants: deletedVariants,
        deleted_related_docs: Math.max(0, result.deleted_docs - deletedItems - deletedVariants),
    };
}
//# sourceMappingURL=stock-catalog-cleanup.js.map