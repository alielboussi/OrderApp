import { randomUUID } from "crypto";
import { getFirestoreDb } from "@/lib/firebase-server";

type DocRow = Record<string, unknown>;

function nowIso(): string {
  return new Date().toISOString();
}

function asRow(id: string, data: FirebaseFirestore.DocumentData | undefined): DocRow {
  const row = { ...(data ?? {}) };
  delete row.updated_at;
  return { id, ...row };
}

function matchesSearch(row: DocRow, search: string, fields: string[]): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return fields.some((field) => {
    const value = row[field];
    return typeof value === "string" && value.toLowerCase().includes(needle);
  });
}

function normalizeVariantKey(value?: string | null): string {
  const normalized = value?.trim();
  return normalized && normalized.length ? normalized : "base";
}

export function buildStorageHomeIds(primaryId: string | null, extraIds: string[]): string[] {
  if (!extraIds.length && primaryId) return [primaryId];
  if (!primaryId) return extraIds;
  return extraIds.includes(primaryId) ? extraIds : [primaryId, ...extraIds];
}

// --- Menu groups ---

export async function listFirestoreMenuGroups() {
  const snapshot = await getFirestoreDb().collection("catalog_menu_groups").get();
  return snapshot.docs
    .map((doc) => asRow(doc.id, doc.data()))
    .sort((a, b) => {
      const aPos = typeof a.pos_menu_group_id === "number" ? a.pos_menu_group_id : 0;
      const bPos = typeof b.pos_menu_group_id === "number" ? b.pos_menu_group_id : 0;
      if (aPos !== bPos) return aPos - bPos;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
}

export async function getFirestoreMenuGroup(id: string) {
  const snap = await getFirestoreDb().collection("catalog_menu_groups").doc(id).get();
  if (!snap.exists) return null;
  return asRow(snap.id, snap.data());
}

export async function createFirestoreMenuGroup(payload: DocRow) {
  const id = randomUUID();
  const createdAt = nowIso();
  const row = { ...payload, created_at: createdAt, updated_at: createdAt };
  await getFirestoreDb().collection("catalog_menu_groups").doc(id).set(row);
  return asRow(id, row);
}

export async function updateFirestoreMenuGroup(id: string, payload: DocRow) {
  const ref = getFirestoreDb().collection("catalog_menu_groups").doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;
  const row = { ...payload, updated_at: nowIso() };
  await ref.set(row, { merge: true });
  const merged = { ...existing.data(), ...row };
  return asRow(id, merged);
}

// --- Items ---

export async function listFirestoreCatalogItems(search = "") {
  const snapshot = await getFirestoreDb().collection("catalog_items").get();
  return snapshot.docs
    .map((doc) => asRow(doc.id, doc.data()))
    .filter((row) => matchesSearch(row, search, ["name", "sku", "supplier_sku"]))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

export async function getFirestoreCatalogItem(id: string) {
  const snap = await getFirestoreDb().collection("catalog_items").doc(id).get();
  if (!snap.exists) return null;
  return asRow(snap.id, snap.data());
}

export async function createFirestoreCatalogItem(payload: DocRow) {
  const id = randomUUID();
  const createdAt = nowIso();
  const row = { ...payload, created_at: createdAt, updated_at: createdAt };
  await getFirestoreDb().collection("catalog_items").doc(id).set(row);
  return asRow(id, row);
}

export async function upsertFirestoreCatalogItemById(id: string, payload: DocRow) {
  const ref = getFirestoreDb().collection("catalog_items").doc(id);
  const existing = await ref.get();
  const createdAt =
    typeof existing.data()?.created_at === "string" ? existing.data()?.created_at : nowIso();
  const row = { ...payload, created_at: createdAt, updated_at: nowIso() };
  await ref.set(row, { merge: true });
  const merged = { ...(existing.data() ?? {}), ...row };
  return asRow(id, merged);
}

export async function updateFirestoreCatalogItem(id: string, payload: DocRow) {
  const ref = getFirestoreDb().collection("catalog_items").doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;
  const row = { ...payload, updated_at: nowIso() };
  await ref.set(row, { merge: true });
  const merged = { ...existing.data(), ...row };
  return asRow(id, merged);
}

export async function deleteFirestoreCatalogItem(id: string) {
  const ref = getFirestoreDb().collection("catalog_items").doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;
  await ref.delete();

  const db = getFirestoreDb();
  const [variantsSnap, storageSnap] = await Promise.all([
    db.collection("catalog_variants").where("item_id", "==", id).get(),
    db.collection("item_storage_homes").where("item_id", "==", id).get(),
  ]);
  const batch = db.batch();
  variantsSnap.docs.forEach((doc) => batch.delete(doc.ref));
  storageSnap.docs.forEach((doc) => batch.delete(doc.ref));
  if (!variantsSnap.empty || !storageSnap.empty) await batch.commit();

  return asRow(id, existing.data());
}

// --- Variants ---

export async function listFirestoreCatalogVariants(filters: {
  itemId?: string;
  id?: string;
  search?: string;
  activeOnly?: boolean;
}) {
  const db = getFirestoreDb();

  if (filters.id) {
    const doc = await db.collection("catalog_variants").doc(filters.id).get();
    const rows = doc.exists ? [asRow(doc.id, doc.data())] : [];
    return rows.filter((row) => {
      if (filters.itemId && row.item_id !== filters.itemId) return false;
      if (filters.activeOnly && row.active === false) return false;
      if (normalizeVariantKey(String(row.id)) === "base") return false;
      return matchesSearch(row, filters.search ?? "", ["name", "sku", "supplier_sku"]);
    });
  }

  let query: FirebaseFirestore.Query = db.collection("catalog_variants");
  if (filters.itemId) query = query.where("item_id", "==", filters.itemId);
  const snapshot = await query.get();

  return snapshot.docs
    .map((doc) => asRow(doc.id, doc.data()))
    .filter((row) => {
      if (filters.activeOnly && row.active === false) return false;
      if (normalizeVariantKey(String(row.id)) === "base") return false;
      return matchesSearch(row, filters.search ?? "", ["name", "sku", "supplier_sku"]);
    });
}

export async function getFirestoreCatalogVariant(id: string) {
  const snap = await getFirestoreDb().collection("catalog_variants").doc(id).get();
  if (!snap.exists) return null;
  return asRow(snap.id, snap.data());
}

export async function createFirestoreCatalogVariant(id: string, payload: DocRow) {
  const createdAt = nowIso();
  const row = { ...payload, created_at: createdAt, updated_at: createdAt };
  await getFirestoreDb().collection("catalog_variants").doc(id).set(row);
  return asRow(id, row);
}

export async function updateFirestoreCatalogVariant(id: string, payload: DocRow) {
  const ref = getFirestoreDb().collection("catalog_variants").doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;
  const row = { ...payload, updated_at: nowIso() };
  await ref.set(row, { merge: true });
  const merged = { ...existing.data(), ...row };
  return asRow(id, merged);
}

export async function deleteFirestoreCatalogVariant(id: string) {
  const ref = getFirestoreDb().collection("catalog_variants").doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;
  await ref.delete();
  const itemId = String(existing.data()?.item_id ?? "");
  if (itemId) {
    await refreshFirestoreHasVariations(itemId);
    const storageSnap = await getFirestoreDb()
      .collection("item_storage_homes")
      .where("item_id", "==", itemId)
      .get();
    const batch = getFirestoreDb().batch();
    storageSnap.docs
      .filter((doc) => normalizeVariantKey(doc.data().normalized_variant_key ?? doc.data().variant_key) === id)
      .forEach((doc) => batch.delete(doc.ref));
    if (!storageSnap.empty) await batch.commit();
  }
  return asRow(id, existing.data());
}

export async function refreshFirestoreHasVariations(itemId: string) {
  const snapshot = await getFirestoreDb()
    .collection("catalog_variants")
    .where("item_id", "==", itemId)
    .where("active", "==", true)
    .get();
  const hasVariations = snapshot.docs.some((doc) => normalizeVariantKey(doc.id) !== "base");
  await getFirestoreDb().collection("catalog_items").doc(itemId).set(
    { has_variations: hasVariations, updated_at: nowIso() },
    { merge: true },
  );
}

// --- Storage homes ---

async function listFirestoreStorageHomeDocs(itemIds: string[]) {
  if (!itemIds.length) return [] as FirebaseFirestore.QueryDocumentSnapshot[];
  const db = getFirestoreDb();
  const uniqueIds = Array.from(new Set(itemIds.filter(Boolean)));
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let index = 0; index < uniqueIds.length; index += 30) {
    const chunk = uniqueIds.slice(index, index + 30);
    const snapshot = await db.collection("item_storage_homes").where("item_id", "in", chunk).get();
    docs.push(...snapshot.docs);
  }
  return docs;
}

export async function listFirestoreBaseStorageHomes(itemIds: string[]) {
  if (!itemIds.length) return [] as Array<{ item_id: string; storage_warehouse_id: string }>;
  const rows: Array<{ item_id: string; storage_warehouse_id: string }> = [];
  for (const doc of await listFirestoreStorageHomeDocs(itemIds)) {
    const data = doc.data();
    const itemId = String(data.item_id ?? "");
    const variantKey = normalizeVariantKey(data.normalized_variant_key ?? data.variant_key);
    if (variantKey !== "base") continue;
    if (typeof data.storage_warehouse_id === "string") {
      rows.push({ item_id: itemId, storage_warehouse_id: data.storage_warehouse_id });
    }
  }
  return rows;
}

export async function listFirestoreVariantStorageHomes(itemIds: string[]) {
  const byKey: Record<string, string[]> = {};
  for (const doc of await listFirestoreStorageHomeDocs(itemIds)) {
    const data = doc.data();
    const itemId = String(data.item_id ?? "");
    const variantKey = normalizeVariantKey(data.normalized_variant_key ?? data.variant_key);
    if (!variantKey || variantKey === "base" || typeof data.storage_warehouse_id !== "string") continue;
    const key = `${itemId}::${variantKey}`;
    const list = byKey[key] ?? [];
    if (!list.includes(data.storage_warehouse_id)) list.push(data.storage_warehouse_id);
    byKey[key] = list;
  }
  return byKey;
}

export async function syncFirestoreBaseStorageHomes(itemId: string, warehouseIds: string[]) {
  const db = getFirestoreDb();
  const uniqueIds = Array.from(new Set(warehouseIds.filter(Boolean)));
  const snapshot = await db.collection("item_storage_homes").where("item_id", "==", itemId).get();
  const existing = snapshot.docs.filter(
    (doc) => normalizeVariantKey(doc.data().normalized_variant_key ?? doc.data().variant_key) === "base",
  );

  const batch = db.batch();
  const keep = new Set(uniqueIds);
  for (const doc of existing) {
    const warehouseId = doc.data().storage_warehouse_id;
    if (!keep.has(warehouseId)) batch.delete(doc.ref);
  }
  for (const warehouseId of uniqueIds) {
    const docId = `${itemId}_base_${warehouseId}`;
    batch.set(db.collection("item_storage_homes").doc(docId), {
      item_id: itemId,
      variant_key: "base",
      normalized_variant_key: "base",
      storage_warehouse_id: warehouseId,
      updated_at: nowIso(),
    });
  }
  await batch.commit();
}

export async function syncFirestoreVariantStorageHomes(itemId: string, variantKey: string, warehouseIds: string[]) {
  const db = getFirestoreDb();
  const normalizedKey = normalizeVariantKey(variantKey);
  const uniqueIds = Array.from(new Set(warehouseIds.filter(Boolean)));
  const snapshot = await db.collection("item_storage_homes").where("item_id", "==", itemId).get();
  const existing = snapshot.docs.filter(
    (doc) => normalizeVariantKey(doc.data().normalized_variant_key ?? doc.data().variant_key) === normalizedKey,
  );

  const batch = db.batch();
  const keep = new Set(uniqueIds);
  for (const doc of existing) {
    const warehouseId = doc.data().storage_warehouse_id;
    if (!keep.has(warehouseId)) batch.delete(doc.ref);
  }
  for (const warehouseId of uniqueIds) {
    const docId = `${itemId}_${normalizedKey}_${warehouseId}`;
    batch.set(db.collection("item_storage_homes").doc(docId), {
      item_id: itemId,
      variant_key: normalizedKey,
      normalized_variant_key: normalizedKey,
      storage_warehouse_id: warehouseId,
      updated_at: nowIso(),
    });
  }
  await batch.commit();
}

function enrichItemWithStorage(
  item: DocRow,
  storageHomeIdsByItem: Record<string, string[]>,
): DocRow {
  const itemId = String(item.id ?? "");
  const defaultWarehouseId = typeof item.default_warehouse_id === "string" ? item.default_warehouse_id : null;
  const storageHomeIds = storageHomeIdsByItem[itemId] ?? [];
  const resolvedStorageHomeIds = buildStorageHomeIds(defaultWarehouseId, storageHomeIds);
  return {
    ...item,
    storage_home_id: resolvedStorageHomeIds[0] ?? null,
    storage_home_ids: resolvedStorageHomeIds,
    has_recipe: Boolean(item.has_recipe),
  };
}

export async function enrichFirestoreItems(items: DocRow[]) {
  const itemIds = items.map((item) => String(item.id ?? "")).filter(Boolean);
  const storageRows = await listFirestoreBaseStorageHomes(itemIds);
  const storageHomeIdsByItem: Record<string, string[]> = {};
  for (const row of storageRows) {
    const list = storageHomeIdsByItem[row.item_id] ?? [];
    if (!list.includes(row.storage_warehouse_id)) list.push(row.storage_warehouse_id);
    storageHomeIdsByItem[row.item_id] = list;
  }
  return items.map((item) => enrichItemWithStorage(item, storageHomeIdsByItem));
}

export async function enrichFirestoreVariants(variants: DocRow[]): Promise<DocRow[]> {
  const itemIds = Array.from(new Set(variants.map((variant) => String(variant.item_id ?? "")).filter(Boolean)));
  const storageByKey = await listFirestoreVariantStorageHomes(itemIds);
  return variants.map((variant) => {
    const normalizedKey = normalizeVariantKey(String(variant.id));
    const storageKey = `${variant.item_id}::${normalizedKey}`;
    const storageHomeIds = storageByKey[storageKey] ?? [];
    const defaultWarehouseId =
      typeof variant.default_warehouse_id === "string" ? variant.default_warehouse_id : null;
    const resolvedStorageHomeIds = buildStorageHomeIds(defaultWarehouseId, storageHomeIds);
    return {
      ...variant,
      storage_home_id: resolvedStorageHomeIds[0] ?? null,
      storage_home_ids: resolvedStorageHomeIds,
      has_recipe: false,
    };
  });
}
