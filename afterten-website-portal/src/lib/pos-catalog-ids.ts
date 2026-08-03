import type { SupabaseClient } from "@supabase/supabase-js";

/** MintPOS MenuItem.Code / ModifierFlavour.Name2 use 1-3 digit numeric IDs. */
export const POS_NUMERIC_SKU_MAX = 999;

export function parsePosNumericSku(sku: string | null | undefined): number | null {
  if (!sku) return null;
  const trimmed = sku.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 1 || value > POS_NUMERIC_SKU_MAX) return null;
  return value;
}

/**
 * ModifierFlavour.Name2 on the till — usually 1–999, but alcohol/barcode lines use longer numeric codes.
 */
export function parsePosVariantMintSku(sku: string | null | undefined): string | null {
  if (!sku) return null;
  const trimmed = sku.trim();
  if (parsePosNumericSku(trimmed) !== null) return trimmed;
  if (/^\d{4,20}$/.test(trimmed)) return trimmed;
  return null;
}

export function isValidPosVariantMintSku(sku: string | null | undefined): boolean {
  return parsePosVariantMintSku(sku) !== null;
}

export function assertAllocatablePosSku(value: number): string {
  if (!parsePosNumericSku(String(value))) {
    throw new Error(`No available MintPOS SKU IDs left (max ${POS_NUMERIC_SKU_MAX})`);
  }
  return String(value);
}

export function nextAllocatablePosSku(currentMax: number): number {
  const next = currentMax + 1;
  if (!parsePosNumericSku(String(next))) {
    throw new Error(`No available MintPOS SKU IDs left (max ${POS_NUMERIC_SKU_MAX})`);
  }
  return next;
}

export function maxPosNumericSku(rows: Array<{ sku?: string | null }> | null | undefined): number {
  let max = 0;
  for (const row of rows ?? []) {
    const parsed = parsePosNumericSku(row.sku ?? null);
    if (parsed !== null && parsed > max) max = parsed;
  }
  return max;
}

function firstMissingPosMenuGroupId(
  rows: Array<{ pos_menu_group_id?: number | null }> | null | undefined
): number {
  const used = new Set<number>();
  for (const row of rows ?? []) {
    const id = row.pos_menu_group_id;
    if (typeof id === "number" && Number.isFinite(id) && id > 0) used.add(id);
  }
  let candidate = 1;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

async function fetchAllSkuRows(
  supabase: SupabaseClient,
  table: "catalog_items" | "catalog_variants"
): Promise<Array<{ sku?: string | null }>> {
  const rows: Array<{ sku?: string | null }> = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase.from(table).select("sku").range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export async function nextPosItemSku(supabase: SupabaseClient): Promise<string> {
  const data = await fetchAllSkuRows(supabase, "catalog_items");
  return assertAllocatablePosSku(nextAllocatablePosSku(maxPosNumericSku(data)));
}

export async function nextPosVariantSku(supabase: SupabaseClient): Promise<string> {
  const data = await fetchAllSkuRows(supabase, "catalog_variants");
  return assertAllocatablePosSku(nextAllocatablePosSku(maxPosNumericSku(data)));
}

async function fetchSiblingVariantSkuRows(
  supabase: SupabaseClient,
  itemId: string,
  excludeVariantId?: string | null
): Promise<Array<{ id?: string; sku?: string | null }>> {
  const { data, error } = await supabase.from("catalog_variants").select("id,sku").eq("item_id", itemId);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).filter((row) => {
    if (!excludeVariantId) return true;
    return row.id !== excludeVariantId;
  });
}

export async function findSiblingVariantSkuConflict(
  supabase: SupabaseClient,
  itemId: string,
  sku: string,
  excludeVariantId?: string | null
): Promise<boolean> {
  const normalized = sku.trim().toLowerCase();
  if (!normalized) return false;
  const siblings = await fetchSiblingVariantSkuRows(supabase, itemId, excludeVariantId);
  return siblings.some((row) => (row.sku ?? "").trim().toLowerCase() === normalized);
}

/** Next numeric MintPOS variant SKU for a product's existing variant list. */
export async function nextPosVariantSkuForItem(
  supabase: SupabaseClient,
  itemId: string,
  excludeVariantId?: string | null
): Promise<string> {
  const siblings = await fetchSiblingVariantSkuRows(supabase, itemId, excludeVariantId);
  const siblingNums = siblings
    .map((row) => parsePosNumericSku(row.sku ?? null))
    .filter((value): value is number => value !== null);

  let candidate =
    siblingNums.length > 0
      ? nextAllocatablePosSku(Math.max(...siblingNums))
      : Number(await nextPosVariantSku(supabase));

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const sku = assertAllocatablePosSku(candidate);
    if (await findSiblingVariantSkuConflict(supabase, itemId, sku, excludeVariantId)) {
      candidate = nextAllocatablePosSku(candidate);
      continue;
    }

    const { data, error } = await supabase
      .from("catalog_variants")
      .select("id")
      .ilike("sku", sku)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.id === excludeVariantId) return sku;
    candidate = nextAllocatablePosSku(candidate);
  }

  throw new Error(`Unable to allocate a unique POS variant SKU for this product (max ${POS_NUMERIC_SKU_MAX})`);
}

export async function nextPosMenuGroupId(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("catalog_menu_groups").select("pos_menu_group_id");
  if (error) throw error;
  return firstMissingPosMenuGroupId(data);
}

export { firstMissingPosMenuGroupId };

export async function allocatePosItemSku(
  supabase: SupabaseClient,
  preferred?: string | null
): Promise<string> {
  const trimmed = preferred?.trim();
  if (trimmed) {
    if (!parsePosNumericSku(trimmed)) {
      throw new Error(`SKU must be a 1-3 digit numeric MintPOS ID (1-${POS_NUMERIC_SKU_MAX})`);
    }
    const { data, error } = await supabase
      .from("catalog_items")
      .select("id")
      .ilike("sku", trimmed)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return trimmed;
  }

  let candidate = await nextPosItemSku(supabase);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const { data, error } = await supabase
      .from("catalog_items")
      .select("id")
      .ilike("sku", candidate)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    candidate = assertAllocatablePosSku(nextAllocatablePosSku(Number(candidate)));
  }
  throw new Error(`Unable to allocate a unique POS item SKU (max ${POS_NUMERIC_SKU_MAX})`);
}

export async function allocatePosVariantSku(
  supabase: SupabaseClient,
  preferred?: string | null,
  itemId?: string | null,
  excludeVariantId?: string | null
): Promise<string> {
  const trimmed = preferred?.trim();
  if (trimmed) {
    if (!parsePosVariantMintSku(trimmed)) {
      throw new Error(
        `Variant SKU must be a numeric MintPOS ID (1-${POS_NUMERIC_SKU_MAX}) or till barcode (4-20 digits)`,
      );
    }
    if (itemId && (await findSiblingVariantSkuConflict(supabase, itemId, trimmed, excludeVariantId))) {
      throw new Error("Variant SKU is already used by another variant on this product");
    }

    return trimmed;
  }

  if (itemId) {
    return nextPosVariantSkuForItem(supabase, itemId, excludeVariantId);
  }

  let candidate = await nextPosVariantSku(supabase);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const { data, error } = await supabase
      .from("catalog_variants")
      .select("id")
      .ilike("sku", candidate)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    candidate = assertAllocatablePosSku(nextAllocatablePosSku(Number(candidate)));
  }
  throw new Error(`Unable to allocate a unique POS variant SKU (max ${POS_NUMERIC_SKU_MAX})`);
}

export async function allocatePosMenuGroupId(
  supabase: SupabaseClient,
  preferred?: number | null
): Promise<number> {
  if (typeof preferred === "number" && Number.isFinite(preferred) && preferred > 0) {
    const { data } = await supabase
      .from("catalog_menu_groups")
      .select("id")
      .eq("pos_menu_group_id", preferred)
      .maybeSingle();
    if (!data) return preferred;
  }

  let candidate = await nextPosMenuGroupId(supabase);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const { data } = await supabase
      .from("catalog_menu_groups")
      .select("id")
      .eq("pos_menu_group_id", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate += 1;
  }
  throw new Error("Unable to allocate a unique MintPOS menu group ID");
}
