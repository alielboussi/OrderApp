import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

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

    const rows = outletIds.map((outletId) => ({
      outlet_id: outletId,
      entity_type: "sync_pos_catalog",
      entity_id: "pos_sku_map",
      payload: { requested_at: new Date().toISOString() },
    }));

    const { error } = await supabase.from("outlet_catalog_sync_events").insert(rows);
    if (error) throw error;

    return NextResponse.json({ ok: true, requested: rows.length });
  } catch (error) {
    console.error("[catalog/request-pos-catalog-sync] POST failed", error);
    return NextResponse.json({ error: "Unable to request POS catalog sync" }, { status: 500 });
  }
}
