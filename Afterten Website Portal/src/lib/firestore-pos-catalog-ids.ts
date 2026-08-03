import { getFirestoreDb } from "@/lib/firebase-server";
import {
  POS_NUMERIC_SKU_MAX,
  assertAllocatablePosSku,
  firstMissingPosMenuGroupId,
  maxPosNumericSku,
  nextAllocatablePosSku,
  parsePosNumericSku,
  parsePosVariantMintSku,
} from "@/lib/pos-catalog-ids";

async function fetchAllSkus(collection: "catalog_items" | "catalog_variants"): Promise<string[]> {
  const snapshot = await getFirestoreDb().collection(collection).select("sku").get();
  return snapshot.docs.map((doc) => {
    const sku = doc.data().sku;
    return typeof sku === "string" ? sku : "";
  });
}

async function fetchSiblingVariantSkus(itemId: string, excludeVariantId?: string | null): Promise<string[]> {
  const snapshot = await getFirestoreDb().collection("catalog_variants").where("item_id", "==", itemId).get();
  return snapshot.docs
    .filter((doc) => !excludeVariantId || doc.id !== excludeVariantId)
    .map((doc) => {
      const sku = doc.data().sku;
      return typeof sku === "string" ? sku : "";
    });
}

async function skuExists(collection: "catalog_items" | "catalog_variants", sku: string): Promise<boolean> {
  const normalized = sku.trim().toLowerCase();
  const snapshot = await getFirestoreDb().collection(collection).get();
  return snapshot.docs.some((doc) => {
    const value = doc.data().sku;
    return typeof value === "string" && value.trim().toLowerCase() === normalized;
  });
}

export async function nextFirestorePosItemSku(): Promise<string> {
  const rows = (await fetchAllSkus("catalog_items")).map((sku) => ({ sku }));
  return assertAllocatablePosSku(nextAllocatablePosSku(maxPosNumericSku(rows)));
}

export async function nextFirestorePosVariantSku(): Promise<string> {
  const rows = (await fetchAllSkus("catalog_variants")).map((sku) => ({ sku }));
  return assertAllocatablePosSku(nextAllocatablePosSku(maxPosNumericSku(rows)));
}

export async function nextFirestorePosMenuGroupId(): Promise<number> {
  const snapshot = await getFirestoreDb().collection("catalog_menu_groups").get();
  const rows = snapshot.docs.map((doc) => ({ pos_menu_group_id: doc.data().pos_menu_group_id }));
  return firstMissingPosMenuGroupId(rows);
}

export async function findFirestoreSiblingVariantSkuConflict(
  itemId: string,
  sku: string,
  excludeVariantId?: string | null,
): Promise<boolean> {
  const normalized = sku.trim().toLowerCase();
  if (!normalized) return false;
  const siblings = await fetchSiblingVariantSkus(itemId, excludeVariantId);
  return siblings.some((value) => value.trim().toLowerCase() === normalized);
}

export async function nextFirestorePosVariantSkuForItem(
  itemId: string,
  excludeVariantId?: string | null,
): Promise<string> {
  const siblings = await fetchSiblingVariantSkus(itemId, excludeVariantId);
  const siblingNums = siblings
    .map((sku) => parsePosNumericSku(sku))
    .filter((value): value is number => value !== null);

  let candidate =
    siblingNums.length > 0
      ? nextAllocatablePosSku(Math.max(...siblingNums))
      : Number(await nextFirestorePosVariantSku());

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const sku = assertAllocatablePosSku(candidate);
    if (await findFirestoreSiblingVariantSkuConflict(itemId, sku, excludeVariantId)) {
      candidate = nextAllocatablePosSku(candidate);
      continue;
    }
    if (!(await skuExists("catalog_variants", sku))) return sku;
    candidate = nextAllocatablePosSku(candidate);
  }

  throw new Error(`Unable to allocate a unique POS variant SKU for this product (max ${POS_NUMERIC_SKU_MAX})`);
}

export async function allocateFirestorePosItemSku(preferred?: string | null): Promise<string> {
  const trimmed = preferred?.trim();
  if (trimmed) {
    if (!parsePosNumericSku(trimmed)) {
      throw new Error(`SKU must be a 1-3 digit numeric MintPOS ID (1-${POS_NUMERIC_SKU_MAX})`);
    }
    if (!(await skuExists("catalog_items", trimmed))) return trimmed;
  }

  let candidate = await nextFirestorePosItemSku();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!(await skuExists("catalog_items", candidate))) return candidate;
    candidate = assertAllocatablePosSku(nextAllocatablePosSku(Number(candidate)));
  }
  throw new Error(`Unable to allocate a unique POS item SKU (max ${POS_NUMERIC_SKU_MAX})`);
}

export async function allocateFirestorePosVariantSku(
  preferred?: string | null,
  itemId?: string | null,
  excludeVariantId?: string | null,
): Promise<string> {
  const trimmed = preferred?.trim();
  if (trimmed) {
    if (!parsePosVariantMintSku(trimmed)) {
      throw new Error(
        `Variant SKU must be a numeric MintPOS ID (1-${POS_NUMERIC_SKU_MAX}) or till barcode (4-20 digits)`,
      );
    }
    if (itemId && (await findFirestoreSiblingVariantSkuConflict(itemId, trimmed, excludeVariantId))) {
      throw new Error("Variant SKU is already used by another variant on this product");
    }
    return trimmed;
  }

  if (itemId) {
    return nextFirestorePosVariantSkuForItem(itemId, excludeVariantId);
  }

  let candidate = await nextFirestorePosVariantSku();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!(await skuExists("catalog_variants", candidate))) return candidate;
    candidate = assertAllocatablePosSku(nextAllocatablePosSku(Number(candidate)));
  }
  throw new Error(`Unable to allocate a unique POS variant SKU (max ${POS_NUMERIC_SKU_MAX})`);
}
