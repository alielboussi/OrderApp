import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";

export type PosSyncFailureRow = {
  id: string;
  created_at: string;
  outlet_id: string | null;
  outlet_name: string;
  stage: string | null;
  error_message: string | null;
  source_event_id: string | null;
  pos_order_id: string | null;
  sale_id: string | null;
  details: Record<string, unknown> | null;
};

function toIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

export async function listFirestorePosSyncFailures(options: {
  outletIds?: string[];
  startDate?: string | null;
  endDate?: string | null;
  search?: string | null;
  limit?: number;
}): Promise<PosSyncFailureRow[]> {
  const db = getFirestoreDb();
  const limit = Math.min(options.limit ?? 2000, 2000);

  let query: FirebaseFirestore.Query = db
    .collection("pos_sync_failures")
    .orderBy("createdAt", "desc")
    .limit(limit);

  if (options.outletIds && options.outletIds.length === 1) {
    query = db
      .collection("pos_sync_failures")
      .where("outletId", "==", options.outletIds[0])
      .orderBy("createdAt", "desc")
      .limit(limit);
  }

  const snapshot = await query.get();
  const outletIds = new Set<string>();
  const rawRows: Array<{
    id: string;
    created_at: string;
    outlet_id: string | null;
    stage: string | null;
    error_message: string | null;
    source_event_id: string | null;
    pos_order_id: string | null;
    sale_id: string | null;
    details: Record<string, unknown> | null;
  }> = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const outletId = typeof data.outletId === "string" ? data.outletId : typeof data.outlet_id === "string" ? data.outlet_id : null;
    if (options.outletIds && options.outletIds.length > 1 && outletId && !options.outletIds.includes(outletId)) {
      continue;
    }

    const createdAt = toIso(data.createdAt ?? data.created_at);
    if (options.startDate) {
      const startIso = new Date(`${options.startDate}T00:00:00`).toISOString();
      if (createdAt < startIso) continue;
    }
    if (options.endDate) {
      const end = new Date(`${options.endDate}T00:00:00`);
      end.setDate(end.getDate() + 1);
      if (createdAt >= end.toISOString()) continue;
    }

    const row = {
      id: doc.id,
      created_at: createdAt,
      outlet_id: outletId,
      stage: typeof data.stage === "string" ? data.stage : null,
      error_message:
        typeof data.errorMessage === "string"
          ? data.errorMessage
          : typeof data.error_message === "string"
            ? data.error_message
            : null,
      source_event_id:
        typeof data.sourceEventId === "string"
          ? data.sourceEventId
          : typeof data.source_event_id === "string"
            ? data.source_event_id
            : null,
      pos_order_id:
        typeof data.posOrderId === "string"
          ? data.posOrderId
          : typeof data.pos_order_id === "string"
            ? data.pos_order_id
            : null,
      sale_id: typeof data.saleId === "string" ? data.saleId : typeof data.sale_id === "string" ? data.sale_id : null,
      details: data.details && typeof data.details === "object" ? (data.details as Record<string, unknown>) : null,
    };

    const search = options.search?.trim().toLowerCase();
    if (search) {
      const haystack = [
        row.stage,
        row.error_message,
        row.pos_order_id,
        row.sale_id,
        row.source_event_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) continue;
    }

    if (outletId) outletIds.add(outletId);
    rawRows.push(row);
  }

  const outletNameMap = new Map<string, string>();
  if (outletIds.size > 0) {
    const outletsSnap = await db.collection("outlets").get();
    for (const doc of outletsSnap.docs) {
      if (!outletIds.has(doc.id)) continue;
      const name = doc.data().name;
      outletNameMap.set(doc.id, typeof name === "string" && name.trim() ? name.trim() : doc.id);
    }
  }

  return rawRows.map((row) => ({
    ...row,
    outlet_name: row.outlet_id ? (outletNameMap.get(row.outlet_id) ?? row.outlet_id) : "Unknown outlet",
  }));
}
