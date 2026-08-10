import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { formatAcceptedOrderWhatsAppMessage } from "./order-whatsapp";
import { formatOrdersAppUomLabel, resolveOrdersAppUom } from "./orders-app-uom";
import { getAppStorageBucket } from "./storage-bucket";
import { sendWasenderGroupMessage, wasenderApiKey, wasenderGroupId } from "./wasender";
import { assertOutletCadenceAllowsItems } from "./order-outlet-cadence-enforcement";
import { COLLECTIONS } from "./schema";

function orderNumberPrefix(outletName: string): string {
  const cleaned = outletName.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned || "OUTLET";
}

function formatOrderNumber(outletName: string, sequence: number): string {
  return `${orderNumberPrefix(outletName)}-${String(sequence).padStart(10, "0")}`;
}

function catalogLineKey(productId: string, variantKey: string): string {
  return `${productId}::${variantKey}`;
}

function buildOrdersAppUomLookup(
  docs: Array<{ data: () => FirebaseFirestore.DocumentData }>,
): Map<string, string> {
  const lookup = new Map<string, string>();
  const fallbackByProduct = new Map<string, string>();

  for (const docSnap of docs) {
    const data = docSnap.data();
    const productId = String(data.productId ?? "").trim();
    if (!productId) continue;

    const ordersAppUom = resolveOrdersAppUom(data);
    const variantKey = String(data.variantKey ?? "").trim();
    const variantId = String(data.variantId ?? "").trim();

    lookup.set(catalogLineKey(productId, variantKey), ordersAppUom);
    if (variantId) lookup.set(catalogLineKey(productId, variantId), ordersAppUom);
    if (!variantKey && !variantId) {
      fallbackByProduct.set(productId, ordersAppUom);
      continue;
    }

    if (!fallbackByProduct.has(productId)) {
      fallbackByProduct.set(productId, ordersAppUom);
    }
  }

  for (const [productId, uom] of fallbackByProduct.entries()) {
    if (!lookup.has(catalogLineKey(productId, ""))) {
      lookup.set(catalogLineKey(productId, ""), uom);
    }
  }

  return lookup;
}

function resolveOrdersAppUomForWhatsAppLine(
  item: {
    productId: string | null;
    variantKey: string | null;
    receivingUom: string;
    consumptionUom?: string;
    qty?: number;
  },
  lookup: Map<string, string>,
): string {
  const productId = String(item.productId ?? "").trim();
  const variantKey = String(item.variantKey ?? "").trim();
  const qty = Number(item.qty ?? 1);

  let code = "";
  if (productId) {
    code =
      lookup.get(catalogLineKey(productId, variantKey)) ??
      lookup.get(catalogLineKey(productId, "")) ??
      "";
  }

  if (!code) {
    code = "pc";
  }

  return formatOrdersAppUomLabel(code, qty);
}

type PlaceOrderItemInput = {
  productId?: string | null;
  variantKey?: string | null;
  name: string;
  receivingUom: string;
  consumptionUom: string;
  cost: number;
  qty: number;
  qtyCases?: number | null;
  packageContains?: number | null;
};

type AppUserDoc = {
  outletId: string;
  outletName: string;
  roles: string[];
  active: boolean;
  allOutlets?: boolean;
  email?: string;
  displayName?: string;
  supervisorName?: string;
};

function resolveSupervisorDisplayName(profile: AppUserDoc): string {
  const displayName = String(profile.displayName ?? profile.supervisorName ?? "").trim();
  if (displayName) return displayName;
  const email = String(profile.email ?? "").trim();
  if (email) return email;
  return profile.outletName?.trim() || "Supervisor";
}

async function requireAppUser(uid: string): Promise<AppUserDoc> {
  const snap = await getFirestore().collection(COLLECTIONS.appUsers).doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "No app profile found for this account.");
  }
  const data = snap.data() as AppUserDoc;
  if (!data.active) {
    throw new HttpsError("permission-denied", "Account is inactive or pending approval.");
  }
  return data;
}

type UpdateOrderItemInput = {
  id: string;
  productId?: string | null;
  variantKey?: string | null;
  name: string;
  receivingUom: string;
  consumptionUom: string;
  cost: number;
  qty: number;
  qtyCases?: number | null;
  packageContains?: number | null;
};

function sumOrderItemInputs(items: UpdateOrderItemInput[]): { totalQty: number; totalAmount: number } {
  return items.reduce(
    (acc, item) => {
      const qty = Math.floor(Number(item.qty ?? 0));
      const cost = Number(item.cost ?? 0);
      if (Number.isFinite(qty)) acc.totalQty += qty;
      if (Number.isFinite(qty) && Number.isFinite(cost)) acc.totalAmount += qty * cost;
      return acc;
    },
    { totalQty: 0, totalAmount: 0 },
  );
}

function appendSupervisorItemUpdatesToBatch(
  batch: FirebaseFirestore.WriteBatch,
  orderRef: FirebaseFirestore.DocumentReference,
  items: UpdateOrderItemInput[],
  existingById: Map<string, Record<string, unknown>>,
  supervisorEditedName: string,
  now: string,
): void {
  if (existingById.size !== items.length) {
    throw new HttpsError("invalid-argument", "Order lines cannot be added or removed.");
  }

  items.forEach((item, index) => {
    const itemId = String(item.id ?? "").trim();
    if (!itemId || !existingById.has(itemId)) {
      throw new HttpsError("invalid-argument", "One or more order lines were not found.");
    }

    const existing = existingById.get(itemId)!;
    const existingProductId = String(existing.productId ?? "").trim() || null;
    const nextProductId = String(item.productId ?? "").trim() || null;
    if (existingProductId !== nextProductId) {
      throw new HttpsError("invalid-argument", "Product base item cannot be changed.");
    }

    const existingVariantKey = String(existing.variantKey ?? "").trim() || null;
    const nextVariantKey = String(item.variantKey ?? "").trim() || null;
    if (existingVariantKey !== nextVariantKey && !nextProductId) {
      throw new HttpsError("invalid-argument", "Variant replacement requires the same base product.");
    }

    const qty = Math.floor(Number(item.qty ?? 0));
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new HttpsError("invalid-argument", "Quantity must be at least 1.");
    }

    const name = String(item.name ?? "").trim();
    if (!name) {
      throw new HttpsError("invalid-argument", "Each order line requires a name.");
    }

    batch.set(
      orderRef.collection("items").doc(itemId),
      {
        productId: nextProductId,
        variantKey: item.variantKey ?? null,
        name,
        receivingUom: String(item.receivingUom ?? "pc"),
        consumptionUom: String(item.consumptionUom ?? "pc"),
        cost: Number(item.cost ?? 0),
        qty,
        qtyCases: item.qtyCases == null ? null : Number(item.qtyCases),
        packageContains: item.packageContains == null ? null : Number(item.packageContains),
        sortOrder: index,
        updatedAt: now,
      },
      { merge: true },
    );
  });

  const totals = sumOrderItemInputs(items);
  batch.set(
    orderRef,
    {
      modifiedBySupervisor: true,
      supervisorEditedName,
      supervisorEditedAt: now,
      updatedAt: now,
      totalQty: totals.totalQty,
      totalAmount: totals.totalAmount,
    },
    { merge: true },
  );
}

async function nextOrderNumber(outletId: string, outletName: string): Promise<string> {
  const counterRef = getFirestore().collection(COLLECTIONS.transferOrderCounters).doc(outletId);
  const next = await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
    const value = current + 1;
    tx.set(
      counterRef,
      {
        outletId,
        value,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return value;
  });
  return formatOrderNumber(outletName, next);
}

async function peekOrderNumber(outletId: string, outletName: string): Promise<string> {
  const counterRef = getFirestore().collection(COLLECTIONS.transferOrderCounters).doc(outletId);
  const snap = await counterRef.get();
  const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
  return formatOrderNumber(outletName, current + 1);
}

function normalizeSignatureBase64(input: string): string {
  const raw = input.includes(",") ? input.split(",")[1] : input;
  const cleaned = raw?.replace(/\s/g, "") ?? "";
  if (!cleaned) {
    throw new HttpsError("invalid-argument", "employeeSignatureBase64 is empty.");
  }
  return cleaned;
}

function parseSignatureBase64(input: string): Buffer {
  const cleaned = normalizeSignatureBase64(input);
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) {
    throw new HttpsError("invalid-argument", "employeeSignatureBase64 is invalid.");
  }
  return buffer;
}

type PersistedSignature = {
  path: string | null;
  data: string | null;
};

async function persistOrderSignature(
  outletId: string,
  orderId: string,
  role: "employee" | "driver" | "offloader",
  signatureBase64: string,
): Promise<PersistedSignature> {
  const storagePath = `signatures/${outletId}/${orderId}/${role}.png`;
  const rawBase64 = normalizeSignatureBase64(signatureBase64);

  try {
    const bucket = getAppStorageBucket();
    await bucket.file(storagePath).save(parseSignatureBase64(signatureBase64), {
      contentType: "image/png",
      resumable: false,
      metadata: {
        cacheControl: "private, max-age=3600",
      },
    });
    return { path: storagePath, data: null };
  } catch (error) {
    console.warn(`[transfer-orders] ${role} signature upload failed, saving inline`, error);
    return { path: null, data: rawBase64 };
  }
}

async function persistEmployeeSignature(
  outletId: string,
  orderId: string,
  employeeSignatureBase64: string,
): Promise<PersistedSignature> {
  return persistOrderSignature(outletId, orderId, "employee", employeeSignatureBase64);
}

export const placeTransferOrder = onCall({ region: "africa-south1" }, async (request) => {
  try {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const profile = await requireAppUser(request.auth.uid);
  const outletId = String(request.data?.outletId ?? "");
  const employeeName = String(request.data?.employeeName ?? "").trim();
  const employeeSignatureBase64 = String(request.data?.employeeSignatureBase64 ?? "").trim();
  const items = (request.data?.items ?? []) as PlaceOrderItemInput[];

  if (!outletId || outletId !== profile.outletId) {
    throw new HttpsError("permission-denied", "You can only place orders for your outlet.");
  }
  if (!employeeName) {
    throw new HttpsError("invalid-argument", "employeeName is required.");
  }
  if (!employeeSignatureBase64) {
    throw new HttpsError("invalid-argument", "employeeSignatureBase64 is required.");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpsError("invalid-argument", "At least one order line is required.");
  }

  const db = getFirestore();
  await assertOutletCadenceAllowsItems(
    db,
    outletId,
    items.map((item) => ({
      productId: item.productId ?? null,
      qty: Number(item.qty ?? 0),
      name: item.name,
    })),
  );

  const orderRef = db.collection(COLLECTIONS.transferOrders).doc();
  const orderNumber = await nextOrderNumber(outletId, profile.outletName);
  const now = new Date().toISOString();
  const signature = await persistEmployeeSignature(outletId, orderRef.id, employeeSignatureBase64);

  const batch = db.batch();
  batch.set(orderRef, {
    outletId,
    outletName: profile.outletName,
    orderNumber,
    status: "order_placed",
    locked: false,
    employeeName,
    employee_signed_name: employeeName,
    employee_signature_path: signature.path,
    employee_signature_data: signature.data,
    employee_signed_at: now,
    createdAt: now,
    updatedAt: now,
    modifiedBySupervisor: false,
  });

  items.forEach((item, index) => {
    const itemRef = orderRef.collection("items").doc();
    batch.set(itemRef, {
      productId: item.productId ?? null,
      variantKey: item.variantKey ?? null,
      name: item.name,
      receivingUom: item.receivingUom,
      consumptionUom: item.consumptionUom,
      cost: Number(item.cost ?? 0),
      qty: Number(item.qty ?? 0),
      qtyCases: item.qtyCases == null ? null : Number(item.qtyCases),
      packageContains: item.packageContains == null ? null : Number(item.packageContains),
      sortOrder: index,
      createdAt: now,
    });
  });

  await batch.commit();
  return { orderId: orderRef.id, orderNumber, createdAt: now };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("[placeTransferOrder] unexpected error", error);
    throw new HttpsError(
      "internal",
      error instanceof Error ? error.message : "Failed to place order.",
    );
  }
});

export const peekNextOrderNumber = onCall({ region: "africa-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const profile = await requireAppUser(request.auth.uid);
  const outletId = String(request.data?.outletId ?? profile.outletId);
  if (!outletId || outletId !== profile.outletId) {
    throw new HttpsError("permission-denied", "You can only preview orders for your outlet.");
  }
  const orderNumber = await peekOrderNumber(outletId, profile.outletName);
  return { orderNumber };
});

export const completeTransferOrder = onCall({ region: "africa-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const profile = await requireAppUser(request.auth.uid);
  const orderId = String(request.data?.orderId ?? "");
  const offloaderName = String(request.data?.offloaderName ?? "").trim();
  const offloaderSignatureBase64 = String(request.data?.offloaderSignatureBase64 ?? "").trim();
  if (!orderId || !offloaderName || !offloaderSignatureBase64) {
    throw new HttpsError(
      "invalid-argument",
      "orderId, offloaderName, and offloaderSignatureBase64 are required.",
    );
  }

  const orderRef = getFirestore().collection(COLLECTIONS.transferOrders).doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const order = snap.data() as { outletId?: string; status?: string };
  if (order.outletId !== profile.outletId) {
    throw new HttpsError("permission-denied", "You can only complete orders for your outlet.");
  }
  if (order.status !== "loaded") {
    throw new HttpsError("failed-precondition", "Order must be in loaded status before completion.");
  }

  const outletId = String(order.outletId ?? "").trim();
  if (!outletId) {
    throw new HttpsError("failed-precondition", "Order outlet is missing.");
  }

  const now = new Date().toISOString();
  const signature = await persistOrderSignature(outletId, orderId, "offloader", offloaderSignatureBase64);

  await orderRef.set(
    {
      status: "completed",
      offloader_signed_name: offloaderName,
      offloader_signature_path: signature.path,
      offloader_signature_data: signature.data,
      offloader_signed_at: now,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: now,
    },
    { merge: true },
  );

  return { ok: true };
});

export const acceptTransferOrder = onCall(
  { region: "africa-south1", secrets: [wasenderApiKey, wasenderGroupId] },
  async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const profile = await requireAppUser(request.auth.uid);
  if (!profile.roles.includes("supervisor") && !profile.roles.includes("warehouse_admin")) {
    throw new HttpsError("permission-denied", "Supervisor role required.");
  }
  const orderId = String(request.data?.orderId ?? "");
  const supervisorName = String(request.data?.supervisorName ?? "").trim();
  const items = (request.data?.items ?? null) as UpdateOrderItemInput[] | null;
  const orderRef = getFirestore().collection(COLLECTIONS.transferOrders).doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
  const order = snap.data() as {
    status?: string;
    outletId?: string;
    outletName?: string;
    orderNumber?: string;
    createdAt?: string;
    modifiedBySupervisor?: boolean;
    employeeName?: string | null;
    employee_signed_name?: string | null;
    employeeSignedName?: string | null;
  };
  if (order.status !== "order_placed" && order.status !== "placed") {
    throw new HttpsError("failed-precondition", "Only placed orders can be accepted.");
  }

  const resolvedSupervisorName = supervisorName || resolveSupervisorDisplayName(profile);
  const employeeName =
    String(order.employee_signed_name ?? order.employeeSignedName ?? order.employeeName ?? "").trim() ||
    "Outlet employee";
  const now = new Date().toISOString();
  const db = getFirestore();
  const batch = db.batch();
  let modifiedBySupervisor = Boolean(order.modifiedBySupervisor);

  if (Array.isArray(items) && items.length > 0) {
    const outletId = String(order.outletId ?? "").trim();
    if (outletId) {
      await assertOutletCadenceAllowsItems(
        db,
        outletId,
        items.map((item) => ({
          productId: item.productId ?? null,
          qty: Number(item.qty ?? 0),
          name: item.name,
        })),
        { excludeOrderId: orderId },
      );
    }

    const existingSnap = await orderRef.collection("items").get();
    const existingById = new Map(
      existingSnap.docs.map((docSnap) => [docSnap.id, docSnap.data() as Record<string, unknown>]),
    );
    appendSupervisorItemUpdatesToBatch(
      batch,
      orderRef,
      items,
      existingById,
      resolvedSupervisorName,
      now,
    );
    modifiedBySupervisor = true;
  }

  batch.set(
    orderRef,
    {
      status: "accepted",
      supervisorName: resolvedSupervisorName,
      acceptedAt: FieldValue.serverTimestamp(),
      updatedAt: now,
    },
    { merge: true },
  );

  await batch.commit();

  let whatsappStatus: "sent" | "failed" | "skipped" = "skipped";
  let whatsappError: string | null = null;

  try {
    const itemsSnap = await orderRef.collection("items").get();
    const outletId = String(order.outletId ?? "").trim();
    const catalogSnap = outletId
      ? await db.collection(COLLECTIONS.outletOrderCatalog).where("outletId", "==", outletId).get()
      : null;
    const ordersAppUomLookup = catalogSnap ? buildOrdersAppUomLookup(catalogSnap.docs) : new Map<string, string>();
    const orderItems = itemsSnap.docs
      .map((docSnap) => ({
        sortOrder: Number(docSnap.data().sortOrder ?? 0),
        item: {
          name: String(docSnap.data().name ?? ""),
          qty: Number(docSnap.data().qty ?? 0),
          receivingUom: resolveOrdersAppUomForWhatsAppLine(
            {
              productId: (docSnap.data().productId as string | null | undefined) ?? null,
              variantKey: (docSnap.data().variantKey as string | null | undefined) ?? null,
              receivingUom: String(docSnap.data().receivingUom ?? "pc"),
              consumptionUom: String(docSnap.data().consumptionUom ?? "pc"),
              qty: Number(docSnap.data().qty ?? 0),
            },
            ordersAppUomLookup,
          ),
          cost: Number(docSnap.data().cost ?? 0),
          productId: (docSnap.data().productId as string | null | undefined) ?? null,
          variantKey: (docSnap.data().variantKey as string | null | undefined) ?? null,
        },
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((row) => row.item);

    const message = formatAcceptedOrderWhatsAppMessage({
      outletName: String(order.outletName ?? "").trim() || "Outlet",
      createdAt: String(order.createdAt ?? new Date().toISOString()),
      orderNumber: String(order.orderNumber ?? orderId),
      modifiedBySupervisor,
      employeeName,
      supervisorName: resolvedSupervisorName,
      items: orderItems,
    });

    await sendWasenderGroupMessage(message);
    whatsappStatus = "sent";
    await orderRef.set(
      {
        whatsappNotifiedAt: new Date().toISOString(),
        whatsappNotifyStatus: "sent",
        whatsappNotifyError: null,
      },
      { merge: true },
    );
  } catch (error) {
    whatsappStatus = "failed";
    whatsappError = error instanceof Error ? error.message : "WhatsApp send failed";
    console.error("[acceptTransferOrder] WhatsApp notification failed", error);
    await orderRef.set(
      {
        whatsappNotifyStatus: "failed",
        whatsappNotifyError: whatsappError,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  return { ok: true, whatsapp: { status: whatsappStatus, error: whatsappError } };
},
);

export const dispatchTransferOrder = onCall({ region: "africa-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const profile = await requireAppUser(request.auth.uid);
  if (!profile.roles.includes("supervisor") && !profile.roles.includes("warehouse_admin")) {
    throw new HttpsError("permission-denied", "Supervisor role required.");
  }
  const orderId = String(request.data?.orderId ?? "");
  const driverName = String(request.data?.driverName ?? "").trim();
  const driverSignatureBase64 = String(request.data?.driverSignatureBase64 ?? "").trim();
  if (!orderId || !driverName || !driverSignatureBase64) {
    throw new HttpsError("invalid-argument", "orderId, driverName, and driverSignatureBase64 are required.");
  }

  const orderRef = getFirestore().collection(COLLECTIONS.transferOrders).doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
  const order = snap.data() as { status?: string; outletId?: string };
  if (order.status !== "accepted") {
    throw new HttpsError("failed-precondition", "Only accepted orders can be dispatched.");
  }
  const outletId = String(order.outletId ?? "").trim();
  if (!outletId) {
    throw new HttpsError("failed-precondition", "Order outlet is missing.");
  }

  const now = new Date().toISOString();
  const signature = await persistOrderSignature(outletId, orderId, "driver", driverSignatureBase64);

  await orderRef.set(
    {
      status: "loaded",
      driverName,
      driver_signed_name: driverName,
      driver_signature_path: signature.path,
      driver_signature_data: signature.data,
      driver_signed_at: now,
      loadedAt: FieldValue.serverTimestamp(),
      updatedAt: now,
    },
    { merge: true },
  );
  return { ok: true };
});

export const updateTransferOrderItems = onCall({ region: "africa-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const profile = await requireAppUser(request.auth.uid);
  if (!profile.roles.includes("supervisor") && !profile.roles.includes("warehouse_admin")) {
    throw new HttpsError("permission-denied", "Supervisor role required.");
  }

  const orderId = String(request.data?.orderId ?? "");
  const items = (request.data?.items ?? []) as UpdateOrderItemInput[];
  if (!orderId) {
    throw new HttpsError("invalid-argument", "orderId is required.");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpsError("invalid-argument", "At least one order line is required.");
  }

  const db = getFirestore();
  const orderRef = db.collection(COLLECTIONS.transferOrders).doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }

  const order = orderSnap.data() as { status?: string; outletId?: string };
  if (order.status !== "order_placed" && order.status !== "placed") {
    throw new HttpsError("failed-precondition", "Only placed orders can be edited.");
  }

  const outletId = String(order.outletId ?? "").trim();
  if (outletId) {
    await assertOutletCadenceAllowsItems(
      db,
      outletId,
      items.map((item) => ({
        productId: item.productId ?? null,
        qty: Number(item.qty ?? 0),
        name: item.name,
      })),
      { excludeOrderId: orderId },
    );
  }

  const existingSnap = await orderRef.collection("items").get();
  const existingById = new Map(
    existingSnap.docs.map((docSnap) => [docSnap.id, docSnap.data() as Record<string, unknown>]),
  );

  const now = new Date().toISOString();
  const batch = db.batch();
  appendSupervisorItemUpdatesToBatch(
    batch,
    orderRef,
    items,
    existingById,
    resolveSupervisorDisplayName(profile),
    now,
  );

  await batch.commit();
  return { ok: true };
});

export const getTransferOrderSignatureUrl = onCall({ region: "africa-south1" }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const profile = await requireAppUser(request.auth.uid);
  const orderId = String(request.data?.orderId ?? "");
  const role = String(request.data?.role ?? "employee").trim().toLowerCase();
  if (!orderId) {
    throw new HttpsError("invalid-argument", "orderId is required.");
  }
  if (role !== "employee" && role !== "driver" && role !== "offloader") {
    throw new HttpsError("invalid-argument", "role must be employee, driver, or offloader.");
  }

  const orderRef = getFirestore().collection(COLLECTIONS.transferOrders).doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }

  const order = snap.data() as Record<string, unknown>;
  const isSupervisorUser =
    profile.roles.includes("supervisor") || profile.roles.includes("warehouse_admin");
  const canAccess =
    order.outletId === profile.outletId || isSupervisorUser || profile.allOutlets === true;
  if (!canAccess) {
    throw new HttpsError("permission-denied", "You cannot view this order signature.");
  }

  const roleFields =
    role === "driver"
      ? {
          data: order.driver_signature_data ?? order.driverSignatureData,
          path: order.driver_signature_path ?? order.driverSignaturePath,
        }
      : role === "offloader"
        ? {
            data: order.offloader_signature_data ?? order.offloaderSignatureData,
            path: order.offloader_signature_path ?? order.offloaderSignaturePath,
          }
        : {
            data: order.employee_signature_data ?? order.employeeSignatureData,
            path: order.employee_signature_path ?? order.employeeSignaturePath,
          };

  const inlineData = String(roleFields.data ?? "").trim();
  if (inlineData) {
    return { signedUrl: `data:image/png;base64,${inlineData}` };
  }

  const storagePath = String(roleFields.path ?? "").trim();
  if (!storagePath) {
    throw new HttpsError("not-found", `No ${role} signature on this order.`);
  }

  try {
    const [signedUrl] = await getAppStorageBucket().file(storagePath).getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });
    return { signedUrl };
  } catch (error) {
    console.error("[getTransferOrderSignatureUrl] signed URL failed", error);
    throw new HttpsError("not-found", `Unable to load ${role} signature.`);
  }
});
