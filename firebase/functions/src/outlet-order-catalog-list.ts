import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "./schema";
import { resolveOrdersAppUom, resolveSupervisorUom } from "./orders-app-uom";
import { compareOrdersAppCatalogProducts, readOrdersAppDisplayOrderFromRow } from "./orders-app-display-order";

type AppUserDoc = {
  outletId: string;
  outletName: string;
  roles: string[];
  active: boolean;
};

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

function resolveOrdersAppDisplayName(
  source: Record<string, unknown> | undefined,
  fallback: string,
): string {
  if (!source) return fallback;
  const special = asText(source.orders_app_name) || asText(source.ordersAppName);
  return special || fallback;
}

async function requireAppUser(uid: string): Promise<AppUserDoc> {
  const snap = await getFirestore().collection(COLLECTIONS.appUsers).doc(uid).get();
  if (!snap.exists || snap.data()?.active !== true) {
    throw new HttpsError("permission-denied", "Active app user required.");
  }
  return snap.data() as AppUserDoc;
}

function canAccessOutlet(profile: AppUserDoc, outletId: string): boolean {
  if (profile.outletId === outletId) return true;
  return profile.roles?.some((role) => role === "supervisor" || role === "warehouse_admin") ?? false;
}

function enrichOutletCatalogRow(
  docId: string,
  data: Record<string, unknown>,
  item: Record<string, unknown> | undefined,
  variant: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const catalogName = asText(item?.name, asText(data.productName, asText(data.name, "Item")));
  const variantName = variant ? asText(variant.name, catalogName) : catalogName;
  const merged = { ...(item ?? {}), ...(variant ?? {}) };
  const itemOrdersAppName = asText(item?.orders_app_name) || asText(item?.ordersAppName) || null;
  const displayName = variant
    ? resolveOrdersAppDisplayName(merged, variantName)
    : resolveOrdersAppDisplayName(item ?? {}, catalogName);
  const ordersAppUom = resolveOrdersAppUom(merged, resolveOrdersAppUom(data));
  const supervisorUom = resolveSupervisorUom(merged, resolveSupervisorUom(data));
  const ordersQty = toNumber(
    merged.orders_uom_conversion_qty ?? data.orders_uom_conversion_qty ?? merged.ordersUomConversionQty,
    0,
  );
  const supervisorQty = toNumber(
    merged.supervisor_uom_conversion_qty ?? data.supervisor_uom_conversion_qty ?? merged.supervisorUomConversionQty,
    0,
  );
  const supervisorUomQtyPerUnit =
    ordersQty > 0 && supervisorQty > 0
      ? Math.max(1, Math.round(ordersQty / supervisorQty))
      : toNumber(
          merged.supervisor_uom_qty_per_unit ?? data.supervisor_uom_qty_per_unit ?? merged.supervisorUomQtyPerUnit,
          1,
        ) || 1;
  const ordersAppDisplayOrder = readOrdersAppDisplayOrderFromRow(item ?? data);

  return {
    ...data,
    id: docId,
    productName: catalogName,
    product_name: catalogName,
    ordersAppName: itemOrdersAppName || asText(data.ordersAppName) || asText(data.orders_app_name) || null,
    orders_app_name: itemOrdersAppName || asText(data.orders_app_name) || asText(data.ordersAppName) || null,
    name: displayName,
    ordersAppUom,
    orders_app_uom: ordersAppUom,
    supervisorUom,
    supervisor_uom: supervisorUom,
    ordersAppCostPrice: toNumber(
      merged.orders_app_cost_price ?? data.ordersAppCostPrice ?? data.orders_app_cost_price,
      0,
    ),
    supervisorUomQtyPerUnit: supervisorUomQtyPerUnit,
    supervisor_uom_qty_per_unit: supervisorUomQtyPerUnit,
    ordersUomConversionQty: ordersQty > 0 ? ordersQty : supervisorUomQtyPerUnit,
    orders_uom_conversion_qty: ordersQty > 0 ? ordersQty : supervisorUomQtyPerUnit,
    supervisorUomConversionQty: supervisorQty > 0 ? supervisorQty : 1,
    supervisor_uom_conversion_qty: supervisorQty > 0 ? supervisorQty : 1,
    unitsPerPurchasePack: toNumber(
      merged.units_per_purchase_pack ?? data.unitsPerPurchasePack ?? data.units_per_purchase_pack,
      1,
    ) || 1,
    ordersAppDisplayOrder,
    orders_app_display_order: ordersAppDisplayOrder,
  };
}

export const listOutletOrderCatalog = onCall({ region: "africa-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const profile = await requireAppUser(request.auth.uid);
  const outletId = String(request.data?.outletId ?? profile.outletId ?? "").trim();
  if (!outletId) {
    throw new HttpsError("invalid-argument", "outletId is required.");
  }
  if (!canAccessOutlet(profile, outletId)) {
    throw new HttpsError("permission-denied", "Cannot load catalog for this outlet.");
  }

  const db = getFirestore();
  const catalogSnap = await db
    .collection(COLLECTIONS.outletOrderCatalog)
    .where("outletId", "==", outletId)
    .where("active", "==", true)
    .get();

  const productIds = [
    ...new Set(
      catalogSnap.docs
        .map((doc) => String(doc.data().productId ?? "").trim())
        .filter((productId) => productId.length > 0),
    ),
  ];

  const itemSnaps =
    productIds.length > 0
      ? await db.getAll(...productIds.map((productId) => db.collection(COLLECTIONS.catalogItems).doc(productId)))
      : [];
  const itemsById = new Map(
    itemSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data() as Record<string, unknown>]),
  );

  const variantIds = [
    ...new Set(
      catalogSnap.docs
        .map((doc) => String(doc.data().variantId ?? "").trim())
        .filter((variantId) => variantId.length > 0),
    ),
  ];
  const variantSnaps =
    variantIds.length > 0
      ? await db.getAll(
          ...variantIds.map((variantId) => db.collection(COLLECTIONS.catalogVariants).doc(variantId)),
        )
      : [];
  const variantsById = new Map(
    variantSnaps
      .filter((snap) => snap.exists)
      .map((snap) => [snap.id, snap.data() as Record<string, unknown>]),
  );

  const products = catalogSnap.docs.map((doc) => {
    const data = doc.data();
    const productId = String(data.productId ?? "").trim();
    const variantId = String(data.variantId ?? "").trim();
    return enrichOutletCatalogRow(
      doc.id,
      data as Record<string, unknown>,
      itemsById.get(productId),
      variantId ? variantsById.get(variantId) : undefined,
    );
  });

  products.sort((left, right) =>
    compareOrdersAppCatalogProducts(
      {
        productId: String(left.productId ?? ""),
        name: String(left.name ?? ""),
        ordersAppDisplayOrder: readOrdersAppDisplayOrderFromRow(left),
      },
      {
        productId: String(right.productId ?? ""),
        name: String(right.name ?? ""),
        ordersAppDisplayOrder: readOrdersAppDisplayOrderFromRow(right),
      },
    ),
  );

  return { products };
});
