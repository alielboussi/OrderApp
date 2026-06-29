import type { SupabaseClient } from "@supabase/supabase-js";

/** MintPOS MenuItem.Code / ModifierFlavour.Name2 use numeric POS ids as SKUs. */
export function parsePosNumericSku(sku: string | null | undefined): number | null {
  if (!sku) return null;
  const trimmed = sku.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function maxPosNumericSku(rows: Array<{ sku?: string | null }> | null | undefined): number {
  let max = 0;
  for (const row of rows ?? []) {
    const parsed = parsePosNumericSku(row.sku ?? null);
    if (parsed !== null && parsed > max) max = parsed;
  }
  return max;
}

function maxPosMenuGroupId(rows: Array<{ pos_menu_group_id?: number | null }> | null | undefined): number {
  let max = 0;
  for (const row of rows ?? []) {
    const id = row.pos_menu_group_id;
    if (typeof id === "number" && Number.isFinite(id) && id > max) max = id;
  }
  return max;
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
  return String(maxPosNumericSku(data) + 1);
}

export async function nextPosVariantSku(supabase: SupabaseClient): Promise<string> {
  const data = await fetchAllSkuRows(supabase, "catalog_variants");
  return String(maxPosNumericSku(data) + 1);
}

export async function nextPosMenuGroupId(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("catalog_menu_groups").select("pos_menu_group_id");
  if (error) throw error;
  return maxPosMenuGroupId(data) + 1;
}

export async function allocatePosItemSku(
  supabase: SupabaseClient,
  preferred?: string | null
): Promise<string> {
  const trimmed = preferred?.trim();
  if (trimmed) {
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
    candidate = String(Number(candidate) + 1);
  }
  throw new Error("Unable to allocate a unique POS item SKU");
}

export async function allocatePosVariantSku(
  supabase: SupabaseClient,
  preferred?: string | null
): Promise<string> {
  const trimmed = preferred?.trim();
  if (trimmed) {
    const { data, error } = await supabase
      .from("catalog_variants")
      .select("id")
      .ilike("sku", trimmed)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return trimmed;
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
    candidate = String(Number(candidate) + 1);
  }
  throw new Error("Unable to allocate a unique POS variant SKU");
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
