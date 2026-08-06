/**
 * Rebuild outlet_order_catalog from catalog_items/variants + allowlist.
 * Run after bulk image updates so the Orders app picks up imageUrl fields.
 *
 *   cd C:\Projects\Afterten\firebase\functions
 *   node ../scripts/refresh-outlet-order-catalogs.cjs
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
const db = admin.firestore();

function asText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
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

async function materializeOutlet(outletId, allowlistRows, itemsById, variantsById) {
  const now = new Date().toISOString();
  const catalogDocs = [];

  for (const row of allowlistRows) {
    const item = itemsById.get(row.item_id);
    if (!item || item.active === false) continue;

    if (row.variant_id) {
      const variant = variantsById.get(row.variant_id);
      if (!variant || variant.active === false) continue;
      const variantImageUrl =
        asText(variant.image_url) ||
        asText(variant.imageUrl) ||
        null;
      const productImageUrl =
        asText(item.image_url) ||
        asText(item.imageUrl) ||
        null;
      catalogDocs.push({
        id: `${outletId}_${row.item_id}_${row.variant_id}`,
        data: {
          outletId,
          productId: row.item_id,
          variantId: row.variant_id,
          productName: asText(item.name) || "Item",
          product_name: asText(item.name) || "Item",
          variantKey: asText(variant.sku) || row.variant_id,
          name: asText(variant.name) || asText(item.name) || "Item",
          sku: asText(variant.sku) || asText(item.sku) || null,
          sellingPrice: Number(variant.orders_app_cost_price ?? variant.selling_price ?? item.selling_price ?? 0),
          ordersAppCostPrice: Number(variant.orders_app_cost_price ?? variant.selling_price ?? item.selling_price ?? 0),
          ordersAppUom: asText(variant.orders_app_uom) || asText(item.orders_app_uom) || asText(item.consumption_uom) || "each",
          consumptionUom: asText(variant.orders_app_uom) || asText(item.orders_app_uom) || asText(item.consumption_uom) || "each",
          unitsPerPurchasePack: Number(item.units_per_purchase_pack ?? 1),
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
    catalogDocs.push({
      id: `${outletId}_${row.item_id}`,
      data: {
        outletId,
        productId: row.item_id,
        variantId: null,
        productName: asText(item.name) || "Item",
        product_name: asText(item.name) || "Item",
        variantKey: null,
        name: asText(item.name) || "Item",
        sku: asText(item.sku) || null,
        sellingPrice: Number(item.orders_app_cost_price ?? item.selling_price ?? 0),
        ordersAppCostPrice: Number(item.orders_app_cost_price ?? item.selling_price ?? 0),
        ordersAppUom: asText(item.orders_app_uom) || asText(item.consumption_uom) || "each",
        consumptionUom: asText(item.orders_app_uom) || asText(item.consumption_uom) || "each",
        unitsPerPurchasePack: Number(item.units_per_purchase_pack ?? 1),
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
      batch.set(db.collection("outlet_order_catalog").doc(entry.id), entry.data, { merge: true });
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
