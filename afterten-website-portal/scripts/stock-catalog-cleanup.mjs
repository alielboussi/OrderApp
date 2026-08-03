import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DEFAULT_STOCK_CATALOG_API_URL =
  "https://afterten-stock-api-896827614552.us-central1.run.app/sync/catalog";
const DEFAULT_STOCK_SYNC_API_URL =
  "https://afterten-stock-api-896827614552.us-central1.run.app/sync/stock";

const apply = process.argv.includes("--apply");
const token = process.env.STOCK_SYNC_API_TOKEN?.trim();
if (!token) {
  console.error("STOCK_SYNC_API_TOKEN is required");
  process.exit(1);
}

const credentialsPath =
  process.env.FIREBASE_CREDENTIALS_PATH ?? "C:\\Projects\\Afterten\\secrets\\afterten-firebase-adminsdk.json";

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(readFileSync(credentialsPath, "utf8"))),
    projectId: process.env.FIREBASE_PROJECT_ID ?? "afterten-portal-system",
  });
}

const db = getFirestore();

function chunk(values, size) {
  const groups = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function deleteDocPaths(paths) {
  let deleted = 0;
  for (const group of chunk(paths, 400)) {
    const batch = db.batch();
    for (const path of group) {
      const slash = path.indexOf("/");
      if (slash < 0) continue;
      batch.delete(db.collection(path.slice(0, slash)).doc(path.slice(slash + 1)));
    }
    await batch.commit();
    deleted += group.length;
  }
  return deleted;
}

const [catalogPayload, stockPayload, itemsSnap, variantsSnap] = await Promise.all([
  fetchJson(process.env.STOCK_CATALOG_SYNC_API_URL?.trim() || DEFAULT_STOCK_CATALOG_API_URL),
  fetchJson(process.env.STOCK_SYNC_API_URL?.trim() || DEFAULT_STOCK_SYNC_API_URL),
  db.collection("catalog_items").get(),
  db.collection("catalog_variants").get(),
]);

const apiUuids = new Set(
  (catalogPayload.products ?? []).map((product) => String(product.uuid ?? "").trim()).filter(Boolean),
);
const stockUuids = new Set();
for (const warehouse of stockPayload.warehouses ?? []) {
  for (const item of warehouse.items ?? []) {
    const uuid = String(item.uuid ?? "").trim();
    if (uuid) stockUuids.add(uuid);
  }
}

const variantsByItem = new Map();
for (const doc of variantsSnap.docs) {
  const itemId = String(doc.get("item_id") ?? "").trim();
  if (!itemId) continue;
  const list = variantsByItem.get(itemId) ?? [];
  list.push({ id: doc.id, name: String(doc.get("name") ?? "Variant") });
  variantsByItem.set(itemId, list);
}

const itemsToDelete = [];
const variantsToDelete = [];
const keptItemIds = new Set();
const keptVariantIds = new Set();
const activeMissingFromStock = [];

for (const doc of variantsSnap.docs) {
  if (apiUuids.has(doc.id)) {
    keptVariantIds.add(doc.id);
    continue;
  }
  variantsToDelete.push({
    id: doc.id,
    item_id: String(doc.get("item_id") ?? ""),
    name: String(doc.get("name") ?? "Variant"),
    reason: "uuid_not_in_catalog_api",
  });
}

for (const doc of itemsSnap.docs) {
  const itemId = doc.id;
  const name = String(doc.get("name") ?? "Item");
  const variants = variantsByItem.get(itemId) ?? [];
  const keptVariants = variants.filter((variant) => keptVariantIds.has(variant.id));

  if (variants.length > 0) {
    if (keptVariants.length === 0) {
      itemsToDelete.push({ id: itemId, name, reason: "parent_without_catalog_api_variants" });
      continue;
    }
    keptItemIds.add(itemId);
    continue;
  }

  if (apiUuids.has(itemId)) {
    keptItemIds.add(itemId);
    continue;
  }

  itemsToDelete.push({ id: itemId, name, reason: "uuid_not_in_catalog_api" });
}

for (const itemId of keptItemIds) {
  const variants = variantsByItem.get(itemId) ?? [];
  if (variants.length > 0) continue;
  if (!stockUuids.has(itemId)) {
    const doc = itemsSnap.docs.find((row) => row.id === itemId);
    activeMissingFromStock.push({ kind: "product", catalog_id: itemId, name: String(doc?.get("name") ?? "Item") });
  }
}
for (const variantId of keptVariantIds) {
  if (stockUuids.has(variantId)) continue;
  const doc = variantsSnap.docs.find((row) => row.id === variantId);
  activeMissingFromStock.push({
    kind: "variant",
    catalog_id: variantId,
    name: String(doc?.get("name") ?? "Variant"),
  });
}

const deleteItemIds = new Set(itemsToDelete.map((row) => row.id));
const deleteVariantIds = new Set(variantsToDelete.map((row) => row.id));

const orphanPaths = [];
const relatedSnaps = await Promise.all([
  db.collection("outlet_catalog_allowlist").get(),
  db.collection("outlet_order_catalog").get(),
  db.collection("item_storage_homes").get(),
  db.collection("pos_item_map").get(),
  db.collection("outlet_order_routes").get(),
  db.collection("outlet_catalog_bindings").get(),
]);

for (const doc of relatedSnaps[0].docs) {
  const itemId = String(doc.get("item_id") ?? "");
  const variantId = doc.get("variant_id") ? String(doc.get("variant_id")) : null;
  if (deleteItemIds.has(itemId) || (variantId && deleteVariantIds.has(variantId))) {
    orphanPaths.push(`outlet_catalog_allowlist/${doc.id}`);
  }
}
for (const doc of relatedSnaps[1].docs) {
  const productId = String(doc.get("productId") ?? doc.get("product_id") ?? "");
  const variantId = doc.get("variantId") ?? doc.get("variant_id");
  const variantKey = variantId ? String(variantId) : null;
  if (deleteItemIds.has(productId) || (variantKey && deleteVariantIds.has(variantKey))) {
    orphanPaths.push(`outlet_order_catalog/${doc.id}`);
  }
}
for (const doc of relatedSnaps[2].docs) {
  if (deleteItemIds.has(String(doc.get("item_id") ?? ""))) orphanPaths.push(`item_storage_homes/${doc.id}`);
}
for (const doc of relatedSnaps[3].docs) {
  const itemId = String(doc.get("catalog_item_id") ?? doc.get("item_id") ?? "");
  const variantId = doc.get("catalog_variant_id") ?? doc.get("variant_id");
  if (deleteItemIds.has(itemId) || (variantId && deleteVariantIds.has(String(variantId)))) {
    orphanPaths.push(`pos_item_map/${doc.id}`);
  }
}
for (const doc of relatedSnaps[4].docs) {
  const itemId = String(doc.get("itemId") ?? doc.get("item_id") ?? "");
  const variantKey = String(doc.get("variantKey") ?? doc.get("variant_key") ?? "");
  if (deleteItemIds.has(itemId) || (variantKey && variantKey !== "base" && deleteVariantIds.has(variantKey))) {
    orphanPaths.push(`outlet_order_routes/${doc.id}`);
  }
}
for (const doc of relatedSnaps[5].docs) {
  const itemId = String(doc.get("catalogItemId") ?? doc.get("catalog_item_id") ?? "");
  const variantId = doc.get("catalogVariantId") ?? doc.get("catalog_variant_id");
  if (deleteItemIds.has(itemId) || (variantId && deleteVariantIds.has(String(variantId)))) {
    orphanPaths.push(`outlet_catalog_bindings/${doc.id}`);
  }
}

for (const variantId of deleteVariantIds) orphanPaths.push(`catalog_variants/${variantId}`);
for (const itemId of deleteItemIds) orphanPaths.push(`catalog_items/${itemId}`);

const plan = {
  dry_run: !apply,
  generated_at: new Date().toISOString(),
  catalog_generated_at: catalogPayload.generatedAt ?? null,
  stock_generated_at: stockPayload.generatedAt ?? null,
  summary: {
    catalog_api_products: apiUuids.size,
    stock_api_uuids: stockUuids.size,
    items_to_keep: keptItemIds.size,
    variants_to_keep: keptVariantIds.size,
    items_to_delete: itemsToDelete.length,
    variants_to_delete: variantsToDelete.length,
    related_docs_to_delete: orphanPaths.length,
    active_missing_from_stock_api: activeMissingFromStock.length,
  },
  items_to_delete: itemsToDelete.sort((a, b) => a.name.localeCompare(b.name)),
  variants_to_delete: variantsToDelete.sort((a, b) => a.name.localeCompare(b.name)),
  active_missing_from_stock_api: activeMissingFromStock.sort((a, b) => a.name.localeCompare(b.name)),
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  console.error("\nDry run only. Re-run with --apply to delete legacy rows.");
  process.exit(0);
}

const deleted_docs = await deleteDocPaths(orphanPaths);

for (const itemId of keptItemIds) {
  const activeVariants = await db
    .collection("catalog_variants")
    .where("item_id", "==", itemId)
    .where("active", "==", true)
    .get();
  const hasVariations = activeVariants.docs.some((doc) => doc.id !== "base");
  await db.collection("catalog_items").doc(itemId).set(
    { has_variations: hasVariations, updated_at: new Date().toISOString() },
    { merge: true },
  );
}

await db.collection("stock_catalog_cleanup_state").doc("latest").set(
  { ...plan, dry_run: false, applied_at: new Date().toISOString(), deleted_docs },
  { merge: true },
);

console.log(JSON.stringify({ ...plan, dry_run: false, deleted_docs }, null, 2));
