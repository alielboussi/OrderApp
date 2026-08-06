import { getAuth } from "firebase-admin/auth";
import { getFirestoreDb } from "@/lib/firebase-server";
import {
  listFirestoreCatalogItems,
  listFirestoreCatalogVariants,
} from "@/lib/firestore-catalog-store";
import { isOrdersAppOutlet } from "@/lib/firestore-outlets";
import type { AllowlistEntry, OutletAuthAssignment } from "@/lib/outlet-catalog-access";
import { normalizeCatalogAccessItems } from "@/lib/outlet-catalog-access";
import { resolveCatalogImageUrl } from "@/lib/catalog-image-url";

function readCatalogImageUrl(...values: unknown[]): string | null {
  for (const value of values) {
    const resolved = resolveCatalogImageUrl(typeof value === "string" ? value : null);
    if (resolved) return resolved;
  }
  return null;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function deleteOutletOrderCatalog(outletId: string) {
  const db = getFirestoreDb();
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
  outletId: string,
  allowlistRows: Array<{ item_id: string; variant_id: string | null }>,
) {
  const db = getFirestoreDb();
  const now = new Date().toISOString();
  const [items, variants] = await Promise.all([
    listFirestoreCatalogItems(),
    listFirestoreCatalogVariants({ activeOnly: true }),
  ]);

  const itemsById = new Map(items.map((item) => [String(item.id ?? ""), item]));
  const variantsById = new Map(variants.map((variant) => [String(variant.id ?? ""), variant]));

  const catalogDocs: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const row of allowlistRows) {
    const item = itemsById.get(row.item_id);
    if (!item || item.active === false) continue;

    const consumptionUom = asText(item.consumption_uom ?? item.consumption_unit, "each");
    const purchasePackUnit = asText(item.purchase_pack_unit, consumptionUom);
    const unitsPerPurchasePack = toNumber(item.units_per_purchase_pack, 1);
    const itemKind = asText(item.item_kind, "finished");
    const ordersAppUom = asText(item.orders_app_uom) || consumptionUom;
    const ordersAppCostPrice = toNumber(item.orders_app_cost_price ?? item.selling_price ?? item.cost, 0);

    if (row.variant_id) {
      const variant = variantsById.get(row.variant_id);
      if (!variant || variant.active === false) continue;
      const variantOrdersAppUom =
        asText(variant.orders_app_uom) ||
        ordersAppUom;
      const variantOrdersAppCostPrice = toNumber(
        variant.orders_app_cost_price ??
          variant.selling_price ??
          item.orders_app_cost_price ??
          item.selling_price ??
          variant.cost ??
          item.cost,
        0,
      );
      const docId = `${outletId}_${row.item_id}_${row.variant_id}`;
      const variantImageUrl = readCatalogImageUrl(variant.image_url, item.image_url);
      catalogDocs.push({
        id: docId,
        data: {
          outletId,
          productId: row.item_id,
          variantId: row.variant_id,
          productName: asText(item.name, "Item"),
          product_name: asText(item.name, "Item"),
          variantKey: asText(variant.sku, row.variant_id),
          itemKind,
          name: asText(variant.name, asText(item.name, "Item")),
          sku: asText(variant.sku) || asText(item.sku) || null,
          cost: toNumber(variant.cost ?? item.cost, 0),
          sellingPrice: variantOrdersAppCostPrice,
          ordersAppUom: variantOrdersAppUom,
          ordersAppCostPrice: variantOrdersAppCostPrice,
          imageUrl: variantImageUrl,
          image_url: variantImageUrl,
          purchasePackUnit,
          consumptionUom: variantOrdersAppUom,
          unitsPerPurchasePack,
          hasVariations: true,
          active: true,
          updatedAt: now,
        },
      });
      continue;
    }

    const docId = `${outletId}_${row.item_id}`;
    const productImageUrl = readCatalogImageUrl(item.image_url);
    catalogDocs.push({
      id: docId,
      data: {
        outletId,
        productId: row.item_id,
        variantId: null,
        productName: asText(item.name, "Item"),
        product_name: asText(item.name, "Item"),
        variantKey: null,
        itemKind,
        name: asText(item.name, "Item"),
        sku: asText(item.sku) || null,
        cost: toNumber(item.cost, 0),
        sellingPrice: ordersAppCostPrice,
        ordersAppUom,
        ordersAppCostPrice,
        imageUrl: productImageUrl,
        image_url: productImageUrl,
        purchasePackUnit,
        consumptionUom: ordersAppUom,
        unitsPerPurchasePack,
        hasVariations: item.has_variations === true,
        active: true,
        updatedAt: now,
      },
    });
  }

  await deleteOutletOrderCatalog(outletId);

  if (catalogDocs.length === 0) return;

  const batchSize = 400;
  for (let index = 0; index < catalogDocs.length; index += batchSize) {
    const batch = db.batch();
    for (const entry of catalogDocs.slice(index, index + batchSize)) {
      batch.set(db.collection("outlet_order_catalog").doc(entry.id), entry.data, { merge: true });
    }
    await batch.commit();
  }
}

export async function refreshOutletOrderCatalogForItem(itemId: string) {
  const db = getFirestoreDb();
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
    await materializeOutletOrderCatalog(outletId, rows);
  }
}

export async function refreshAllOutletOrderCatalogsFromAllowlist() {
  const db = getFirestoreDb();
  const allowlistSnap = await db.collection("outlet_catalog_allowlist").where("allow_orders", "==", true).get();
  const rowsByOutlet = new Map<string, Array<{ item_id: string; variant_id: string | null }>>();

  for (const doc of allowlistSnap.docs) {
    const outletId = String(doc.get("outlet_id") ?? "");
    if (!outletId) continue;
    const rows = rowsByOutlet.get(outletId) ?? [];
    rows.push({
      item_id: String(doc.get("item_id") ?? ""),
      variant_id: doc.get("variant_id") ? String(doc.get("variant_id")) : null,
    });
    rowsByOutlet.set(outletId, rows);
  }

  for (const [outletId, rows] of rowsByOutlet.entries()) {
    await materializeOutletOrderCatalog(outletId, rows);
  }
}

async function syncAppUserForOutlet(input: {
  authUserId: string;
  outletId: string;
  outletName: string;
}) {
  const db = getFirestoreDb();
  const now = new Date().toISOString();
  const existing = await db.collection("app_users").doc(input.authUserId).get();
  const existingData = existing.data() ?? {};

  let email: string | null =
    typeof existingData.email === "string" && existingData.email.trim() ? existingData.email : null;
  try {
    const authUser = await getAuth().getUser(input.authUserId);
    email = authUser.email ?? email;
  } catch {
    // UID may not exist in Firebase Auth yet — portal still stores assignment for when user is created.
  }

  const roles = Array.isArray(existingData.roles) && existingData.roles.length > 0
    ? existingData.roles
    : ["branch"];

  await db.collection("app_users").doc(input.authUserId).set(
    {
      email,
      outletId: input.outletId,
      outletName: input.outletName,
      roles,
      active: true,
      createdAt: typeof existingData.createdAt === "string" ? existingData.createdAt : now,
      updatedAt: now,
      assignedVia: "outlet_catalog_access",
    },
    { merge: true },
  );
}

async function resolveLinkedOrdersAppUser(
  outletId: string,
  outletData: FirebaseFirestore.DocumentData,
) {
  const db = getFirestoreDb();
  const authSnap = await db
    .collection("outlet_auth_assignments")
    .where("outlet_id", "==", outletId)
    .where("active", "==", true)
    .limit(1)
    .get();

  let uid =
    authSnap.docs[0]?.get("auth_user_id") ??
    (typeof outletData.authUserId === "string" ? outletData.authUserId : null) ??
    (typeof outletData.auth_user_id === "string" ? outletData.auth_user_id : null);

  if (!uid) return null;

  const appUserSnap = await db.collection("app_users").doc(String(uid)).get();
  let email =
    typeof appUserSnap.data()?.email === "string" && appUserSnap.data()?.email.trim()
      ? appUserSnap.data()?.email.trim()
      : null;

  try {
    const authUser = await getAuth().getUser(String(uid));
    email = authUser.email ?? email;
  } catch {
    // keep email from app_users if Auth lookup fails
  }

  return { uid: String(uid), email };
}

export async function listFirestoreOutletsForCatalogAccess() {
  const snapshot = await getFirestoreDb().collection("outlets").get();
  return snapshot.docs
    .filter((doc) => isOrdersAppOutlet(doc.data()))
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: String(data.name ?? "Outlet"),
        auth_user_id: typeof data.authUserId === "string" ? data.authUserId : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchFirestoreOutletCatalogAccess(outletId: string) {
  const db = getFirestoreDb();
  const [outletSnap, allowlistSnap, authSnap, items, variants] = await Promise.all([
    db.collection("outlets").doc(outletId).get(),
    db.collection("outlet_catalog_allowlist").where("outlet_id", "==", outletId).get(),
    db.collection("outlet_auth_assignments").where("outlet_id", "==", outletId).where("active", "==", true).get(),
    listFirestoreCatalogItems(),
    listFirestoreCatalogVariants({ activeOnly: true }),
  ]);

  if (!outletSnap.exists) throw new Error("Outlet not found");
  const outletData = outletSnap.data() ?? {};
  const linkedOrdersAppUser = await resolveLinkedOrdersAppUser(outletId, outletData);

  const variantsByItem = new Map<string, Array<Record<string, unknown>>>();
  for (const variant of variants) {
    const itemId = String(variant.item_id ?? "");
    if (!itemId) continue;
    const list = variantsByItem.get(itemId) ?? [];
    list.push(variant);
    variantsByItem.set(itemId, list);
  }

  const allowByKey = new Map<string, AllowlistEntry>();
  for (const doc of allowlistSnap.docs) {
    const row = doc.data();
    const key = `${row.item_id}:${row.variant_id ?? ""}`;
    allowByKey.set(key, {
      id: doc.id,
      item_id: String(row.item_id ?? ""),
      variant_id: row.variant_id ? String(row.variant_id) : null,
      allow_orders: row.allow_orders === true,
    });
  }

  const activeItems = items.filter((item) => item.active !== false);
  const catalog = normalizeCatalogAccessItems(
    activeItems.map((item) => {
      const itemId = String(item.id ?? "");
      const itemKey = `${itemId}:`;
      const itemAllow = allowByKey.get(itemKey);
      const itemVariants = variantsByItem.get(itemId) ?? [];
      const itemKind = asText(item.item_kind, "finished");

      return {
        id: itemId,
        name: String(item.name ?? ""),
        sku: typeof item.sku === "string" ? item.sku : null,
        item_kind: itemKind,
        has_variations: item.has_variations === true,
        active: item.active !== false,
        image_url: typeof item.image_url === "string" ? item.image_url : null,
        allow_orders: itemAllow?.allow_orders ?? false,
        variants: itemVariants.map((variant) => {
          const variantId = String(variant.id ?? "");
          const variantKey = `${itemId}:${variantId}`;
          const variantAllow = allowByKey.get(variantKey);
          return {
            id: variantId,
            item_id: itemId,
            name: String(variant.name ?? ""),
            sku: typeof variant.sku === "string" ? variant.sku : null,
            image_url: typeof variant.image_url === "string" ? variant.image_url : null,
            active: variant.active !== false,
            allow_orders: variantAllow?.allow_orders ?? false,
          };
        }),
      };
    }),
  );

  const auth_assignments: OutletAuthAssignment[] = authSnap.docs.map((doc) => {
    const row = doc.data();
    return {
      outlet_id: String(row.outlet_id ?? outletId),
      auth_user_id: String(row.auth_user_id ?? ""),
      assignment_role:
        row.assignment_role === "orders" || row.assignment_role === "stocktake" || row.assignment_role === "both"
          ? row.assignment_role
          : "orders",
      active: row.active !== false,
    };
  });

  return {
    outlet: {
      id: outletId,
      name: String(outletData.name ?? "Outlet"),
      auth_user_id: linkedOrdersAppUser?.uid ?? null,
    },
    linked_orders_app_user: linkedOrdersAppUser,
    catalog,
    auth_assignments,
    legacy_auth_user_id: linkedOrdersAppUser?.uid ?? null,
  };
}

export async function saveFirestoreOutletCatalogAccess(input: {
  outlet_id: string;
  auth_user_id?: string | null;
  assignment_role?: "orders" | "stocktake" | "both";
  entries: Array<{
    item_id: string;
    variant_id?: string | null;
    allow_orders: boolean;
  }>;
}) {
  const db = getFirestoreDb();
  const outletId = input.outlet_id;
  const now = new Date().toISOString();

  const rows = input.entries
    .filter((entry) => entry.allow_orders)
    .map((entry) => ({
      outlet_id: outletId,
      item_id: entry.item_id,
      variant_id: entry.variant_id ?? null,
      allow_orders: true,
      updated_at: now,
    }));

  const existing = await db.collection("outlet_catalog_allowlist").where("outlet_id", "==", outletId).get();
  if (!existing.empty) {
    const batch = db.batch();
    existing.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  if (rows.length > 0) {
    const batch = db.batch();
    for (const row of rows) {
      const docId = `${outletId}_${row.item_id}_${row.variant_id ?? "base"}`;
      batch.set(db.collection("outlet_catalog_allowlist").doc(docId), row, { merge: true });
    }
    await batch.commit();
  }

  const outletSnap = await db.collection("outlets").doc(outletId).get();
  const outletName = String(outletSnap.data()?.name ?? "Outlet");
  const linkedUser = await resolveLinkedOrdersAppUser(outletId, outletSnap.data() ?? {});
  const authUserId = input.auth_user_id ?? linkedUser?.uid ?? null;

  if (authUserId) {
    const assignmentId = `${outletId}_${authUserId}`;
    await db.collection("outlet_auth_assignments").doc(assignmentId).set(
      {
        outlet_id: outletId,
        auth_user_id: authUserId,
        assignment_role: input.assignment_role ?? "orders",
        active: true,
        updated_at: now,
      },
      { merge: true },
    );

    await db.collection("outlets").doc(outletId).set(
      {
        authUserId,
        auth_user_id: authUserId,
        updatedAt: now,
      },
      { merge: true },
    );

    await syncAppUserForOutlet({
      authUserId,
      outletId,
      outletName,
    });
  }

  await materializeOutletOrderCatalog(
    outletId,
    rows.map((row) => ({ item_id: row.item_id, variant_id: row.variant_id })),
  );

  return fetchFirestoreOutletCatalogAccess(outletId);
}
