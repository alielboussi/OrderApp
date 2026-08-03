import { randomUUID } from "crypto";
import { Timestamp, type DocumentData, type Query } from "firebase-admin/firestore";
import { getFirestoreDb } from "@/lib/firebase-server";
import { validateCashierPassword } from "@/lib/cashiers";

export type FirestoreCashierRow = {
  id: string;
  outlet_id: string;
  name: string;
  username: string;
  user_type: string;
  pos_user_id: number | null;
  sync_status: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
};

function mapCashierDoc(id: string, data: DocumentData): FirestoreCashierRow {
  return {
    id,
    outlet_id: String(data.outletId ?? ""),
    name: String(data.name ?? ""),
    username: String(data.username ?? ""),
    user_type: String(data.userType ?? "Cashier"),
    pos_user_id: typeof data.posUserId === "number" ? data.posUserId : null,
    sync_status: String(data.syncStatus ?? "pending_insert"),
    active: data.active !== false,
    created_at: timestampToIso(data.createdAt),
    updated_at: timestampToIso(data.updatedAt),
    last_synced_at: data.lastSyncedAt ? timestampToIso(data.lastSyncedAt) : null,
  };
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

export async function listFirestoreCashiers(outletId?: string, includeDeleted = false) {
  const db = getFirestoreDb();
  let query: Query = db.collection("outlet_cashiers");
  if (outletId) {
    query = query.where("outletId", "==", outletId);
  }

  const snapshot = await query.get();
  const rows = snapshot.docs.map((doc) => mapCashierDoc(doc.id, doc.data()));
  if (includeDeleted) return rows;
  return rows.filter((row) => row.sync_status !== "deleted");
}

export async function createFirestoreCashier(params: {
  outletId: string;
  name: string;
  username: string;
  password: string;
}) {
  const passwordError = validateCashierPassword(params.password);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const db = getFirestoreDb();
  const now = Timestamp.now();
  const cashierId = randomUUID();
  const eventId = randomUUID();

  const existing = await db
    .collection("outlet_cashiers")
    .where("outletId", "==", params.outletId)
    .where("username", "==", params.username)
    .where("active", "==", true)
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new Error("A cashier with this username already exists for this outlet");
  }

  const cashierRef = db.collection("outlet_cashiers").doc(cashierId);
  const eventRef = db.collection("outlet_cashier_sync_events").doc(eventId);
  const batch = db.batch();

  batch.set(cashierRef, {
    outletId: params.outletId,
    name: params.name,
    username: params.username,
    userType: "Cashier",
    posUserId: null,
    syncStatus: "pending_insert",
    active: true,
    createdAt: now,
    updatedAt: now,
    lastSyncedAt: null,
  });

  batch.set(eventRef, {
    outletId: params.outletId,
    cashierId,
    action: "insert",
    payload: {
      name: params.name,
      username: params.username,
      password: params.password,
      user_type: "Cashier",
    },
    status: "pending",
    createdAt: now,
    deliveredAt: null,
    errorMessage: null,
  });

  await batch.commit();
  const cashier = mapCashierDoc(cashierId, (await cashierRef.get()).data() ?? {});
  return { cashier, sync_event_id: eventId };
}

export async function deleteFirestoreCashier(cashierId: string) {
  const db = getFirestoreDb();
  const cashierRef = db.collection("outlet_cashiers").doc(cashierId);
  const cashierSnap = await cashierRef.get();
  if (!cashierSnap.exists) {
    throw new Error("Cashier not found");
  }

  const data = cashierSnap.data() ?? {};
  const syncStatus = String(data.syncStatus ?? "");
  if (syncStatus === "deleted") throw new Error("Cashier is already deleted");
  if (syncStatus === "pending_delete") throw new Error("Cashier delete is already queued");
  if (!data.posUserId) {
    throw new Error("Cashier has not synced to MintPOS yet. Wait for middleware sync or pull cashiers first.");
  }

  const eventId = randomUUID();
  const now = Timestamp.now();
  const batch = db.batch();
  batch.set(
    cashierRef,
    {
      syncStatus: "pending_delete",
      updatedAt: now,
    },
    { merge: true },
  );
  batch.set(db.collection("outlet_cashier_sync_events").doc(eventId), {
    outletId: data.outletId,
    cashierId,
    action: "delete",
    payload: {
      pos_user_id: data.posUserId,
      username: data.username,
      name: data.name,
    },
    status: "pending",
    createdAt: now,
    deliveredAt: null,
    errorMessage: null,
  });
  await batch.commit();

  return {
    ok: true,
    cashier_id: cashierId,
    sync_event_id: eventId,
    message:
      "Cashier delete queued. Middleware will remove Rights rows first, then delete the MintPOS user.",
  };
}

export async function queueFirestoreCashierPull(outletId: string, outletName?: string | null) {
  const db = getFirestoreDb();
  const eventId = randomUUID();
  await db.collection("outlet_cashier_sync_events").doc(eventId).set({
    outletId,
    cashierId: null,
    action: "pull",
    payload: {
      requested_at: new Date().toISOString(),
      outlet_name: outletName ?? null,
    },
    status: "pending",
    createdAt: Timestamp.now(),
    deliveredAt: null,
    errorMessage: null,
  });
  return eventId;
}

export async function getFirestoreOutlet(outletId: string) {
  const db = getFirestoreDb();
  const snap = await db.collection("outlets").doc(outletId).get();
  if (!snap.exists) return null;
  return {
    id: outletId,
    name: snap.get("name") as string | null,
    has_pos_middleware: snap.get("hasPosMiddleware") === true,
  };
}
