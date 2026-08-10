import type { Firestore } from "firebase-admin/firestore";
import { getCompanionProductIdsForAllowlistedSources } from "./order-companion-products";
import { readOrdersAppDisplayOrderFromRow } from "./orders-app-display-order";

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

function resolveOrdersAppDisplayName(source: Record<string, unknown>, fallback: string): string {
  const special = asText(source.orders_app_name) || asText(source.ordersAppName);
  if (special) return special;
  return fallback;
}

function readSupervisorUomQtyPerUnit(source: Record<string, unknown>): number {
  const ordersQty = toNumber(source.orders_uom_conversion_qty ?? source.ordersUomConversionQty, 0);
  const supervisorQty = toNumber(source.supervisor_uom_conversion_qty ?? source.supervisorUomConversionQty, 0);
  if (ordersQty > 0 && supervisorQty > 0) {
    return Math.max(1, Math.round(ordersQty / supervisorQty));
  }
  const perUnit = toNumber(source.supervisor_uom_qty_per_unit ?? source.supervisorUomQtyPerUnit, 1);
  return perUnit > 0 ? perUnit : 1;
}

function readOrderFields(source: Record<string, unknown>) {
  const ordersAppUom = asText(source.orders_app_uom, "pc");
  const consumptionUom = asText(source.consumption_uom ?? source.consumption_unit, ordersAppUom);
  const supervisorUom = asText(source.supervisor_uom, ordersAppUom);
  const supervisorUomQtyPerUnit = readSupervisorUomQtyPerUnit(source);
  const unitsPerPurchasePack = toNumber(source.units_per_purchase_pack, 1) || 1;
  const ordersAppCostPrice = toNumber(source.orders_app_cost_price, 0);
  const uomWeightEnabled = source.uom_weight_enabled === true;
  const uomWeightGrams = uomWeightEnabled ? toNumber(source.uom_weight_grams, 0) || null : null;
  const ordersAppDisplayOrder = readOrdersAppDisplayOrderFromRow(source);
  return {
    ordersAppUom,
    orders_app_uom: ordersAppUom,
    consumptionUom,
    consumption_uom: consumptionUom,
    supervisorUom,
    supervisor_uom: supervisorUom,
    supervisorUomQtyPerUnit,
    supervisor_uom_qty_per_unit: supervisorUomQtyPerUnit,
    unitsPerPurchasePack,
    units_per_purchase_pack: unitsPerPurchasePack,
    ordersAppCostPrice,
    orders_app_cost_price: ordersAppCostPrice,
    sellingPrice: ordersAppCostPrice,
    uomWeightEnabled,
    uom_weight_enabled: uomWeightEnabled,
    uomWeightGrams: uomWeightGrams,
    uom_weight_grams: uomWeightGrams,
    ordersAppDisplayOrder,
    orders_app_display_order: ordersAppDisplayOrder,
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
      const catalogName = asText(item.name, "Item");
      const variantName = asText(variant.name, catalogName);
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
          variantKey: asText(variant.sku, row.variant_id),
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

    const productImageUrl = readImageUrl(item.image_url);
    const catalogName = asText(item.name, "Item");
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
        name: ordersAppName,
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

  const allowlistedProductIds = [
    ...new Set(
      allowlistRows
        .filter((row) => !row.variant_id)
        .map((row) => row.item_id)
        .filter((itemId) => itemId.length > 0),
    ),
  ];
  const existingProductIds = new Set(
    catalogDocs.map((entry) => String(entry.data.productId ?? "").trim()).filter(Boolean),
  );

  for (const companionId of getCompanionProductIdsForAllowlistedSources(allowlistedProductIds)) {
    if (existingProductIds.has(companionId)) continue;
    const item = itemsById.get(companionId);
    if (!item || item.active === false) continue;
    const productImageUrl = readImageUrl(item.image_url);
    const name = asText(item.name, "Companion item");
    catalogDocs.push({
      id: `${outletId}_${companionId}`,
      data: {
        outletId,
        productId: companionId,
        variantId: null,
        productName: name,
        product_name: name,
        variantKey: null,
        name,
        sku: asText(item.sku) || null,
        ...readOrderFields(item),
        hasVariations: item.has_variations === true,
        imageUrl: productImageUrl,
        image_url: productImageUrl,
        productImageUrl,
        product_image_url: productImageUrl,
        ordersBrowseVisible: false,
        orders_browse_visible: false,
        active: true,
        updatedAt: now,
      },
    });
    existingProductIds.add(companionId);
  }

  await deleteOutletOrderCatalog(db, outletId);
  if (!catalogDocs.length) return;

  const batchSize = 400;
  for (let index = 0; index < catalogDocs.length; index += batchSize) {
    const batch = db.batch();
    for (const entry of catalogDocs.slice(index, index + batchSize)) {
      batch.set(db.collection("outlet_order_catalog").doc(entry.id), entry.data);
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
