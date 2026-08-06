"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshOutletOrderCatalogForItem = refreshOutletOrderCatalogForItem;
function asText(value, fallback = "") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function toNumber(value, fallback = 0) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return fallback;
}
function readImageUrl(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
async function deleteOutletOrderCatalog(db, outletId) {
    const snapshot = await db.collection("outlet_order_catalog").where("outletId", "==", outletId).get();
    if (snapshot.empty)
        return;
    const batchSize = 400;
    for (let index = 0; index < snapshot.docs.length; index += batchSize) {
        const batch = db.batch();
        snapshot.docs.slice(index, index + batchSize).forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
    }
}
async function materializeOutletOrderCatalog(db, outletId, allowlistRows) {
    const now = new Date().toISOString();
    const [itemsSnap, variantsSnap] = await Promise.all([
        db.collection("catalog_items").get(),
        db.collection("catalog_variants").where("active", "==", true).get(),
    ]);
    const itemsById = new Map(itemsSnap.docs.map((doc) => [doc.id, doc.data()]));
    const variantsById = new Map(variantsSnap.docs.map((doc) => [doc.id, doc.data()]));
    const catalogDocs = [];
    for (const row of allowlistRows) {
        const item = itemsById.get(row.item_id);
        if (!item || item.active === false)
            continue;
        const consumptionUom = asText(item.consumption_uom ?? item.consumption_unit, "each");
        const ordersAppUom = asText(item.orders_app_uom) || consumptionUom;
        const supervisorUom = asText(item.supervisor_uom) || ordersAppUom;
        const ordersAppCostPrice = toNumber(item.orders_app_cost_price ?? item.selling_price ?? item.cost, 0);
        if (row.variant_id) {
            const variant = variantsById.get(row.variant_id);
            if (!variant || variant.active === false)
                continue;
            const variantImageUrl = readImageUrl(variant.image_url);
            const productImageUrl = readImageUrl(item.image_url);
            const variantOrdersAppCostPrice = toNumber(variant.orders_app_cost_price ??
                variant.selling_price ??
                item.orders_app_cost_price ??
                item.selling_price ??
                variant.cost ??
                item.cost, 0);
            catalogDocs.push({
                id: `${outletId}_${row.item_id}_${row.variant_id}`,
                data: {
                    outletId,
                    productId: row.item_id,
                    variantId: row.variant_id,
                    productName: asText(item.name, "Item"),
                    product_name: asText(item.name, "Item"),
                    variantKey: asText(variant.sku, row.variant_id),
                    name: asText(variant.name, asText(item.name, "Item")),
                    sku: asText(variant.sku) || asText(item.sku) || null,
                    sellingPrice: variantOrdersAppCostPrice,
                    ordersAppCostPrice: variantOrdersAppCostPrice,
                    ordersAppUom: asText(variant.orders_app_uom) || ordersAppUom,
                    supervisorUom: asText(variant.supervisor_uom) || supervisorUom,
                    consumptionUom: asText(variant.orders_app_uom) || ordersAppUom,
                    unitsPerPurchasePack: toNumber(item.units_per_purchase_pack, 1),
                    hasVariations: true,
                    imageUrl: variantImageUrl,
                    image_url: variantImageUrl,
                    productImageUrl,
                    product_image_url: productImageUrl,
                    active: true,
                    updatedAt: now,
                },
            });
            continue;
        }
        const productImageUrl = readImageUrl(item.image_url);
        catalogDocs.push({
            id: `${outletId}_${row.item_id}`,
            data: {
                outletId,
                productId: row.item_id,
                variantId: null,
                productName: asText(item.name, "Item"),
                product_name: asText(item.name, "Item"),
                variantKey: null,
                name: asText(item.name, "Item"),
                sku: asText(item.sku) || null,
                sellingPrice: ordersAppCostPrice,
                ordersAppCostPrice,
                ordersAppUom,
                supervisorUom,
                consumptionUom: ordersAppUom,
                unitsPerPurchasePack: toNumber(item.units_per_purchase_pack, 1),
                hasVariations: item.has_variations === true,
                imageUrl: productImageUrl,
                image_url: productImageUrl,
                productImageUrl,
                product_image_url: productImageUrl,
                active: true,
                updatedAt: now,
            },
        });
    }
    await deleteOutletOrderCatalog(db, outletId);
    if (!catalogDocs.length)
        return;
    const batchSize = 400;
    for (let index = 0; index < catalogDocs.length; index += batchSize) {
        const batch = db.batch();
        for (const entry of catalogDocs.slice(index, index + batchSize)) {
            batch.set(db.collection("outlet_order_catalog").doc(entry.id), entry.data, { merge: true });
        }
        await batch.commit();
    }
}
async function refreshOutletOrderCatalogForItem(db, itemId) {
    const allowlistSnap = await db
        .collection("outlet_catalog_allowlist")
        .where("item_id", "==", itemId)
        .where("allow_orders", "==", true)
        .get();
    if (allowlistSnap.empty)
        return;
    const outletIds = [
        ...new Set(allowlistSnap.docs
            .map((doc) => String(doc.get("outlet_id") ?? ""))
            .filter((outletId) => outletId.length > 0)),
    ];
    for (const outletId of outletIds) {
        const outletAllowlistSnap = await db
            .collection("outlet_catalog_allowlist")
            .where("outlet_id", "==", outletId)
            .where("allow_orders", "==", true)
            .get();
        const rows = outletAllowlistSnap.docs.map((doc) => ({
            item_id: String(doc.get("item_id") ?? ""),
            variant_id: doc.get("variant_id") ? String(doc.get("variant_id")) : null,
        }));
        await materializeOutletOrderCatalog(db, outletId, rows);
    }
}
//# sourceMappingURL=outlet-order-catalog-refresh.js.map