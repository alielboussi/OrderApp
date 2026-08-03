import { randomUUID } from "crypto";
import { getFirestoreDb } from "@/lib/firebase-server";
import {
  diffTrackedFields,
  classifyItemChange,
  classifyMenuGroupChange,
  classifyVariantChange,
  type CatalogChangeActor,
  type CatalogEntityType,
} from "@/lib/catalog-change-events";

function nowIso(): string {
  return new Date().toISOString();
}

function asRow(id: string, data: FirebaseFirestore.DocumentData | undefined): Record<string, unknown> {
  const row = { ...(data ?? {}) };
  delete row.updated_at;
  return { id, ...row };
}

export async function recordFirestoreCatalogChangeEvent(input: {
  operation: "insert" | "update" | "delete";
  entityType: CatalogEntityType;
  entityId: string;
  entityName?: string | null;
  sku?: string | null;
  menuGroupId?: string | null;
  itemId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  trackedFields: string[];
  actor?: CatalogChangeActor;
  snapshot?: Record<string, unknown> | null;
}) {
  const changes =
    input.operation === "insert"
      ? []
      : input.operation === "delete"
        ? []
        : diffTrackedFields(input.before, input.after, input.trackedFields);

  if (input.operation === "update" && changes.length === 0) return;

  let changeType;
  if (input.entityType === "item") {
    changeType = classifyItemChange(input.operation, changes);
  } else if (input.entityType === "variant") {
    changeType = classifyVariantChange(input.operation, changes);
  } else {
    changeType = classifyMenuGroupChange(input.operation, changes);
  }

  const id = randomUUID();
  const createdAt = nowIso();
  await getFirestoreDb()
    .collection("catalog_change_events")
    .doc(id)
    .set({
      change_type: changeType,
      entity_type: input.entityType,
      entity_id: input.entityId,
      entity_name: input.entityName ?? null,
      sku: input.sku ?? null,
      menu_group_id: input.menuGroupId ?? null,
      item_id: input.itemId ?? null,
      actor_user_id: input.actor?.user_id ?? null,
      actor_email: input.actor?.user_email ?? null,
      changes,
      snapshot: input.snapshot ?? (input.operation === "delete" ? input.before ?? null : null),
      source: "backoffice_api",
      created_at: createdAt,
    });
}

export async function listFirestoreCatalogChangeEvents(filters: {
  since?: string | null;
  until?: string | null;
  limit: number;
  entityId?: string | null;
  sku?: string | null;
  changeTypes?: string[];
  entityTypes?: string[];
}) {
  const snapshot = await getFirestoreDb().collection("catalog_change_events").get();
  let rows = snapshot.docs.map((doc) => asRow(doc.id, doc.data()));

  if (filters.since) rows = rows.filter((row) => String(row.created_at ?? "") > filters.since!);
  if (filters.until) rows = rows.filter((row) => String(row.created_at ?? "") <= filters.until!);
  if (filters.entityId) rows = rows.filter((row) => row.entity_id === filters.entityId);
  if (filters.sku) {
    const needle = filters.sku.toLowerCase();
    rows = rows.filter((row) => String(row.sku ?? "").toLowerCase().includes(needle));
  }
  if (filters.changeTypes?.length) rows = rows.filter((row) => filters.changeTypes!.includes(String(row.change_type)));
  if (filters.entityTypes?.length) rows = rows.filter((row) => filters.entityTypes!.includes(String(row.entity_type)));

  return rows
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, filters.limit);
}
