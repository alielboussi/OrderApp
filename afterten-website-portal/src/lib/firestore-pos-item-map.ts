import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";

type PosMapRow = Record<string, unknown>;

function normalizeVariantKey(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length ? trimmed : "base";
}

function mapDoc(id: string, data: FirebaseFirestore.DocumentData): PosMapRow {
  return {
    id,
    pos_item_id: data.pos_item_id ?? null,
    pos_item_name: data.pos_item_name ?? null,
    pos_flavour_id: data.pos_flavour_id ?? null,
    pos_flavour_name: data.pos_flavour_name ?? null,
    catalog_item_id: data.catalog_item_id ?? null,
    catalog_variant_key: data.catalog_variant_key ?? data.normalized_variant_key ?? "base",
    normalized_variant_key: data.normalized_variant_key ?? normalizeVariantKey(data.catalog_variant_key),
    warehouse_id: data.warehouse_id ?? null,
    outlet_id: data.outlet_id ?? null,
  };
}

async function enrichRows(rows: PosMapRow[]): Promise<PosMapRow[]> {
  const db = getFirestoreDb();
  const itemIds = Array.from(
    new Set(rows.map((row) => row.catalog_item_id).filter((id): id is string => typeof id === "string")),
  );

  const catalogById = new Map<string, { name?: string | null; variants?: Map<string, string> }>();
  if (itemIds.length) {
    const [itemsSnap, variantsSnap] = await Promise.all([
      Promise.all(itemIds.map((id) => db.collection("catalog_items").doc(id).get())),
      db.collection("catalog_variants").where("item_id", "in", itemIds.slice(0, 10)).get(),
    ]);

    const variantLabelByItem = new Map<string, Map<string, string>>();
    for (const doc of variantsSnap.docs) {
      const data = doc.data();
      const itemId = data.item_id;
      if (typeof itemId !== "string") continue;
      const map = variantLabelByItem.get(itemId) ?? new Map<string, string>();
      map.set(doc.id, String(data.name ?? doc.id));
      map.set(normalizeVariantKey(doc.id), String(data.name ?? doc.id));
      variantLabelByItem.set(itemId, map);
    }

    for (const snap of itemsSnap) {
      if (!snap.exists) continue;
      catalogById.set(snap.id, {
        name: snap.data()?.name ?? null,
        variants: variantLabelByItem.get(snap.id) ?? new Map(),
      });
    }
  }

  return rows.map((row) => {
    const catalog = typeof row.catalog_item_id === "string" ? catalogById.get(row.catalog_item_id) : undefined;
    const variantKey = normalizeVariantKey(String(row.catalog_variant_key ?? "base"));
    const variantLabel = catalog?.variants?.get(variantKey) ?? null;
    return {
      ...row,
      catalog_item_name: catalog?.name ?? null,
      catalog_variant_label: variantLabel,
      pos_item_name: row.pos_item_name ?? catalog?.name ?? row.pos_item_id ?? null,
      pos_flavour_name: row.pos_flavour_name ?? row.pos_flavour_id ?? null,
    };
  });
}

export async function listFirestorePosItemMap() {
  const snapshot = await getFirestoreDb().collection("pos_item_map").get();
  const rows = snapshot.docs.map((doc) => mapDoc(doc.id, doc.data()));
  return enrichRows(rows);
}

function matchRow(row: PosMapRow, criteria: PosMapRow): boolean {
  const keys = [
    "pos_item_id",
    "pos_flavour_id",
    "catalog_item_id",
    "catalog_variant_key",
    "warehouse_id",
    "outlet_id",
  ] as const;
  for (const key of keys) {
    const expected = criteria[key];
    const actual = row[key];
    if (expected == null && (actual == null || actual === "")) continue;
    if (String(actual ?? "") !== String(expected ?? "")) return false;
  }
  return true;
}

export async function createFirestorePosItemMap(payload: PosMapRow) {
  const db = getFirestoreDb();
  const snapshot = await db.collection("pos_item_map").get();
  const rows = snapshot.docs.map((doc) => mapDoc(doc.id, doc.data()));
  const existing = rows.find((row) => matchRow(row, payload));
  if (existing) {
    const [enriched] = await enrichRows([existing]);
    return { mapping: enriched ?? existing, duplicate: true };
  }

  const id = [
    payload.outlet_id,
    payload.pos_item_id,
    payload.pos_flavour_id || "none",
    payload.catalog_item_id,
    normalizeVariantKey(String(payload.catalog_variant_key ?? "base")),
    payload.warehouse_id || "none",
  ].join("__");

  const data = {
    ...payload,
    normalized_variant_key: normalizeVariantKey(String(payload.catalog_variant_key ?? "base")),
    updated_at: new Date().toISOString(),
  };
  await db.collection("pos_item_map").doc(id).set(data, { merge: true });
  const [enriched] = await enrichRows([mapDoc(id, data)]);
  return { mapping: enriched ?? mapDoc(id, data), duplicate: false };
}

export async function deleteFirestorePosItemMap(criteria: PosMapRow) {
  const snapshot = await getFirestoreDb().collection("pos_item_map").get();
  const batch = getFirestoreDb().batch();
  let deleted = 0;
  for (const doc of snapshot.docs) {
    const row = mapDoc(doc.id, doc.data());
    if (matchRow(row, criteria)) {
      batch.delete(doc.ref);
      deleted += 1;
    }
  }
  if (deleted > 0) await batch.commit();
}
