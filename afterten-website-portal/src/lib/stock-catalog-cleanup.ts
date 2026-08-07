import { getFirestoreDb } from "@/lib/firebase-server";
import {
  fetchStockCatalog,
  fetchStockQuantities,
  type StockApiCatalogResponse,
} from "@/lib/stock-api-client";
import { isPortalOnlyCatalogItem } from "@/lib/catalog-api-sync-matching";

export type StockCatalogCleanupPlan = {
  generated_at: string;
  catalog_generated_at: string | null;
  stock_generated_at: string | null;
  source: {
    catalog_api_products: number;
    stock_api_uuids: number;
  };
  summary: {
    items_to_keep: number;
    variants_to_keep: number;
    items_to_delete: number;
    variants_to_delete: number;
    orphan_allowlist_rows: number;
    orphan_order_catalog_rows: number;
    orphan_storage_homes: number;
    orphan_pos_item_map_rows: number;
    orphan_order_route_rows: number;
    active_missing_from_catalog_api: number;
    active_missing_from_stock_api: number;
  };
  items_to_delete: Array<{ id: string; name: string; reason: string }>;
  variants_to_delete: Array<{ id: string; item_id: string; name: string; reason: string }>;
  active_missing_from_stock_api: Array<{
    kind: "product" | "variant";
    catalog_id: string;
    name: string;
  }>;
  stock_api_rows_without_uuid: Array<{
    name: string;
    qty: number;
    warehouse_name: string;
  }>;
};

type CleanupOptions = {
  dryRun?: boolean;
  refreshOutletCatalogs?: boolean;
  catalogPayload?: StockApiCatalogResponse;
};

type CleanupPlanOptions = {
  catalogPayload?: StockApiCatalogResponse;
};

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function deleteDocs(paths: string[]): Promise<number> {
  if (!paths.length) return 0;
  const db = getFirestoreDb();
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

export async function planStockCatalogCleanup(
  options: CleanupPlanOptions = {},
): Promise<StockCatalogCleanupPlan> {
  const [catalogPayload, stockPayload, itemsSnap, variantsSnap] = await Promise.all([
    options.catalogPayload ? Promise.resolve(options.catalogPayload) : fetchStockCatalog(),
    fetchStockQuantities(),
    getFirestoreDb().collection("catalog_items").get(),
    getFirestoreDb().collection("catalog_variants").get(),
  ]);

  const apiUuids = new Set(
    (catalogPayload.products ?? [])
      .map((product) => String(product.uuid ?? "").trim())
      .filter(Boolean),
  );

  function linkedToApi(docId: string, stockApiUuid: unknown): boolean {
    if (apiUuids.has(docId)) return true;
    const linkedUuid = String(stockApiUuid ?? "").trim();
    return Boolean(linkedUuid && apiUuids.has(linkedUuid));
  }

  const stockUuids = new Set<string>();
  for (const warehouse of stockPayload.warehouses ?? []) {
    for (const item of warehouse.items ?? []) {
      const uuid = String(item.uuid ?? "").trim();
      if (uuid) stockUuids.add(uuid);
    }
  }

  const variantsByItem = new Map<string, Array<{ id: string; name: string; active: boolean }>>();
  for (const doc of variantsSnap.docs) {
    const itemId = String(doc.get("item_id") ?? "").trim();
    if (!itemId) continue;
    const list = variantsByItem.get(itemId) ?? [];
    list.push({
      id: doc.id,
      name: String(doc.get("name") ?? "Variant"),
      active: doc.get("active") !== false,
    });
    variantsByItem.set(itemId, list);
  }

  const itemsToDelete: StockCatalogCleanupPlan["items_to_delete"] = [];
  const variantsToDelete: StockCatalogCleanupPlan["variants_to_delete"] = [];
  const keptItemIds = new Set<string>();
  const keptVariantIds = new Set<string>();
  const activeMissingFromStock: StockCatalogCleanupPlan["active_missing_from_stock_api"] = [];

  const itemsById = new Map(itemsSnap.docs.map((doc) => [doc.id, doc]));

  for (const doc of variantsSnap.docs) {
    const itemId = String(doc.get("item_id") ?? "");
    const parent = itemId ? itemsById.get(itemId) : undefined;
    if (parent && isPortalOnlyCatalogItem({ ...parent.data(), id: parent.id })) {
      keptVariantIds.add(doc.id);
      continue;
    }
    if (linkedToApi(doc.id, doc.get("stock_api_uuid"))) {
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
    if (isPortalOnlyCatalogItem({ ...doc.data(), id: itemId })) {
      keptItemIds.add(itemId);
      continue;
    }
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

    if (linkedToApi(itemId, doc.get("stock_api_uuid"))) {
      keptItemIds.add(itemId);
      continue;
    }

    itemsToDelete.push({ id: itemId, name, reason: "uuid_not_in_catalog_api" });
  }

  for (const itemId of keptItemIds) {
    const variants = variantsByItem.get(itemId) ?? [];
    if (variants.length > 0) continue;
    if (!stockUuids.has(itemId)) {
      activeMissingFromStock.push({
        kind: "product",
        catalog_id: itemId,
        name: String(itemsSnap.docs.find((doc) => doc.id === itemId)?.get("name") ?? "Item"),
      });
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

  const [
    allowlistSnap,
    orderCatalogSnap,
    storageSnap,
    posMapSnap,
    orderRoutesSnap,
  ] = await Promise.all([
    getFirestoreDb().collection("outlet_catalog_allowlist").get(),
    getFirestoreDb().collection("outlet_order_catalog").get(),
    getFirestoreDb().collection("item_storage_homes").get(),
    getFirestoreDb().collection("pos_item_map").get(),
    getFirestoreDb().collection("outlet_order_routes").get(),
  ]);

  let orphanAllowlist = 0;
  for (const doc of allowlistSnap.docs) {
    const itemId = String(doc.get("item_id") ?? "");
    const variantId = doc.get("variant_id") ? String(doc.get("variant_id")) : null;
    if (deleteItemIds.has(itemId) || (variantId && deleteVariantIds.has(variantId))) {
      orphanAllowlist += 1;
    }
  }

  let orphanOrderCatalog = 0;
  for (const doc of orderCatalogSnap.docs) {
    const productId = String(doc.get("productId") ?? doc.get("product_id") ?? "");
    const variantId = doc.get("variantId") ?? doc.get("variant_id");
    const variantKey = variantId ? String(variantId) : null;
    if (deleteItemIds.has(productId) || (variantKey && deleteVariantIds.has(variantKey))) {
      orphanOrderCatalog += 1;
    }
  }

  let orphanStorage = 0;
  for (const doc of storageSnap.docs) {
    const itemId = String(doc.get("item_id") ?? "");
    if (deleteItemIds.has(itemId)) orphanStorage += 1;
  }

  let orphanPosMap = 0;
  for (const doc of posMapSnap.docs) {
    const itemId = String(doc.get("catalog_item_id") ?? doc.get("item_id") ?? "");
    const variantId = doc.get("catalog_variant_id") ?? doc.get("variant_id");
    if (deleteItemIds.has(itemId) || (variantId && deleteVariantIds.has(String(variantId)))) {
      orphanPosMap += 1;
    }
  }

  let orphanRoutes = 0;
  for (const doc of orderRoutesSnap.docs) {
    const itemId = String(doc.get("itemId") ?? doc.get("item_id") ?? "");
    const variantKey = String(doc.get("variantKey") ?? doc.get("variant_key") ?? "");
    if (deleteItemIds.has(itemId) || (variantKey && variantKey !== "base" && deleteVariantIds.has(variantKey))) {
      orphanRoutes += 1;
    }
  }

  const stockWithoutUuid: StockCatalogCleanupPlan["stock_api_rows_without_uuid"] = [];
  const seen = new Set<string>();
  for (const warehouse of stockPayload.warehouses ?? []) {
    for (const item of warehouse.items ?? []) {
      if (String(item.uuid ?? "").trim()) continue;
      const key = `${warehouse.warehouseName}::${item.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stockWithoutUuid.push({
        name: String(item.name ?? "Unnamed"),
        qty: Number(item.qty ?? 0),
        warehouse_name: warehouse.warehouseName,
      });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    catalog_generated_at: catalogPayload.generatedAt ?? null,
    stock_generated_at: stockPayload.generatedAt ?? null,
    source: {
      catalog_api_products: apiUuids.size,
      stock_api_uuids: stockUuids.size,
    },
    summary: {
      items_to_keep: keptItemIds.size,
      variants_to_keep: keptVariantIds.size,
      items_to_delete: itemsToDelete.length,
      variants_to_delete: variantsToDelete.length,
      orphan_allowlist_rows: orphanAllowlist,
      orphan_order_catalog_rows: orphanOrderCatalog,
      orphan_storage_homes: orphanStorage,
      orphan_pos_item_map_rows: orphanPosMap,
      orphan_order_route_rows: orphanRoutes,
      active_missing_from_catalog_api: 0,
      active_missing_from_stock_api: activeMissingFromStock.length,
    },
    items_to_delete: itemsToDelete.sort((a, b) => a.name.localeCompare(b.name)),
    variants_to_delete: variantsToDelete.sort((a, b) => a.name.localeCompare(b.name)),
    active_missing_from_stock_api: activeMissingFromStock.sort((a, b) => a.name.localeCompare(b.name)),
    stock_api_rows_without_uuid: stockWithoutUuid,
  };
}

async function collectOrphanDocPaths(plan: StockCatalogCleanupPlan): Promise<string[]> {
  const deleteItemIds = new Set(plan.items_to_delete.map((row) => row.id));
  const deleteVariantIds = new Set(plan.variants_to_delete.map((row) => row.id));
  const paths: string[] = [];

  const [
    allowlistSnap,
    orderCatalogSnap,
    storageSnap,
    posMapSnap,
    orderRoutesSnap,
    bindingsSnap,
  ] = await Promise.all([
    getFirestoreDb().collection("outlet_catalog_allowlist").get(),
    getFirestoreDb().collection("outlet_order_catalog").get(),
    getFirestoreDb().collection("item_storage_homes").get(),
    getFirestoreDb().collection("pos_item_map").get(),
    getFirestoreDb().collection("outlet_order_routes").get(),
    getFirestoreDb().collection("outlet_catalog_bindings").get(),
  ]);

  for (const doc of allowlistSnap.docs) {
    const itemId = String(doc.get("item_id") ?? "");
    const variantId = doc.get("variant_id") ? String(doc.get("variant_id")) : null;
    if (deleteItemIds.has(itemId) || (variantId && deleteVariantIds.has(variantId))) {
      paths.push(`outlet_catalog_allowlist/${doc.id}`);
    }
  }

  for (const doc of orderCatalogSnap.docs) {
    const productId = String(doc.get("productId") ?? doc.get("product_id") ?? "");
    const variantId = doc.get("variantId") ?? doc.get("variant_id");
    const variantKey = variantId ? String(variantId) : null;
    if (deleteItemIds.has(productId) || (variantKey && deleteVariantIds.has(variantKey))) {
      paths.push(`outlet_order_catalog/${doc.id}`);
    }
  }

  for (const doc of storageSnap.docs) {
    const itemId = String(doc.get("item_id") ?? "");
    if (deleteItemIds.has(itemId)) paths.push(`item_storage_homes/${doc.id}`);
  }

  for (const doc of posMapSnap.docs) {
    const itemId = String(doc.get("catalog_item_id") ?? doc.get("item_id") ?? "");
    const variantId = doc.get("catalog_variant_id") ?? doc.get("variant_id");
    if (deleteItemIds.has(itemId) || (variantId && deleteVariantIds.has(String(variantId)))) {
      paths.push(`pos_item_map/${doc.id}`);
    }
  }

  for (const doc of orderRoutesSnap.docs) {
    const itemId = String(doc.get("itemId") ?? doc.get("item_id") ?? "");
    const variantKey = String(doc.get("variantKey") ?? doc.get("variant_key") ?? "");
    if (deleteItemIds.has(itemId) || (variantKey && variantKey !== "base" && deleteVariantIds.has(variantKey))) {
      paths.push(`outlet_order_routes/${doc.id}`);
    }
  }

  for (const doc of bindingsSnap.docs) {
    const itemId = String(doc.get("catalogItemId") ?? doc.get("catalog_item_id") ?? "");
    const variantId = doc.get("catalogVariantId") ?? doc.get("catalog_variant_id");
    if (deleteItemIds.has(itemId) || (variantId && deleteVariantIds.has(String(variantId)))) {
      paths.push(`outlet_catalog_bindings/${doc.id}`);
    }
  }

  for (const variantId of deleteVariantIds) {
    paths.push(`catalog_variants/${variantId}`);
  }
  for (const itemId of deleteItemIds) {
    paths.push(`catalog_items/${itemId}`);
  }

  return paths;
}

export async function runStockCatalogCleanup(options: CleanupOptions = {}) {
  const dryRun = options.dryRun !== false;
  const plan = await planStockCatalogCleanup({ catalogPayload: options.catalogPayload });

  if (dryRun) {
    return { dry_run: true, plan };
  }

  const paths = await collectOrphanDocPaths(plan);
  const deleted_docs = await deleteDocs(paths);

  if (options.refreshOutletCatalogs !== false) {
    const { refreshAllOutletOrderCatalogsFromAllowlist } = await import(
      "@/lib/firestore-outlet-catalog-access"
    );
    await refreshAllOutletOrderCatalogsFromAllowlist();
  }

  await getFirestoreDb().collection("stock_catalog_cleanup_state").doc("latest").set(
    {
      ...plan,
      applied_at: new Date().toISOString(),
      deleted_docs,
    },
    { merge: true },
  );

  return { dry_run: false, plan, deleted_docs };
}
