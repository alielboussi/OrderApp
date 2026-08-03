import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";
import { isTransferOrderOnDate, resolveTransferOrderCreatedAt } from "@/lib/transfer-order-dates";

export type TransferOrderRow = {
  id: string;
  order_number: string | null;
  created_at: string | null;
  status: string | null;
  outlet_id: string | null;
  outlets?: { name?: string | null } | null;
  employee_signed_name?: string | null;
  employee_signature_path?: string | null;
  employee_signature_data?: string | null;
  employee_signed_at?: string | null;
  supervisor_signed_name?: string | null;
  supervisor_signature_path?: string | null;
  supervisor_signed_at?: string | null;
  driver_signed_name?: string | null;
  driver_signature_path?: string | null;
  driver_signature_data?: string | null;
  driver_signed_at?: string | null;
  offloader_signed_name?: string | null;
  offloader_signature_path?: string | null;
  offloader_signature_data?: string | null;
  offloader_signed_at?: string | null;
  created_by?: string | null;
};

function toIso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function mapOrder(id: string, data: FirebaseFirestore.DocumentData): TransferOrderRow {
  return {
    id,
    order_number:
      typeof data.orderNumber === "string"
        ? data.orderNumber
        : typeof data.order_number === "string"
          ? data.order_number
          : null,
    created_at: resolveTransferOrderCreatedAt(data),
    status: typeof data.status === "string" ? data.status : null,
    outlet_id: typeof data.outletId === "string" ? data.outletId : typeof data.outlet_id === "string" ? data.outlet_id : null,
    employee_signed_name:
      data.employee_signed_name ?? data.employeeSignedName ?? data.employeeName ?? null,
    employee_signature_path: data.employee_signature_path ?? data.employeeSignaturePath ?? null,
    employee_signature_data: data.employee_signature_data ?? data.employeeSignatureData ?? null,
    employee_signed_at: toIso(data.employee_signed_at ?? data.employeeSignedAt),
    supervisor_signed_name:
      data.supervisor_signed_name ?? data.supervisorSignedName ?? data.supervisorName ?? null,
    supervisor_signature_path: data.supervisor_signature_path ?? data.supervisorSignaturePath ?? null,
    supervisor_signed_at: toIso(data.supervisor_signed_at ?? data.supervisorSignedAt ?? data.acceptedAt),
    driver_signed_name: data.driver_signed_name ?? data.driverSignedName ?? data.driverName ?? null,
    driver_signature_path: data.driver_signature_path ?? data.driverSignaturePath ?? null,
    driver_signature_data: data.driver_signature_data ?? data.driverSignatureData ?? null,
    driver_signed_at: toIso(data.driver_signed_at ?? data.driverSignedAt),
    offloader_signed_name: data.offloader_signed_name ?? data.offloaderSignedName ?? null,
    offloader_signature_path: data.offloader_signature_path ?? data.offloaderSignaturePath ?? null,
    offloader_signature_data: data.offloader_signature_data ?? data.offloaderSignatureData ?? null,
    offloader_signed_at: toIso(data.offloader_signed_at ?? data.offloaderSignedAt),
    created_by: typeof data.created_by === "string" ? data.created_by : null,
  };
}

export async function listFirestoreTransferOrders(options: {
  date: string;
  outletId?: string | null;
}): Promise<{ orders: TransferOrderRow[]; totals: Record<string, { qty: number; amount: number }> }> {
  const db = getFirestoreDb();
  const snapshot = await db.collection("transfer_orders").get();
  const outletIds = new Set<string>();
  const orders = snapshot.docs
    .map((doc) => ({ row: mapOrder(doc.id, doc.data()), data: doc.data() }))
    .filter(({ row, data }) => {
      const sourceEventId = data.source_event_id ?? data.sourceEventId;
      if (sourceEventId != null && sourceEventId !== "") return false;
      if (!isTransferOrderOnDate(row.created_at, options.date)) return false;
      if (options.outletId && options.outletId !== "all" && row.outlet_id !== options.outletId) return false;
      if (row.outlet_id) outletIds.add(row.outlet_id);
      return true;
    })
    .map(({ row }) => row)
    .sort((left, right) => {
      const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
      return rightTime - leftTime;
    });

  const outletNameMap = new Map<string, string>();
  if (outletIds.size > 0) {
    const outletsSnap = await db.collection("outlets").get();
    for (const doc of outletsSnap.docs) {
      if (!outletIds.has(doc.id)) continue;
      const name = doc.data().name;
      outletNameMap.set(doc.id, typeof name === "string" && name.trim() ? name.trim() : doc.id);
    }
  }

  const ordersWithOutlets = orders.map((row) => ({
    ...row,
    outlets: row.outlet_id ? { name: outletNameMap.get(row.outlet_id) ?? row.outlet_id } : null,
  }));

  const orderIds = ordersWithOutlets.map((row) => row.id);
  const totals: Record<string, { qty: number; amount: number }> = {};

  await Promise.all(
    orderIds.map(async (orderId) => {
      const items = await loadOrderItems(orderId);
      if (items.length === 0) return;
      totals[orderId] = sumOrderItems(items);
    }),
  );

  return { orders: ordersWithOutlets, totals };
}

export async function listFirestoreTransferOrderItems(orderId: string) {
  return loadOrderItems(orderId);
}

export type FirestoreTransferOrderItem = {
  id: string;
  order_id: string | null;
  product_id: string | null;
  variant_key: string | null;
  name: string | null;
  receiving_uom: string | null;
  consumption_uom: string | null;
  qty: number | null;
  cost: number | null;
  amount: number | null;
  package_contains: number | null;
};

export type FirestoreOutletCatalogProduct = {
  id: string;
  product_id: string;
  product_name: string;
  variant_id: string | null;
  variant_key: string | null;
  name: string;
  selling_price: number;
  orders_app_uom: string;
  consumption_uom: string;
  units_per_purchase_pack: number;
};

export type UpdateTransferOrderItemInput = {
  id: string;
  product_id?: string | null;
  variant_key?: string | null;
  name: string;
  receiving_uom: string;
  consumption_uom: string;
  cost: number;
  qty: number;
  package_contains?: number | null;
};

function mapOrderItem(
  id: string,
  data: FirebaseFirestore.DocumentData,
  orderId?: string,
): FirestoreTransferOrderItem {
  const qty = typeof data.qty === "number" ? data.qty : null;
  const cost = typeof data.cost === "number" ? data.cost : null;
  const amount =
    typeof data.amount === "number" ? data.amount : qty != null && cost != null ? qty * cost : null;

  return {
    id,
    order_id:
      typeof data.orderId === "string"
        ? data.orderId
        : typeof data.order_id === "string"
          ? data.order_id
          : orderId ?? null,
    product_id:
      typeof data.productId === "string"
        ? data.productId
        : typeof data.product_id === "string"
          ? data.product_id
          : null,
    variant_key:
      typeof data.variantKey === "string"
        ? data.variantKey
        : typeof data.variant_key === "string"
          ? data.variant_key
          : null,
    name: typeof data.name === "string" ? data.name : null,
    receiving_uom:
      typeof data.receivingUom === "string"
        ? data.receivingUom
        : typeof data.receiving_uom === "string"
          ? data.receiving_uom
          : null,
    consumption_uom:
      typeof data.consumptionUom === "string"
        ? data.consumptionUom
        : typeof data.consumption_uom === "string"
          ? data.consumption_uom
          : null,
    qty,
    cost,
    amount,
    package_contains:
      typeof data.packageContains === "number"
        ? data.packageContains
        : typeof data.package_contains === "number"
          ? data.package_contains
          : null,
  };
}

async function loadOrderItemsFromSubcollection(orderId: string) {
  const db = getFirestoreDb();
  const snapshot = await db.collection("transfer_orders").doc(orderId).collection("items").get();
  return snapshot.docs
    .map((doc) => ({
      sortOrder: Number(doc.data().sortOrder ?? 0),
      item: mapOrderItem(doc.id, doc.data(), orderId),
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((row) => row.item);
}

async function loadOrderItemsFromFlatCollection(orderId: string) {
  const db = getFirestoreDb();
  const snapshot = await db.collection("transfer_order_items").where("orderId", "==", orderId).get();
  if (snapshot.empty) {
    const fallback = await db.collection("transfer_order_items").where("order_id", "==", orderId).get();
    return fallback.docs.map((doc) => mapOrderItem(doc.id, doc.data(), orderId));
  }
  return snapshot.docs.map((doc) => mapOrderItem(doc.id, doc.data(), orderId));
}

async function loadOrderItems(orderId: string) {
  const subcollectionItems = await loadOrderItemsFromSubcollection(orderId);
  if (subcollectionItems.length > 0) {
    return subcollectionItems;
  }
  return loadOrderItemsFromFlatCollection(orderId);
}

function sumOrderItems(items: FirestoreTransferOrderItem[]) {
  return items.reduce(
    (acc, item) => {
      const qty = Number(item.qty ?? 0);
      const amount = Number(item.amount ?? (item.cost ?? 0) * qty);
      acc.qty += Number.isFinite(qty) ? qty : 0;
      acc.amount += Number.isFinite(amount) ? amount : 0;
      return acc;
    },
    { qty: 0, amount: 0 },
  );
}

function resolveOrdersAppUom(data: FirebaseFirestore.DocumentData): string {
  const direct =
    (typeof data.ordersAppUom === "string" && data.ordersAppUom.trim()) ||
    (typeof data.orders_app_uom === "string" && data.orders_app_uom.trim()) ||
    "";
  if (direct) return direct;
  const purchasePackUnit =
    (typeof data.purchasePackUnit === "string" && data.purchasePackUnit.trim()) ||
    (typeof data.purchase_pack_unit === "string" && data.purchase_pack_unit.trim()) ||
    "each";
  return purchasePackUnit;
}

function resolveSellingPrice(data: FirebaseFirestore.DocumentData): number {
  const ordersAppCost = Number(data.ordersAppCostPrice ?? data.orders_app_cost_price);
  if (Number.isFinite(ordersAppCost) && ordersAppCost > 0) return ordersAppCost;
  const sellingPrice = Number(data.sellingPrice ?? data.selling_price ?? data.cost ?? 0);
  return Number.isFinite(sellingPrice) ? sellingPrice : 0;
}

export async function listFirestoreOutletOrderCatalog(
  outletId: string,
): Promise<FirestoreOutletCatalogProduct[]> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection("outlet_order_catalog")
    .where("outletId", "==", outletId)
    .where("active", "==", true)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const name = typeof data.name === "string" ? data.name.trim() : "";
      const productName =
        (typeof data.productName === "string" && data.productName.trim()) ||
        (typeof data.product_name === "string" && data.product_name.trim()) ||
        name;
      return {
        id: doc.id,
        product_id: String(data.productId ?? data.product_id ?? doc.id),
        product_name: productName,
        variant_id: (data.variantId as string | null | undefined) ?? (data.variant_id as string | null | undefined) ?? null,
        variant_key: (data.variantKey as string | null | undefined) ?? (data.variant_key as string | null | undefined) ?? null,
        name,
        selling_price: resolveSellingPrice(data),
        orders_app_uom: resolveOrdersAppUom(data),
        consumption_uom: String(data.consumptionUom ?? data.consumption_uom ?? "each"),
        units_per_purchase_pack: Number(data.unitsPerPurchasePack ?? data.units_per_purchase_pack ?? 1),
      } satisfies FirestoreOutletCatalogProduct;
    })
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export async function updateFirestoreTransferOrderItems(
  orderId: string,
  items: UpdateTransferOrderItemInput[],
  supervisorEditedName: string,
): Promise<FirestoreTransferOrderItem[]> {
  const db = getFirestoreDb();
  const orderRef = db.collection("transfer_orders").doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error("Order not found");
  }

  const order = orderSnap.data() as { status?: string };
  const status = String(order.status ?? "").trim().toLowerCase();
  if (status !== "order_placed" && status !== "placed" && status !== "accepted") {
    throw new Error("Only placed or accepted orders can be edited");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one order line is required");
  }

  const existingSnap = await orderRef.collection("items").get();
  const existingById = new Map(existingSnap.docs.map((doc) => [doc.id, doc.data()]));
  if (existingById.size !== items.length) {
    throw new Error("Order lines cannot be added or removed");
  }

  const now = new Date().toISOString();
  const batch = db.batch();
  let totalQty = 0;
  let totalAmount = 0;

  items.forEach((item, index) => {
    const itemId = String(item.id ?? "").trim();
    if (!itemId || !existingById.has(itemId)) {
      throw new Error("One or more order lines were not found");
    }

    const existing = existingById.get(itemId)!;
    const existingProductId = String(existing.productId ?? existing.product_id ?? "").trim() || null;
    const nextProductId = String(item.product_id ?? "").trim() || null;
    if (existingProductId !== nextProductId) {
      throw new Error("Product base item cannot be changed");
    }

    const existingVariantKey = String(existing.variantKey ?? existing.variant_key ?? "").trim() || null;
    const nextVariantKey = String(item.variant_key ?? "").trim() || null;
    if (existingVariantKey !== nextVariantKey && !nextProductId) {
      throw new Error("Variant replacement requires the same base product");
    }

    const qty = Math.floor(Number(item.qty ?? 0));
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error("Quantity must be at least 1");
    }

    const name = String(item.name ?? "").trim();
    if (!name) {
      throw new Error("Each order line requires a name");
    }

    const cost = Number(item.cost ?? 0);
    totalQty += qty;
    totalAmount += qty * cost;

    batch.set(
      orderRef.collection("items").doc(itemId),
      {
        productId: nextProductId,
        variantKey: item.variant_key ?? null,
        name,
        receivingUom: String(item.receiving_uom ?? "each"),
        consumptionUom: String(item.consumption_uom ?? "each"),
        cost,
        qty,
        packageContains: item.package_contains == null ? null : Number(item.package_contains),
        sortOrder: index,
        updatedAt: now,
      },
      { merge: true },
    );
  });

  batch.set(
    orderRef,
    {
      modifiedBySupervisor: true,
      supervisorEditedName,
      supervisorEditedAt: now,
      updatedAt: now,
      totalQty,
      totalAmount,
    },
    { merge: true },
  );

  await batch.commit();
  return loadOrderItems(orderId);
}

export async function getFirestoreTransferOrderTotals(options: {
  outletIds: string[];
  date: string;
}): Promise<{ count: number; qty: number; amount: number }> {
  const start = new Date(options.date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const outletSet = new Set(options.outletIds);

  const snapshot = await getFirestoreDb().collection("transfer_orders").get();
  const orderIds = new Set<string>();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const sourceEventId = data.source_event_id ?? data.sourceEventId;
    if (sourceEventId != null && sourceEventId !== "") continue;
    const outletId = typeof data.outletId === "string" ? data.outletId : data.outlet_id;
    if (!outletId || !outletSet.has(outletId)) continue;
    const createdAt = toIso(data.createdAt ?? data.created_at);
    if (!createdAt || createdAt < startIso || createdAt >= endIso) continue;
    orderIds.add(doc.id);
  }

  if (orderIds.size === 0) {
    return { count: 0, qty: 0, amount: 0 };
  }

  let qty = 0;
  let amount = 0;

  for (const orderId of orderIds) {
    const items = await loadOrderItems(orderId);
    const totals = sumOrderItems(items);
    qty += totals.qty;
    amount += totals.amount;
  }

  return { count: orderIds.size, qty, amount };
}

async function deleteQueryBatch(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
): Promise<void> {
  if (docs.length === 0) return;
  const db = getFirestoreDb();
  const batch = db.batch();
  docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

async function deleteCollection(ref: FirebaseFirestore.CollectionReference): Promise<void> {
  while (true) {
    const snapshot = await ref.limit(500).get();
    if (snapshot.empty) return;
    await deleteQueryBatch(snapshot.docs);
    if (snapshot.size < 500) return;
  }
}

export async function deleteFirestoreTransferOrder(orderId: string): Promise<void> {
  const db = getFirestoreDb();
  const orderRef = db.collection("transfer_orders").doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error("Order not found");
  }

  const data = orderSnap.data() ?? {};
  const signaturePaths = [
    data.employee_signature_path,
    data.supervisor_signature_path,
    data.driver_signature_path,
    data.offloader_signature_path,
  ].filter((path): path is string => typeof path === "string" && path.trim().length > 0);

  if (signaturePaths.length > 0) {
    const { getStorage } = await import("firebase-admin/storage");
    const bucket = getStorage().bucket();
    await Promise.all(
      signaturePaths.map(async (path) => {
        try {
          await bucket.file(path).delete({ ignoreNotFound: true });
        } catch {
          // Best-effort signature cleanup.
        }
      }),
    );
  }

  await deleteCollection(orderRef.collection("items"));

  const flatByOrderId = await db.collection("transfer_order_items").where("orderId", "==", orderId).get();
  if (!flatByOrderId.empty) {
    await deleteQueryBatch(flatByOrderId.docs);
  } else {
    const flatBySnake = await db.collection("transfer_order_items").where("order_id", "==", orderId).get();
    if (!flatBySnake.empty) {
      await deleteQueryBatch(flatBySnake.docs);
    }
  }

  await orderRef.delete();
}
