import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { COLLECTIONS } from "./schema";
import {
  buildOutletCadenceViolationMessage,
  findOutletCadenceViolations,
  getMaxOutletCadenceWindowDays,
  type OutletCadenceOrderLine,
  type OutletCadenceOrderSnapshot,
} from "./order-outlet-cadence";

const COUNTED_ORDER_STATUSES = new Set([
  "order_placed",
  "placed",
  "accepted",
  "loaded",
  "completed",
]);

function mapOrderItems(
  docs: Array<{ data: () => FirebaseFirestore.DocumentData }>,
): OutletCadenceOrderLine[] {
  return docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      productId: (data.productId as string | null | undefined) ?? null,
      qty: Number(data.qty ?? 0),
    };
  });
}

export async function loadOutletCadenceOrderHistory(
  db: Firestore,
  outletId: string,
): Promise<OutletCadenceOrderSnapshot[]> {
  const windowDays = getMaxOutletCadenceWindowDays();
  if (windowDays <= 0) return [];

  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const ordersSnap = await db
    .collection(COLLECTIONS.transferOrders)
    .where("outletId", "==", outletId)
    .where("createdAt", ">=", cutoff)
    .orderBy("createdAt", "desc")
    .get();

  const snapshots = await Promise.all(
    ordersSnap.docs.map(async (orderDoc) => {
      const data = orderDoc.data();
      const status = String(data.status ?? "").trim().toLowerCase();
      if (!COUNTED_ORDER_STATUSES.has(status)) return null;

      const itemsSnap = await orderDoc.ref.collection("items").get();
      return {
        id: orderDoc.id,
        createdAt: String(data.createdAt ?? ""),
        items: mapOrderItems(itemsSnap.docs),
      } satisfies OutletCadenceOrderSnapshot;
    }),
  );

  return snapshots.filter((row): row is OutletCadenceOrderSnapshot => row != null);
}

export async function assertOutletCadenceAllowsItems(
  db: Firestore,
  outletId: string,
  items: Array<{ productId?: string | null; qty: number; name?: string }>,
  options?: { excludeOrderId?: string },
): Promise<void> {
  const cadenceItems: OutletCadenceOrderLine[] = items.map((item) => ({
    productId: item.productId ?? null,
    qty: Number(item.qty ?? 0),
    name: item.name,
  }));

  const orders = await loadOutletCadenceOrderHistory(db, outletId);
  const violations = findOutletCadenceViolations(orders, cadenceItems, {
    excludeOrderId: options?.excludeOrderId,
  });

  if (violations.length === 0) return;

  const message = buildOutletCadenceViolationMessage(violations);
  throw new HttpsError("failed-precondition", message || "Outlet order limit reached.");
}
