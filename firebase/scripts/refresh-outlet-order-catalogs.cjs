/**
 * Rebuild outlet_order_catalog from catalog_items/variants + allowlist.
 * Run after bulk UOM or image updates so the Orders app picks up changes.
 *
 *   cd C:\Projects\Afterten\firebase\functions
 *   node ../scripts/refresh-outlet-order-catalogs.cjs
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));
const { normalizeUomCode } = require("./uom-codes.cjs");

const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
const db = admin.firestore();

function asText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function resolveOrdersAppDisplayName(source, fallback) {
  const special = asText(source.orders_app_name) || asText(source.ordersAppName);
  if (special) return special;
  return fallback;
}

async function deleteOutletOrderCatalog(outletId) {
  const snapshot = await db.collection("outlet_order_catalog").where("outletId", "==", outletId).get();
  if (snapshot.empty) return 0;
  const batchSize = 400;
  let deleted = 0;
  for (let index = 0; index < snapshot.docs.length; index += batchSize) {
    const batch = db.batch();
    snapshot.docs.slice(index, index + batchSize).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += Math.min(batchSize, snapshot.docs.length - index);
  }
  return deleted;
}

function readSupervisorUomQtyPerUnit(source) {
  const ordersQty = toNumber(source.orders_uom_conversion_qty ?? source.ordersUomConversionQty, 0);
  const supervisorQty = toNumber(source.supervisor_uom_conversion_qty ?? source.supervisorUomConversionQty, 0);
  if (ordersQty > 0 && supervisorQty > 0) {
    return Math.max(1, Math.round(ordersQty / supervisorQty));
  }
  const perUnit = toNumber(source.supervisor_uom_qty_per_unit ?? source.supervisorUomQtyPerUnit, 1);
  return perUnit > 0 ? perUnit : 1;
}

function readOrderFields(source) {
  const ordersAppUom = normalizeUomCode(asText(source.orders_app_uom), "pc");
  const consumptionUom = normalizeUomCode(
    asText(source.consumption_uom || source.consumption_unit),
    ordersAppUom,
  );
  const supervisorUom = normalizeUomCode(asText(source.supervisor_uom), ordersAppUom);
  const supervisorUomQtyPerUnit = readSupervisorUomQtyPerUnit(source);
  const ordersAppCostPrice = toNumber(source.orders_app_cost_price, 0);
  const uomWeightEnabled = source.uom_weight_enabled === true;
  const uomWeightGrams = uomWeightEnabled ? toNumber(source.uom_weight_grams, 0) || null : null;
  const rawDisplayOrder = source.orders_app_display_order ?? source.ordersAppDisplayOrder;
  const ordersAppDisplayOrder =
    rawDisplayOrder != null && Number.isFinite(Number(rawDisplayOrder)) && Number(rawDisplayOrder) >= 0
      ? Math.floor(Number(rawDisplayOrder))
      : null;
  return {
    ordersAppUom,
    orders_app_uom: ordersAppUom,
    consumptionUom,
    consumption_uom: consumptionUom,
    supervisorUom,
    supervisor_uom: supervisorUom,
    supervisorUomQtyPerUnit,
    supervisor_uom_qty_per_unit: supervisorUomQtyPerUnit,
    ordersAppCostPrice,
    orders_app_cost_price: ordersAppCostPrice,
    sellingPrice: ordersAppCostPrice,
    uomWeightEnabled,
    uom_weight_enabled: uomWeightEnabled,
    uomWeightGrams,
    uom_weight_grams: uomWeightGrams,
    ordersAppDisplayOrder,
    orders_app_display_order: ordersAppDisplayOrder,
  };
}

async function materializeOutlet(outletId, allowlistRows, itemsById, variantsById) {
  const now = new Date().toISOString();
  const catalogDocs = [];

  for (const row of allowlistRows) {
    const item = itemsById.get(row.item_id);
    if (!item || item.active === false) continue;

    const itemKind = asText(item.item_kind, "finished");

    if (row.variant_id) {
      const variant = variantsById.get(row.variant_id);
      if (!variant || variant.active === false) continue;
      const variantImageUrl = asText(variant.image_url) || asText(variant.imageUrl) || null;
      const productImageUrl = asText(item.image_url) || asText(item.imageUrl) || null;
      const catalogName = asText(item.name) || "Item";
      const variantName = asText(variant.name) || catalogName;
      const itemOrdersAppName = asText(item.orders_app_name) || asText(item.ordersAppName) || null;
      const ordersAppName = resolveOrdersAppDisplayName({ ...item, ...variant }, variantName);
      catalogDocs.push({
        id: `${outletId}_${row.item_id}_${row.variant_id}`,
        data: {
          outletId,
          productId: row.item_id,
          variantId: row.variant_id,
          productName: catalogName,
          product_name: catalogName,
          ordersAppName: itemOrdersAppName,
          orders_app_name: itemOrdersAppName,
          variantKey: asText(variant.sku) || row.variant_id,
          itemKind,
          name: ordersAppName,
          sku: asText(variant.sku) || asText(item.sku) || null,
          ...readOrderFields({ ...item, ...variant }),
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

    const imageUrl = asText(item.image_url) || asText(item.imageUrl) || null;
    const catalogName = asText(item.name) || "Item";
    const itemOrdersAppName = asText(item.orders_app_name) || asText(item.ordersAppName) || null;
    const ordersAppName = resolveOrdersAppDisplayName(item, catalogName);
    catalogDocs.push({
      id: `${outletId}_${row.item_id}`,
      data: {
        outletId,
        productId: row.item_id,
        variantId: null,
        productName: catalogName,
        product_name: catalogName,
        ordersAppName: itemOrdersAppName,
        orders_app_name: itemOrdersAppName,
        variantKey: null,
        itemKind,
        name: ordersAppName,
        sku: asText(item.sku) || null,
        ...readOrderFields(item),
        hasVariations: item.has_variations === true,
        imageUrl,
        image_url: imageUrl,
        productImageUrl: imageUrl,
        product_image_url: imageUrl,
        active: true,
        updatedAt: now,
      },
    });
  }

  await deleteOutletOrderCatalog(outletId);
  if (!catalogDocs.length) return 0;

  const batchSize = 400;
  for (let index = 0; index < catalogDocs.length; index += batchSize) {
    const batch = db.batch();
    for (const entry of catalogDocs.slice(index, index + batchSize)) {
      batch.set(db.collection("outlet_order_catalog").doc(entry.id), entry.data);
    }
    await batch.commit();
  }
  return catalogDocs.length;
}

async function main() {
  const [itemsSnap, variantsSnap, allowlistSnap] = await Promise.all([
    db.collection("catalog_items").get(),
    db.collection("catalog_variants").get(),
    db.collection("outlet_catalog_allowlist").where("allow_orders", "==", true).get(),
  ]);

  const itemsById = new Map(itemsSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));
  const variantsById = new Map(variantsSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));
  const rowsByOutlet = new Map();

  for (const doc of allowlistSnap.docs) {
    const outletId = asText(doc.get("outlet_id"));
    const itemId = asText(doc.get("item_id"));
    if (!outletId || !itemId) continue;
    const rows = rowsByOutlet.get(outletId) ?? [];
    rows.push({
      item_id: itemId,
      variant_id: doc.get("variant_id") ? asText(doc.get("variant_id")) : null,
    });
    rowsByOutlet.set(outletId, rows);
  }

  console.log(`Refreshing outlet_order_catalog for ${rowsByOutlet.size} outlet(s)...`);
  for (const [outletId, rows] of rowsByOutlet.entries()) {
    const count = await materializeOutlet(outletId, rows, itemsById, variantsById);
    console.log(`  ${outletId}: ${count} catalog row(s)`);
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
