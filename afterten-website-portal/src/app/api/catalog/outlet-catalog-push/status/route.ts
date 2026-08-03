import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { getFirestoreCatalogSyncStatus } from "@/lib/firestore-catalog-sync";

function parseEventIds(request: Request): string[] {
  const url = new URL(request.url);
  const raw = url.searchParams.get("ids")?.trim() ?? "";
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

export async function GET(request: Request) {
  try {
    const eventIds = parseEventIds(request);
    if (!eventIds.length) {
      return NextResponse.json({ error: "ids query parameter is required" }, { status: 400 });
    }

    if (useFirebaseBackend()) {
      const status = await getFirestoreCatalogSyncStatus(eventIds);
      return NextResponse.json({ ...status, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("outlet_catalog_sync_events")
      .select("id,status,delivered_at,error_message,outlet_id")
      .in("id", eventIds);
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const byId = new Map(rows.map((row) => [String((row as { id: string }).id), row as {
      id: string;
      status: string;
      delivered_at: string | null;
      error_message: string | null;
      outlet_id: string;
    }]));

    let pending = 0;
    let delivered = 0;
    let lastDeliveredAt: string | null = null;

    for (const id of eventIds) {
      const row = byId.get(id);
      if (!row || row.status === "pending") {
        pending += 1;
        continue;
      }
      if (row.status === "delivered") {
        delivered += 1;
        if (row.delivered_at && (!lastDeliveredAt || row.delivered_at > lastDeliveredAt)) {
          lastDeliveredAt = row.delivered_at;
        }
      }
    }

    return NextResponse.json({
      total: eventIds.length,
      pending,
      delivered,
      last_delivered_at: lastDeliveredAt,
      complete: pending === 0 && delivered === eventIds.length,
    });
  } catch (error) {
    console.error("[catalog/outlet-catalog-push/status] GET failed", error);
    return NextResponse.json({ error: "Unable to load catalog sync status" }, { status: 500 });
  }
}
