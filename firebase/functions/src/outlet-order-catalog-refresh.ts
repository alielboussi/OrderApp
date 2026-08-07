import type { Firestore } from "firebase-admin/firestore";

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readImageUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOrderFields(source: Record<string, unknown>) {
  const ordersAppUom = asText(source.orders_app_uom, "pc");
  const consumptionUom = asText(source.consumption_uom ?? source.consumption_unit, ordersAppUom);
  const supervisorUom = asText(source.supervisor_uom, ordersAppUom);
  const supervisorUomQtyPerUnit = toNumber(source.supervisor_uom_qty_per_unit, 1);
  const ordersAppCostPrice = toNumber(source.orders_app_cost_price, 0);
  const uomWeightEnabled = source.uom_weight_enabled === true;
  const uomWeightGrams = uomWeightEnabled ? toNumber(source.uom_weight_grams, 0) || null : null;
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
    uomWeightGrams: uomWeightGrams,
    uom_weight_grams: uomWeightGrams,
  };
}

async function deleteOutletOrderCatalog(db: Firestore, outletId: string) {
  const snapshot = await db.collection("outlet_order_catalog").where("outletId", "==", outletId).get();
  if (snapshot.empty) return;

  const batchSize = 400;
  for (let index = 0; index < snapshot.docs.length; index += batchSize) {
    const batch = db.batch();
    snapshot.docs.slice(index, index + batchSize).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function materializeOutletOrderCatalog(
  db: Firestore,
  outletId: string,
  allowlistRows: Array<{ item_id: string; variant_id: string | null }>,
) {
  const now = new Date().toISOString();
  const [itemsSnap, variantsSnap] = await Promise.all([
    db.collection("catalog_items").get(),
    db.collection("catalog_variants").where("active", "==", true).get(),
  ]);

  const itemsById = new Map(itemsSnap.docs.map((doc) => [doc.id, doc.data()]));
  const variantsById = new Map(variantsSnap.docs.map((doc) => [doc.id, doc.data()]));
  const catalogDocs: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const row of allowlistRows) {
    const item = itemsById.get(row.item_id);
    if (!item || item.active === false) continue;

    if (row.variant_id) {
      const variant = variantsById.get(row.variant_id);
      if (!variant || variant.active === false) continue;
      const variantImageUrl = readImageUrl(variant.image_url);
      const productImageUrl = readImageUrl(item.image_url);
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
        ...readOrderFields(item),
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
  if (!catalogDocs.length) return;

  const batchSize = 400;
  for (let index = 0; index < catalogDocs.length; index += batchSize) {
    const batch = db.batch();
    for (const entry of catalogDocs.slice(index, index + batchSize)) {
      batch.set(db.collection("outlet_order_catalog").doc(entry.id), entry.data, { merge: true });
    }
    await batch.commit();
  }
}

export async function refreshOutletOrderCatalogForItem(db: Firestore, itemId: string) {
  const allowlistSnap = await db
    .collection("outlet_catalog_allowlist")
    .where("item_id", "==", itemId)
    .where("allow_orders", "==", true)
    .get();
  if (allowlistSnap.empty) return;

  const outletIds = [
    ...new Set(
      allowlistSnap.docs
        .map((doc) => String(doc.get("outlet_id") ?? ""))
        .filter((outletId) => outletId.length > 0),
    ),
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
