import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { recordFirestoreCatalogChangeEvent } from "@/lib/firestore-catalog-change-events";
import { getServiceClient } from "@/lib/supabase-server";

export const CATALOG_CHANGE_TYPES = [
  "product_added",
  "product_deleted",
  "product_name_updated",
  "product_price_updated",
  "product_cost_updated",
  "product_updated",
  "variant_added",
  "variant_deleted",
  "variant_name_updated",
  "variant_price_updated",
  "variant_cost_updated",
  "variant_updated",
  "menu_group_added",
  "menu_group_deleted",
  "menu_group_name_updated",
  "menu_group_updated",
] as const;

export type CatalogChangeType = (typeof CATALOG_CHANGE_TYPES)[number];

export type CatalogEntityType = "item" | "variant" | "menu_group";

export type CatalogFieldChange = {
  field: string;
  old_value: unknown;
  new_value: unknown;
};

export type CatalogChangeActor = {
  user_id?: string | null;
  user_email?: string | null;
};

export const ITEM_TRACKED_FIELDS = ["name", "selling_price", "cost", "sku", "menu_group_id", "active", "item_kind"] as const;
export const VARIANT_TRACKED_FIELDS = ["name", "selling_price", "cost", "sku", "active"] as const;
export const MENU_GROUP_TRACKED_FIELDS = ["name", "pos_menu_group_id", "active", "sort_order"] as const;

export type CatalogChangeEventRow = {
  id: string;
  created_at: string;
  change_type: CatalogChangeType;
  entity_type: CatalogEntityType;
  entity_id: string;
  entity_name: string | null;
  sku: string | null;
  menu_group_id: string | null;
  item_id: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  changes: CatalogFieldChange[];
  snapshot: Record<string, unknown> | null;
  source: string;
};

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return String(a) === String(b);
}

export function diffTrackedFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: string[]
): CatalogFieldChange[] {
  const result: CatalogFieldChange[] = [];
  for (const field of fields) {
    const oldValue = before?.[field] ?? null;
    const newValue = after?.[field] ?? null;
    if (!valuesEqual(oldValue, newValue)) {
      result.push({ field, old_value: oldValue, new_value: newValue });
    }
  }
  return result;
}

export function classifyItemChange(
  operation: "insert" | "update" | "delete",
  changes: CatalogFieldChange[]
): CatalogChangeType {
  if (operation === "insert") return "product_added";
  if (operation === "delete") return "product_deleted";
  const fields = new Set(changes.map((change) => change.field));
  if (fields.size === 1) {
    if (fields.has("name")) return "product_name_updated";
    if (fields.has("selling_price")) return "product_price_updated";
    if (fields.has("cost")) return "product_cost_updated";
  }
  return "product_updated";
}

export function classifyVariantChange(
  operation: "insert" | "update" | "delete",
  changes: CatalogFieldChange[]
): CatalogChangeType {
  if (operation === "insert") return "variant_added";
  if (operation === "delete") return "variant_deleted";
  const fields = new Set(changes.map((change) => change.field));
  if (fields.size === 1) {
    if (fields.has("name")) return "variant_name_updated";
    if (fields.has("selling_price")) return "variant_price_updated";
    if (fields.has("cost")) return "variant_cost_updated";
  }
  return "variant_updated";
}

export function classifyMenuGroupChange(
  operation: "insert" | "update" | "delete",
  changes: CatalogFieldChange[]
): CatalogChangeType {
  if (operation === "insert") return "menu_group_added";
  if (operation === "delete") return "menu_group_deleted";
  const fields = new Set(changes.map((change) => change.field));
  if (fields.size === 1 && fields.has("name")) return "menu_group_name_updated";
  return "menu_group_updated";
}

export function parseCatalogChangeActor(request: Request): CatalogChangeActor {
  const userId = request.headers.get("x-warehouse-user-id")?.trim() || null;
  const userEmail = request.headers.get("x-warehouse-user-email")?.trim() || null;
  return { user_id: userId, user_email: userEmail };
}

export async function recordCatalogChange(
  input: {
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
  },
) {
  if (useFirebaseBackend()) {
    await recordFirestoreCatalogChangeEvent(input);
    return;
  }
  await recordCatalogChangeEvent(getServiceClient(), input);
}

export async function recordCatalogChangeEvent(
  supabase: SupabaseClient,
  input: {
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
  }
) {
  const changes =
    input.operation === "insert"
      ? []
      : input.operation === "delete"
        ? []
        : diffTrackedFields(input.before, input.after, input.trackedFields);

  if (input.operation === "update" && changes.length === 0) {
    return;
  }

  if (useFirebaseBackend()) {
    await recordFirestoreCatalogChangeEvent(input);
    return;
  }

  let changeType: CatalogChangeType;
  if (input.entityType === "item") {
    changeType = classifyItemChange(input.operation, changes);
  } else if (input.entityType === "variant") {
    changeType = classifyVariantChange(input.operation, changes);
  } else {
    changeType = classifyMenuGroupChange(input.operation, changes);
  }

  const row = {
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
  };

  try {
    const { error } = await supabase.from("catalog_change_events").insert(row);
    if (error) {
      console.error("[catalog-change-events] insert failed", error.message);
    }
  } catch (error) {
    console.error("[catalog-change-events] insert failed", error);
  }
}
