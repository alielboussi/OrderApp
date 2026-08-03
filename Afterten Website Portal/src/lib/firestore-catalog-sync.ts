import "server-only";

import { randomUUID } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getFirestoreDb } from "@/lib/firebase-server";

export type CatalogSyncEventInsert = {
  outlet_id: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
};

export type CatalogSyncEventStatusRow = {
  id: string;
  status: string;
  delivered_at: string | null;
  error_message: string | null;
  outlet_id: string;
};

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

export async function enqueueFirestoreCatalogSyncForOutlet(
  outletId: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const eventId = randomUUID();
  const now = Timestamp.now();
  await getFirestoreDb().collection("outlet_catalog_sync_events").doc(eventId).set({
    outletId,
    entityType,
    entityId,
    payload,
    status: "pending",
    createdAt: now,
    deliveredAt: null,
    errorMessage: null,
  });
  return eventId;
}

export async function insertFirestoreCatalogSyncRows(rows: CatalogSyncEventInsert[]): Promise<string[]> {
  if (!rows.length) return [];
  const db = getFirestoreDb();
  const batch = db.batch();
  const eventIds: string[] = [];
  const now = Timestamp.now();

  for (const row of rows) {
    const eventId = randomUUID();
    eventIds.push(eventId);
    batch.set(db.collection("outlet_catalog_sync_events").doc(eventId), {
      outletId: row.outlet_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      payload: row.payload,
      status: "pending",
      createdAt: now,
      deliveredAt: null,
      errorMessage: null,
    });
  }

  await batch.commit();
  return eventIds;
}

export async function getFirestoreCatalogSyncStatus(eventIds: string[]) {
  const db = getFirestoreDb();
  const refs = eventIds.map((id) => db.collection("outlet_catalog_sync_events").doc(id));
  const snapshots = refs.length > 0 ? await db.getAll(...refs) : [];

  const byId = new Map<string, CatalogSyncEventStatusRow>();
  for (const snap of snapshots) {
    if (!snap.exists) continue;
    const data = snap.data() ?? {};
    byId.set(snap.id, {
      id: snap.id,
      status: String(data.status ?? "pending"),
      delivered_at: timestampToIso(data.deliveredAt),
      error_message: typeof data.errorMessage === "string" ? data.errorMessage : null,
      outlet_id: String(data.outletId ?? ""),
    });
  }

  let pending = 0;
  let delivered = 0;
  let lastDeliveredAt: string | null = null;

  for (const id of eventIds) {
    const row = byId.get(id);
    if (!row || row.status === "pending") {
      pending += 1;
      continue;
    }
    if (row.status === "delivered") {
      delivered += 1;
      if (row.delivered_at && (!lastDeliveredAt || row.delivered_at > lastDeliveredAt)) {
        lastDeliveredAt = row.delivered_at;
      }
    }
  }

  return {
    total: eventIds.length,
    pending,
    delivered,
    last_delivered_at: lastDeliveredAt,
    complete: pending === 0 && delivered === eventIds.length,
  };
}

export async function getLastCatalogSyncByOutlet(): Promise<Record<string, string>> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection("outlet_catalog_sync_events")
    .where("status", "==", "delivered")
    .orderBy("deliveredAt", "desc")
    .limit(500)
    .get();

  const lastByOutlet: Record<string, string> = {};
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const outletId = String(data.outletId ?? "");
    const deliveredAt = timestampToIso(data.deliveredAt);
    const entityType = String(data.entityType ?? "");
    const command =
      data.payload && typeof data.payload === "object" && !Array.isArray(data.payload)
        ? (data.payload as Record<string, unknown>).command
        : null;
    const isPosCatalogSync = entityType === "sync_pos_catalog" || command === "sync_pos_catalog";
    if (!outletId || !deliveredAt || !isPosCatalogSync) continue;
    if (!lastByOutlet[outletId]) {
      lastByOutlet[outletId] = deliveredAt;
    }
  }
  return lastByOutlet;
}

export async function cancelFirestorePendingCatalogSyncForOfflineOutlets(offlineMs: number) {
  const db = getFirestoreDb();
  const cutoffIso = new Date(Date.now() - offlineMs).toISOString();

  const [heartbeatSnap, pendingSnap] = await Promise.all([
    db.collection("outlet_heartbeats").get(),
    db.collection("outlet_catalog_sync_events").where("status", "==", "pending").get(),
  ]);

  const heartbeatByOutlet = new Map<string, string | null>();
  for (const doc of heartbeatSnap.docs) {
    const lastSeen = timestampToIso(doc.data().lastSeenAt);
    heartbeatByOutlet.set(doc.id, lastSeen);
  }

  const pending = pendingSnap.docs.map((doc) => ({
    id: doc.id,
    outlet_id: String(doc.data().outletId ?? ""),
  }));

  if (!pending.length) {
    return { removed: 0, offline_outlets: [] as Array<{ outlet_id: string; outlet_name: string }> };
  }

  const isOnline = (outletId: string) => {
    const lastSeen = heartbeatByOutlet.get(outletId);
    return Boolean(lastSeen && lastSeen >= cutoffIso);
  };

  const offlineOutletIds = Array.from(
    new Set(pending.map((row) => row.outlet_id).filter((outletId) => outletId && !isOnline(outletId))),
  );

  if (!offlineOutletIds.length) {
    return { removed: 0, offline_outlets: [] as Array<{ outlet_id: string; outlet_name: string }> };
  }

  const eventIdsToRemove = pending
    .filter((row) => offlineOutletIds.includes(row.outlet_id))
    .map((row) => row.id);

  const batch = db.batch();
  for (const eventId of eventIdsToRemove) {
    batch.delete(db.collection("outlet_catalog_sync_events").doc(eventId));
  }
  await batch.commit();

  const outletSnaps = await Promise.all(offlineOutletIds.map((id) => db.collection("outlets").doc(id).get()));
  const offlineOutlets = outletSnaps
    .filter((snap) => snap.exists)
    .map((snap) => ({
      outlet_id: snap.id,
      outlet_name: String(snap.data()?.name ?? snap.id),
    }));

  return { removed: eventIdsToRemove.length, offline_outlets: offlineOutlets };
}
