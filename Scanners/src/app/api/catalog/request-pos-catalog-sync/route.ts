import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type SyncEventRow = {
  outlet_id: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
};

function buildRows(outletIds: string[], entityType: string): SyncEventRow[] {
  const requestedAt = new Date().toISOString();
  return outletIds.map((outletId) => ({
    outlet_id: outletId,
    entity_type: entityType,
    entity_id: "pos_sku_map",
    payload: {
      command: "sync_pos_catalog",
      requested_at: requestedAt,
    },
  }));
}

export async function POST() {
  try {
    const supabase = getServiceClient();
    const { data: outlets, error: outletError } = await supabase
      .from("outlets")
      .select("id")
      .eq("active", true)
      .eq("has_pos_middleware", true);
    if (outletError) throw outletError;

    const outletIds = (outlets ?? [])
      .map((row) => (row as { id?: string }).id)
      .filter((id): id is string => Boolean(id));

    if (!outletIds.length) {
      return NextResponse.json({ ok: true, requested: 0 });
    }

    let rows = buildRows(outletIds, "sync_pos_catalog");
    let { error } = await supabase.from("outlet_catalog_sync_events").insert(rows);

    // Backward compatibility: some databases still constrain entity_type
    // to legacy values and reject "sync_pos_catalog". In that case we
    // enqueue as "item" with a command payload that middleware understands.
    if (error?.code === "23514") {
      rows = buildRows(outletIds, "item");
      const fallback = await supabase.from("outlet_catalog_sync_events").insert(rows);
      error = fallback.error;
    }

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, requested: rows.length });
  } catch (error) {
    console.error("[catalog/request-pos-catalog-sync] POST failed", error);
    return NextResponse.json({ error: "Unable to request POS catalog sync" }, { status: 500 });
  }
}
