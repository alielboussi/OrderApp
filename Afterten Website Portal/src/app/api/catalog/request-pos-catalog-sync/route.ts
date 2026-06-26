import { NextResponse } from "next/server";
import { normalizeFutureScheduledAt } from "@/lib/catalogSyncSchedule";
import { isMiddlewareCatalogSyncOutlet } from "@/lib/outletScope";
import { getServiceClient } from "@/lib/supabase-server";

type OutletSyncOptions = {
  sync_products?: boolean;
  sync_variants?: boolean;
  sync_menu_groups?: boolean;
  exclude_item_skus?: string[];
  exclude_variant_skus?: string[];
};

type SyncEventRow = {
  outlet_id: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
};

function parseSkuList(values?: string[]): string[] {
  return (values ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildRows(
  outletIds: string[],
  entityType: string,
  outletOptions: Record<string, OutletSyncOptions>,
  requestedAt: string,
  scheduledAt: string | null,
): SyncEventRow[] {
  return outletIds.map((outletId) => {
    const options = outletOptions[outletId] ?? {};
    return {
      outlet_id: outletId,
      entity_type: entityType,
      entity_id: "pos_sku_map",
      payload: {
        command: "sync_pos_catalog",
        requested_at: requestedAt,
        sync_products: options.sync_products !== false,
        sync_variants: options.sync_variants !== false,
        sync_menu_groups: options.sync_menu_groups !== false,
        exclude_item_skus: parseSkuList(options.exclude_item_skus),
        exclude_variant_skus: parseSkuList(options.exclude_variant_skus),
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      },
    };
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      outlet_ids?: string[];
      outlet_options?: Record<string, OutletSyncOptions>;
      scheduled_at?: string | null;
    };

    const supabase = getServiceClient();
    const { data: outlets, error: outletError } = await supabase
      .from("outlets")
      .select("id,name,code,channel,active,has_pos_middleware")
      .eq("active", true)
      .eq("has_pos_middleware", true);
    if (outletError) throw outletError;

    const allowedIds = new Set(
      (outlets ?? [])
        .filter((row) => isMiddlewareCatalogSyncOutlet(row))
        .map((row) => (row as { id?: string }).id)
        .filter((id): id is string => Boolean(id)),
    );

    const requestedIds = (body.outlet_ids ?? [])
      .map((id) => id.trim())
      .filter((id) => allowedIds.has(id));
    const outletIds = requestedIds.length > 0 ? requestedIds : Array.from(allowedIds);

    if (!outletIds.length) {
      return NextResponse.json({ ok: true, requested: 0 });
    }

    const requestedAt = new Date().toISOString();
    const outletOptions = body.outlet_options ?? {};
    const scheduledAt =
      typeof body.scheduled_at === "string" && body.scheduled_at.trim()
        ? normalizeFutureScheduledAt(body.scheduled_at)
        : null;
    if (typeof body.scheduled_at === "string" && body.scheduled_at.trim() && !scheduledAt) {
      return NextResponse.json({ error: "Scheduled time must be in the future" }, { status: 400 });
    }

    let rows = buildRows(outletIds, "sync_pos_catalog", outletOptions, requestedAt, scheduledAt);
    let { error } = await supabase.from("outlet_catalog_sync_events").insert(rows);

    // Backward compatibility: some databases still constrain entity_type
    // to legacy values and reject "sync_pos_catalog". In that case we
    // enqueue as "item" with a command payload that middleware understands.
    if (error?.code === "23514") {
      rows = buildRows(outletIds, "item", outletOptions, requestedAt, scheduledAt);
      const fallback = await supabase.from("outlet_catalog_sync_events").insert(rows);
      error = fallback.error;
    }

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, requested: rows.length, scheduled_at: scheduledAt });
  } catch (error) {
    console.error("[catalog/request-pos-catalog-sync] POST failed", error);
    return NextResponse.json({ error: "Unable to request POS catalog sync" }, { status: 500 });
  }
}
