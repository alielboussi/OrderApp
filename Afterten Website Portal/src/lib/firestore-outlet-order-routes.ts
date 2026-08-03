import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";

export type OutletOrderRouteRow = {
  outlet_id: string;
  item_id: string;
  warehouse_id: string | null;
  normalized_variant_key: string;
  variant_key?: string | null;
};

function routeDocId(itemId: string, variantKey: string, outletId: string) {
  return `${itemId}__${variantKey}__${outletId}`;
}

export async function listFirestoreOutletOrderRoutes(
  itemId: string,
  variantKey: string,
): Promise<OutletOrderRouteRow[]> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection("outlet_order_routes")
    .where("itemId", "==", itemId)
    .where("normalizedVariantKey", "==", variantKey)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      outlet_id: String(data.outletId ?? data.outlet_id ?? ""),
      item_id: String(data.itemId ?? data.item_id ?? itemId),
      warehouse_id:
        typeof data.warehouseId === "string"
          ? data.warehouseId
          : typeof data.warehouse_id === "string"
            ? data.warehouse_id
            : null,
      normalized_variant_key: String(data.normalizedVariantKey ?? data.normalized_variant_key ?? variantKey),
      variant_key: (data.variantKey ?? data.variant_key ?? variantKey) as string | null,
    };
  });
}

export async function saveFirestoreOutletOrderRoutes(
  itemId: string,
  variantKey: string,
  routes: Array<{ outlet_id: string; warehouse_id: string | null }>,
) {
  const db = getFirestoreDb();
  const batch = db.batch();
  const now = new Date().toISOString();

  for (const route of routes) {
    const docRef = db.collection("outlet_order_routes").doc(routeDocId(itemId, variantKey, route.outlet_id));
    if (!route.warehouse_id) {
      batch.delete(docRef);
      continue;
    }

    batch.set(
      docRef,
      {
        outletId: route.outlet_id,
        itemId,
        warehouseId: route.warehouse_id,
        normalizedVariantKey: variantKey,
        variantKey,
        updatedAt: now,
      },
      { merge: true },
    );
  }

  await batch.commit();
}
