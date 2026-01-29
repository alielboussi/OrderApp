import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

const GLOBAL_SCOPE_ID = "00000000-0000-0000-0000-000000000000";

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("counter_values")
      .select("scope_id,last_value")
      .eq("counter_key", "pos_sync_paused")
      .gt("last_value", 0);

    if (error) throw error;

    const pausedOutletIds = Array.isArray(data)
      ? data
          .map((row) => row.scope_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0 && id !== GLOBAL_SCOPE_ID)
      : [];

    const globalPaused = Array.isArray(data)
      ? data.some((row) => row.scope_id === GLOBAL_SCOPE_ID && Number(row.last_value ?? 0) > 0)
      : false;

    return NextResponse.json({ pausedOutletIds, globalPaused });
  } catch (error) {
    console.error("[pos-sync-pause] GET failed", error);
    return NextResponse.json({ error: "Unable to load pause state" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const outletId = typeof body?.outlet_id === "string" ? body.outlet_id.trim() : "";
    const paused = Boolean(body?.paused);

    if (!isUuid(outletId)) {
      return NextResponse.json({ error: "Valid outlet_id is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { error } = await supabase.from("counter_values").upsert(
      {
        counter_key: "pos_sync_paused",
        scope_id: outletId,
        last_value: paused ? 1 : 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "counter_key,scope_id" }
    );

    if (error) throw error;

    return NextResponse.json({ ok: true, outlet_id: outletId, paused });
  } catch (error) {
    console.error("[pos-sync-pause] PUT failed", error);
    return NextResponse.json({ error: "Unable to update pause state" }, { status: 500 });
  }
}
