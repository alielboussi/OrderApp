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

export function firstMissingPosMenuGroupId(
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
