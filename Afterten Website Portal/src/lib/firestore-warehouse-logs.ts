import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";

export type WarehouseLogRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  action: string | null;
  page: string | null;
  method: string | null;
  status: number | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, unknown> | null;
};

function toIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

function mapRow(id: string, data: FirebaseFirestore.DocumentData): WarehouseLogRow {
  return {
    id,
    created_at: toIso(data.createdAt ?? data.created_at),
    user_id: typeof data.userId === "string" ? data.userId : typeof data.user_id === "string" ? data.user_id : null,
    user_email:
      typeof data.userEmail === "string"
        ? data.userEmail
        : typeof data.user_email === "string"
          ? data.user_email
          : null,
    action: typeof data.action === "string" ? data.action : null,
    page: typeof data.page === "string" ? data.page : null,
    method: typeof data.method === "string" ? data.method : null,
    status: typeof data.status === "number" ? data.status : null,
    entity_type:
      typeof data.entityType === "string"
        ? data.entityType
        : typeof data.entity_type === "string"
          ? data.entity_type
          : null,
    entity_id:
      typeof data.entityId === "string"
        ? data.entityId
        : typeof data.entity_id === "string"
          ? data.entity_id
          : null,
    entity_name:
      typeof data.entityName === "string"
        ? data.entityName
        : typeof data.entity_name === "string"
          ? data.entity_name
          : null,
    details: data.details && typeof data.details === "object" ? (data.details as Record<string, unknown>) : null,
  };
}

function matchesFilters(row: WarehouseLogRow, options: {
  search?: string | null;
  userQuery?: string | null;
  actionQuery?: string | null;
  actions?: string[];
  pageQuery?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}): boolean {
  if (options.actions && options.actions.length > 0 && (!row.action || !options.actions.includes(row.action))) {
    return false;
  }
  if (options.actionQuery && row.action !== options.actionQuery) return false;
  if (options.userQuery) {
    const hay = (row.user_email ?? "").toLowerCase();
    if (!hay.includes(options.userQuery.toLowerCase())) return false;
  }
  if (options.pageQuery) {
    const hay = (row.page ?? "").toLowerCase();
    if (!hay.includes(options.pageQuery.toLowerCase())) return false;
  }
  if (options.search) {
    const hay = [
      row.user_email,
      row.action,
      row.page,
      row.entity_name,
      row.entity_id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(options.search.toLowerCase())) return false;
  }
  if (options.startDate) {
    const startIso = new Date(`${options.startDate}T00:00:00`).toISOString();
    if (row.created_at < startIso) return false;
  }
  if (options.endDate) {
    const end = new Date(`${options.endDate}T00:00:00`);
    end.setDate(end.getDate() + 1);
    if (row.created_at >= end.toISOString()) return false;
  }
  return true;
}

export async function listFirestoreWarehouseLogs(options: {
  search?: string | null;
  userQuery?: string | null;
  actionQuery?: string | null;
  actions?: string[];
  pageQuery?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
}): Promise<WarehouseLogRow[]> {
  const db = getFirestoreDb();
  const limit = Math.min(options.limit ?? 500, 2000);
  const snapshot = await db
    .collection("warehouse_backoffice_logs")
    .orderBy("createdAt", "desc")
    .limit(Math.max(limit, 2000))
    .get();

  return snapshot.docs
    .map((doc) => mapRow(doc.id, doc.data()))
    .filter((row) => matchesFilters(row, options))
    .slice(0, limit);
}

export async function insertFirestoreWarehouseLog(input: {
  user_id: string | null;
  user_email: string | null;
  action: string | null;
  page: string | null;
  method: string | null;
  status: number | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, unknown> | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await getFirestoreDb()
    .collection("warehouse_backoffice_logs")
    .add({
      userId: input.user_id,
      userEmail: input.user_email,
      action: input.action,
      page: input.page,
      method: input.method,
      status: input.status,
      entityType: input.entity_type,
      entityId: input.entity_id,
      entityName: input.entity_name,
      details: input.details,
      createdAt: now,
    });
}
