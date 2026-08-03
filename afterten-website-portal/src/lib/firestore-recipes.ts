import "server-only";

import { randomUUID } from "crypto";
import { getFirestoreDb } from "@/lib/firebase-server";

function normalizeVariantKey(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length ? trimmed : "base";
}

export async function listFirestoreRecipeIngredientIds(
  finishedItemId: string,
  finishedVariantKey: string,
): Promise<string[]> {
  const snapshot = await getFirestoreDb().collection("recipes").where("finished_item_id", "==", finishedItemId).get();
  const ids = new Set<string>();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.active === false) continue;
    if (data.recipe_for_kind && data.recipe_for_kind !== "finished") continue;
    if (normalizeVariantKey(data.finished_variant_key) !== finishedVariantKey) continue;
    const ingredientId = typeof data.ingredient_item_id === "string" ? data.ingredient_item_id : null;
    if (ingredientId) ids.add(ingredientId);
  }
  return Array.from(ids);
}

export async function getFirestoreRecipeUomProfile(itemId: string, variantKey: string) {
  const snapshot = await getFirestoreDb()
    .collection("recipe_uom_profiles")
    .where("item_id", "==", itemId)
    .where("variant_key", "==", variantKey)
    .where("active", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) return { profile: null, steps: [] as Array<Record<string, unknown>> };

  const profileDoc = snapshot.docs[0];
  const profile = { id: profileDoc.id, ...profileDoc.data() };
  const stepsSnap = await getFirestoreDb()
    .collection("recipe_uom_chain_steps")
    .where("profile_id", "==", profileDoc.id)
    .get();

  const steps = stepsSnap.docs
    .map((doc) => doc.data())
    .sort((a, b) => Number(a.step_order ?? 0) - Number(b.step_order ?? 0));

  return { profile, steps };
}

export async function upsertFirestoreRecipeUomProfile(input: {
  itemId: string;
  variantKey: string;
  sourceUom: string;
  targetUom: string;
  steps: Array<{ step_order: number; from_uom: string; to_uom: string; multiplier: number }>;
}) {
  const db = getFirestoreDb();
  const now = new Date().toISOString();
  const existing = await db
    .collection("recipe_uom_profiles")
    .where("item_id", "==", input.itemId)
    .where("variant_key", "==", input.variantKey)
    .limit(1)
    .get();

  const profileId = existing.empty ? randomUUID() : existing.docs[0].id;
  await db
    .collection("recipe_uom_profiles")
    .doc(profileId)
    .set(
      {
        item_id: input.itemId,
        variant_key: input.variantKey,
        source_uom: input.sourceUom,
        target_uom: input.targetUom,
        active: true,
        updated_at: now,
      },
      { merge: true },
    );

  const stepsSnap = await db.collection("recipe_uom_chain_steps").where("profile_id", "==", profileId).get();
  const batch = db.batch();
  stepsSnap.docs.forEach((doc) => batch.delete(doc.ref));
  for (const step of input.steps) {
    const stepId = randomUUID();
    batch.set(db.collection("recipe_uom_chain_steps").doc(stepId), {
      profile_id: profileId,
      step_order: step.step_order,
      from_uom: step.from_uom,
      to_uom: step.to_uom,
      multiplier: step.multiplier,
      updated_at: now,
    });
  }
  await batch.commit();

  const profile = {
    id: profileId,
    item_id: input.itemId,
    variant_key: input.variantKey,
    source_uom: input.sourceUom,
    target_uom: input.targetUom,
  };
  return { profile, steps: input.steps };
}

export async function getFirestoreRecipeUomAvailableQty(
  warehouseId: string,
  itemId: string,
  variantKey: string,
): Promise<Record<string, unknown> | null> {
  const docId = `${warehouseId}__${itemId}__${normalizeVariantKey(variantKey)}`;
  const snap = await getFirestoreDb().collection("warehouse_live_items").doc(docId).get();
  if (!snap.exists) return { available_qty: 0, warehouse_id: warehouseId, item_id: itemId, variant_key: variantKey };
  const data = snap.data()!;
  return {
    available_qty: Number(data.netUnits ?? data.net_units ?? 0),
    warehouse_id: warehouseId,
    item_id: itemId,
    variant_key: variantKey,
  };
}

export async function listFirestoreRecipeSourceWarehouses(itemIds: string[]) {
  const db = getFirestoreDb();
  const selections: Record<string, string[]> = {};
  for (const itemId of itemIds) {
    const snapshot = await db
      .collection("item_warehouse_handling_policies")
      .where("item_id", "==", itemId)
      .where("recipe_source", "==", true)
      .get();
    for (const doc of snapshot.docs) {
      const warehouseId = doc.data().warehouse_id;
      if (typeof warehouseId !== "string") continue;
      const list = selections[itemId] ?? [];
      if (!list.includes(warehouseId)) list.push(warehouseId);
      selections[itemId] = list;
    }
  }
  return selections;
}

export async function saveFirestoreRecipeSourceWarehouses(
  selections: Array<{ item_id: string; warehouse_ids: string[] }>,
) {
  const db = getFirestoreDb();
  for (const entry of selections) {
    const existing = await db
      .collection("item_warehouse_handling_policies")
      .where("item_id", "==", entry.item_id)
      .where("recipe_source", "==", true)
      .get();
    const batch = db.batch();
    existing.docs.forEach((doc) => batch.delete(doc.ref));
    for (const warehouseId of entry.warehouse_ids) {
      const id = `${entry.item_id}_${warehouseId}_recipe`;
      batch.set(db.collection("item_warehouse_handling_policies").doc(id), {
        item_id: entry.item_id,
        warehouse_id: warehouseId,
        recipe_source: true,
        variant_key: "base",
        updated_at: new Date().toISOString(),
      });
    }
    await batch.commit();
  }
}
