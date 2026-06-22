import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type SyncRowInput = {
  item_sku?: unknown;
  item_name?: unknown;
  variant_name?: unknown;
  variant_sku?: unknown;
};

type SyncRow = {
  item_sku: string;
  item_name: string;
  variant_name: string;
  variant_sku: string | null;
};

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function parseRows(body: unknown): SyncRow[] {
  let raw: unknown = body;
  if (body && typeof body === "object" && "json" in (body as Record<string, unknown>)) {
    const jsonCandidate = (body as Record<string, unknown>).json;
    if (typeof jsonCandidate === "string") {
      raw = JSON.parse(jsonCandidate);
    } else {
      raw = jsonCandidate;
    }
  } else if (body && typeof body === "object" && "rows" in (body as Record<string, unknown>)) {
    raw = (body as Record<string, unknown>).rows;
  }

  if (!Array.isArray(raw)) {
    throw new Error("JSON must be an array of rows.");
  }

  const rows: SyncRow[] = [];
  for (const entry of raw as SyncRowInput[]) {
    const item_sku = cleanText(entry?.item_sku);
    const item_name = cleanText(entry?.item_name);
    const variant_name = cleanText(entry?.variant_name);
    const variant_sku = cleanText(entry?.variant_sku) || null;
    if (!item_sku || !item_name || !variant_name) continue;
    rows.push({ item_sku, item_name, variant_name, variant_sku });
  }

  if (!rows.length) {
    throw new Error("No valid rows found in JSON.");
  }

  return rows;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rows = parseRows(body);
    const supabase = getServiceClient();

    const itemSkuToName = new Map<string, string>();
    for (const row of rows) {
      if (!itemSkuToName.has(row.item_sku)) itemSkuToName.set(row.item_sku, row.item_name);
    }
    const itemSkus = Array.from(itemSkuToName.keys());

    const { data: items, error: itemError } = await supabase
      .from("catalog_items")
      .select("id,sku,name,item_kind")
      .eq("item_kind", "finished")
      .in("sku", itemSkus);
    if (itemError) throw itemError;

    const itemsBySku = new Map<string, { id: string; sku: string; name: string | null }>();
    for (const item of items ?? []) {
      const sku = cleanText((item as { sku?: unknown }).sku);
      if (!sku) continue;
      itemsBySku.set(sku, item as { id: string; sku: string; name: string | null });
    }

    let itemsUpdated = 0;
    for (const [sku, name] of itemSkuToName.entries()) {
      const item = itemsBySku.get(sku);
      if (!item) continue;
      if ((item.name ?? "") === name) continue;
      const { error } = await supabase.from("catalog_items").update({ name, updated_at: new Date().toISOString() }).eq("id", item.id);
      if (error) throw error;
      itemsUpdated++;
    }

    const itemIds = Array.from(new Set(Array.from(itemsBySku.values()).map((v) => v.id)));
    if (!itemIds.length) {
      return NextResponse.json({
        ok: true,
        items_updated: itemsUpdated,
        variants_updated: 0,
        unmatched_rows: rows.length,
        unmatched_samples: rows.slice(0, 20),
      });
    }

    const { data: variants, error: variantError } = await supabase
      .from("catalog_variants")
      .select("id,item_id,name,sku")
      .in("item_id", itemIds);
    if (variantError) throw variantError;

    const variantByItemAndName = new Map<string, { id: string; item_id: string; name: string; sku: string | null }>();
    for (const variant of variants ?? []) {
      const v = variant as { id: string; item_id: string; name: string; sku: string | null };
      variantByItemAndName.set(`${v.item_id}::${normalizeName(v.name)}`, v);
    }

    let variantsUpdated = 0;
    const unmatched: SyncRow[] = [];
    const touchedVariantIds = new Set<string>();
    for (const row of rows) {
      const item = itemsBySku.get(row.item_sku);
      if (!item) {
        unmatched.push(row);
        continue;
      }
      const key = `${item.id}::${normalizeName(row.variant_name)}`;
      const variant = variantByItemAndName.get(key);
      if (!variant) {
        unmatched.push(row);
        continue;
      }
      if (touchedVariantIds.has(variant.id)) continue;
      const nextSku = row.variant_sku ?? variant.sku;
      const needsName = variant.name !== row.variant_name;
      const needsSku = (variant.sku ?? null) !== (nextSku ?? null);
      if (!needsName && !needsSku) {
        touchedVariantIds.add(variant.id);
        continue;
      }
      const { error } = await supabase
        .from("catalog_variants")
        .update({ name: row.variant_name, sku: nextSku, updated_at: new Date().toISOString() })
        .eq("id", variant.id);
      if (error) throw error;
      variantsUpdated++;
      touchedVariantIds.add(variant.id);
    }

    return NextResponse.json({
      ok: true,
      items_updated: itemsUpdated,
      variants_updated: variantsUpdated,
      unmatched_rows: unmatched.length,
      unmatched_samples: unmatched.slice(0, 20),
    });
  } catch (error) {
    console.error("[catalog/sync-pos-catalog] POST failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync POS catalog mapping" },
      { status: 500 }
    );
  }
}
