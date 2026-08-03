import { NextRequest, NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { listFirestorePosSyncFailures } from "@/lib/firestore-pos-sync-failures";
import { getServiceClient } from "@/lib/supabase-server";

type RawFailureRow = {
  id: string;
  created_at: string;
  outlet_id: string | null;
  stage: string | null;
  error_message: string | null;
  source_event_id: string | null;
  pos_order_id: string | null;
  sale_id: string | null;
  details: Record<string, unknown> | null;
};

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const outletIds = url.searchParams.getAll("outlet_id").filter(Boolean);
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");
    const search = url.searchParams.get("search");

    if (useFirebaseBackend()) {
      const rows = await listFirestorePosSyncFailures({
        outletIds: outletIds.length ? outletIds : undefined,
        startDate,
        endDate,
        search,
      });
      return NextResponse.json({ rows, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    let query = supabase
      .from("pos_sync_failures")
      .select("id,created_at,outlet_id,stage,error_message,source_event_id,pos_order_id,sale_id,details")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (outletIds.length > 0) {
      query = query.in("outlet_id", outletIds);
    }
    if (startDate) {
      query = query.gte("created_at", new Date(`${startDate}T00:00:00`).toISOString());
    }
    if (endDate) {
      const end = new Date(`${endDate}T00:00:00`);
      end.setDate(end.getDate() + 1);
      query = query.lt("created_at", end.toISOString());
    }
    const searchTerm = search?.trim();
    if (searchTerm) {
      const encoded = `%${searchTerm}%`;
      query = query.or(
        `stage.ilike.${encoded},error_message.ilike.${encoded},pos_order_id.ilike.${encoded},sale_id.ilike.${encoded},source_event_id.ilike.${encoded}`,
      );
    }

    const { data: failureData, error: failureError } = await query;
    if (failureError) throw failureError;

    const failures = (failureData ?? []) as RawFailureRow[];
    const failureOutletIds = Array.from(new Set(failures.map((row) => row.outlet_id).filter(Boolean))) as string[];

    const { data: outletRows, error: outletError } = failureOutletIds.length
      ? await supabase.from("outlets").select("id,name").in("id", failureOutletIds)
      : { data: [] as Array<{ id: string; name: string | null }>, error: null };

    if (outletError) throw outletError;

    const outletMap = new Map((outletRows ?? []).map((outlet) => [outlet.id, outlet.name ?? outlet.id]));

    const rows = failures.map((row) => ({
      ...row,
      outlet_name: row.outlet_id ? (outletMap.get(row.outlet_id) ?? row.outlet_id) : "Unknown outlet",
    }));

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("[pos-sync-failures] GET failed", error);
    return NextResponse.json({ error: "Unable to load POS sync failures" }, { status: 500 });
  }
}
