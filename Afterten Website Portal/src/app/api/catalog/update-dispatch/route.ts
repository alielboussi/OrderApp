import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type CandidateRow = {
  key: string;
  entity_type: "item" | "variant";
  entity_id: string;
  title: string;
  sku: string | null;
  change_type: string;
  updated_at: null;
  payload: Record<string, unknown>;
};

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function cleanedSkuList(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) continue;
    if (!result.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
      result.push(normalized);
    }
  }
  return result;
}

async function middlewareOutletIds() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("outlets")
    .select("id")
    .eq("active", true)
    .eq("has_pos_middleware", true);
  if (error) throw error;
  return (data ?? [])
    .map((row) => (row as { id?: string }).id)
    .filter((id): id is string => Boolean(id));
}

async function loadDeleteCandidates(): Promise<CandidateRow[]> {
  const supabase = getServiceClient();
  const [itemsRes, variantsRes] = await Promise.all([
    supabase.from("catalog_items").select("id,name,sku").order("name"),
    supabase.from("catalog_variants").select("id,item_id,name,sku").order("name"),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (variantsRes.error) throw variantsRes.error;

  const variantsByItemId = new Map<string, string[]>();
  for (const row of variantsRes.data ?? []) {
    const variant = row as { item_id?: string | null; sku?: string | null };
    const itemId = asText(variant.item_id);
    if (!itemId) continue;
    const current = variantsByItemId.get(itemId) ?? [];
    const updated = cleanedSkuList([...current, variant.sku ?? null]);
    variantsByItemId.set(itemId, updated);
  }

  const itemCandidates = (itemsRes.data ?? []).map((row) => {
    const item = row as { id: string; name?: string | null; sku?: string | null };
    const allVariantSkus = variantsByItemId.get(item.id) ?? [];
    const itemSkus = cleanedSkuList([item.sku ?? null]);
    return {
      key: `delete_item:${item.id}`,
      entity_type: "item",
      entity_id: item.id,
      title: item.name ?? item.id,
      sku: item.sku ?? null,
      change_type: "delete_item",
      updated_at: null,
      payload: {
        delete_type: "item",
        item_sku: item.sku ?? null,
        item_skus: itemSkus,
        all_variant_skus: allVariantSkus,
        variant_skus: allVariantSkus,
        name: item.name ?? null,
      },
    } satisfies CandidateRow;
  });

  const variantCandidates = (variantsRes.data ?? []).map((row) => {
    const variant = row as { id: string; item_id: string; name?: string | null; sku?: string | null };
    const variantSkus = cleanedSkuList([variant.sku ?? null]);
    return {
      key: `delete_variant:${variant.id}`,
      entity_type: "variant",
      entity_id: variant.id,
      title: variant.name ?? variant.id,
      sku: variant.sku ?? null,
      change_type: "delete_variant",
      updated_at: null,
      payload: {
        delete_type: "variant",
        item_id: variant.item_id,
        variant_sku: variant.sku ?? null,
        variant_skus: variantSkus,
        variant_name: variant.name ?? null,
      },
    } satisfies CandidateRow;
  });

  return [...itemCandidates, ...variantCandidates];
}

export async function GET() {
  try {
    const candidates = await loadDeleteCandidates();
    return NextResponse.json({ candidates });
  } catch (error) {
    console.error("[catalog/update-dispatch] GET failed", error);
    return NextResponse.json({ error: "Unable to load delete candidates" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const modeRaw = typeof body?.mode === "string" ? body.mode.trim().toLowerCase() : "";
    if (modeRaw !== "delete") {
      return NextResponse.json(
        { error: "Only delete dispatch is supported. Use Send to Middleware for catalog pushes." },
        { status: 400 }
      );
    }

    const selectedKeys = Array.isArray(body?.selected_keys)
      ? body.selected_keys.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    if (!selectedKeys.length) {
      return NextResponse.json({ error: "Select at least one item to delete." }, { status: 400 });
    }

    const allMiddlewareOutletIds = await middlewareOutletIds();
    if (!allMiddlewareOutletIds.length) {
      return NextResponse.json({ error: "No active middleware outlets found." }, { status: 400 });
    }

    const requestedOutletIds = Array.isArray(body?.outlet_ids)
      ? body.outlet_ids
          .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [];

    const allowedMiddleware = new Set(allMiddlewareOutletIds);
    const outletIds =
      requestedOutletIds.length > 0
        ? requestedOutletIds.filter((outletId) => allowedMiddleware.has(outletId))
        : allMiddlewareOutletIds;

    if (!outletIds.length) {
      return NextResponse.json({ error: "No valid middleware outlets selected." }, { status: 400 });
    }

    const candidates = await loadDeleteCandidates();
    const chosen = candidates.filter((candidate) => selectedKeys.includes(candidate.key));
    if (!chosen.length) {
      return NextResponse.json({ error: "Selected items are no longer available." }, { status: 400 });
    }

    const rows: Array<{
      outlet_id: string;
      entity_type: string;
      entity_id: string;
      payload: Record<string, unknown>;
    }> = [];

    for (const candidate of chosen) {
      for (const outletId of outletIds) {
        rows.push({
          outlet_id: outletId,
          entity_type: "delete",
          entity_id: candidate.entity_id,
          payload: { ...(candidate.payload ?? {}) },
        });
      }
    }

    const supabase = getServiceClient();
    const { error: insertError } = await supabase.from("outlet_catalog_sync_events").insert(rows);
    if (insertError) throw insertError;

    return NextResponse.json({
      ok: true,
      sent: chosen.length,
      outlets: outletIds.length,
      outlet_ids: outletIds,
      mode: "delete",
    });
  } catch (error) {
    console.error("[catalog/update-dispatch] POST failed", error);
    return NextResponse.json({ error: "Unable to dispatch deletes" }, { status: 500 });
  }
}
