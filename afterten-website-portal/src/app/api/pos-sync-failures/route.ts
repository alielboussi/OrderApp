import { NextRequest, NextResponse } from "next/server";
import { listFirestorePosSyncFailures } from "@/lib/firestore-pos-sync-failures";

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

    const rows = await listFirestorePosSyncFailures({
  outletIds: outletIds.length ? outletIds : undefined,
  startDate,
  endDate,
  search,
});
return NextResponse.json({ rows, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[pos-sync-failures] GET failed", error);
    return NextResponse.json({ error: "Unable to load POS sync failures" }, { status: 500 });
  }
}
