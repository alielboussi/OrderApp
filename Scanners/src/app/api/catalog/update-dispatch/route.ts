import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type DraftRow = {
  entity_type: "item" | "variant" | "menu_group";
  entity_id: string;
  payload: Record<string, unknown> | null;
  updated_at?: string | null;
};

type CandidateRow = {
  key: string;
  entity_type: "item" | "variant" | "menu_group";
  entity_id: string;
  title: string;
  sku: string | null;
  change_type: string;
  updated_at: string | null;
  payload: Record<string, unknown>;
};

const ENTITY_DISPATCH_ORDER: Record<CandidateRow["entity_type"], number> = {
  menu_group: 0,
  item: 1,
  variant: 2,
};

function sortDispatchCandidates(candidates: CandidateRow[]): CandidateRow[] {
  return [...candidates].sort((a, b) => {
    const orderDiff = ENTITY_DISPATCH_ORDER[a.entity_type] - ENTITY_DISPATCH_ORDER[b.entity_type];
    if (orderDiff !== 0) return orderDiff;
    return (a.updated_at ?? "").localeCompare(b.updated_at ?? "");
  });
}

function expandWithGroupDependencies(candidates: CandidateRow[], allCandidates: CandidateRow[]): CandidateRow[] {
  const byKey = new Map(allCandidates.map((candidate) => [candidate.key, candidate] as const));
  const selected = new Map(candidates.map((candidate) => [candidate.key, candidate] as const));

  for (const candidate of candidates) {
    if (candidate.entity_type !== "item" && candidate.entity_type !== "variant") continue;
    const groupId = asText(candidate.payload.menu_group_id);
    if (!groupId) continue;
    const groupKey = `menu_group:${groupId}`;
    if (selected.has(groupKey)) continue;
    const groupCandidate = byKey.get(groupKey);
    if (groupCandidate) {
      selected.set(groupKey, groupCandidate);
    }
  }

  return sortDispatchCandidates(Array.from(selected.values()));
}

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

function toCandidate(draft: DraftRow): CandidateRow {
  const payload = (draft.payload ?? {}) as Record<string, unknown>;
  const entityType = draft.entity_type;
  const sku =
    asText(payload.variant_sku) ??
    asText(payload.item_sku) ??
    asText(payload.sku) ??
    null;
  const title =
    asText(payload.variant_name) ??
    asText(payload.name) ??
    `${entityType} ${draft.entity_id}`;
  const changeType = asText(payload.change_type) ?? (entityType === "item" ? "upsert_item" : entityType === "variant" ? "upsert_variant" : "upsert_menu_group");
  return {
    key: `${entityType}:${draft.entity_id}`,
    entity_type: entityType,
    entity_id: draft.entity_id,
    title,
    sku,
    change_type: changeType,
    updated_at: draft.updated_at ?? null,
    payload,
  };
}

function normalizeSchedule(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const scheduled = (body as { scheduled_at?: unknown }).scheduled_at;
  if (typeof scheduled !== "string" || !scheduled.trim()) return null;
  const parsed = new Date(scheduled);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = (url.searchParams.get("mode") ?? "send_now").trim().toLowerCase();
    const supabase = getServiceClient();

    if (mode === "delete") {
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

      return NextResponse.json({ candidates: [...itemCandidates, ...variantCandidates] });
    }

    const { data, error } = await supabase
      .from("middleware_update_drafts")
      .select("entity_type,entity_id,payload,updated_at")
      .order("updated_at", { ascending: true });
    if (error) throw error;

    const candidates = sortDispatchCandidates(((data ?? []) as DraftRow[]).map(toCandidate));
    return NextResponse.json({ candidates });
  } catch (error) {
    console.error("[catalog/update-dispatch] GET failed", error);
    return NextResponse.json({ error: "Unable to load update candidates" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const modeRaw = typeof body?.mode === "string" ? body.mode.trim().toLowerCase() : "";
    const mode = modeRaw === "schedule" || modeRaw === "delete" ? modeRaw : "send_now";
    const selectedKeys = Array.isArray(body?.selected_keys)
      ? body.selected_keys.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    if (!selectedKeys.length) {
      return NextResponse.json({ error: "Select at least one update." }, { status: 400 });
    }

    const scheduledAt = mode === "schedule" ? normalizeSchedule(body) : null;
    if (mode === "schedule" && !scheduledAt) {
      return NextResponse.json({ error: "A valid schedule date/time is required." }, { status: 400 });
    }

    const supabase = getServiceClient();
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

    let candidates: CandidateRow[] = [];
    if (mode === "delete") {
      const url = new URL(request.url);
      url.searchParams.set("mode", "delete");
      const res = await GET(new Request(url.toString(), { method: "GET" }));
      const json = await res.json();
      candidates = (json.candidates ?? []) as CandidateRow[];
    } else {
      const { data, error } = await supabase
        .from("middleware_update_drafts")
        .select("entity_type,entity_id,payload,updated_at");
      if (error) throw error;
      candidates = ((data ?? []) as DraftRow[]).map(toCandidate);
    }

    const chosenRaw = candidates.filter((candidate) => selectedKeys.includes(candidate.key));
    if (!chosenRaw.length) {
      return NextResponse.json({ error: "Selected updates are no longer available." }, { status: 400 });
    }

    const chosen = mode === "delete" ? chosenRaw : expandWithGroupDependencies(chosenRaw, candidates);

    const rows: Array<{
      outlet_id: string;
      entity_type: string;
      entity_id: string;
      payload: Record<string, unknown>;
    }> = [];

    for (const candidate of chosen) {
      const payload: Record<string, unknown> = { ...(candidate.payload ?? {}) };
      if (mode === "schedule") {
        payload.scheduled_at = scheduledAt;
      } else {
        payload.scheduled_at = null;
      }
      for (const outletId of outletIds) {
        rows.push({
          outlet_id: outletId,
          entity_type: mode === "delete" ? "delete" : candidate.entity_type,
          entity_id: candidate.entity_id,
          payload,
        });
      }
    }

    const { error: insertError } = await supabase.from("outlet_catalog_sync_events").insert(rows);
    if (insertError) throw insertError;

    if (mode !== "delete") {
      const draftPairs = chosen.map((candidate) => ({
        entity_type: candidate.entity_type,
        entity_id: candidate.entity_id,
      }));
      for (const pair of draftPairs) {
        const { error } = await supabase
          .from("middleware_update_drafts")
          .delete()
          .eq("entity_type", pair.entity_type)
          .eq("entity_id", pair.entity_id);
        if (error) throw error;
      }
    }

    return NextResponse.json({
      ok: true,
      sent: chosen.length,
      outlets: outletIds.length,
      outlet_ids: outletIds,
      mode,
      scheduled_at: scheduledAt,
    });
  } catch (error) {
    console.error("[catalog/update-dispatch] POST failed", error);
    return NextResponse.json({ error: "Unable to dispatch updates" }, { status: 500 });
  }
}
