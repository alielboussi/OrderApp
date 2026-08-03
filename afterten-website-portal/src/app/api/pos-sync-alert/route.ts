import { NextResponse } from "next/server";
import { listFirestorePosSyncFailures } from "@/lib/firestore-pos-sync-failures";

type PosMapRow = {
  outlet_id: string;
  pos_item_id: string;
  pos_flavour_id: string | null;
};

type OrderRow = {
  id: string;
  outlet_id: string;
  raw_payload: { items?: Array<{ pos_item_id?: string; flavour_id?: string | null }> } | null;
};

type FailureRow = {
  outlet_id: string | null;
  source_event_id: string | null;
  stage: string;
  error_message: string;
};

const normalize = (value?: string | null) => (typeof value === "string" && value.trim().length ? value.trim() : "");

export async function GET() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceDate = since.toISOString().slice(0, 10);

    const failures = await listFirestorePosSyncFailures({
  startDate: sinceDate,
  limit: 50,
});
const syncFailureSamples = failures.slice(0, 5).map((row) => ({
  outlet_id: row.outlet_id,
  source_event_id: row.source_event_id,
  stage: row.stage ?? "",
  error_message: row.error_message ?? "",
}));
return NextResponse.json({
  mappingMismatchCount: 0,
  mappingMismatchSamples: [],
  syncFailureCount: failures.length,
  syncFailureSamples,
  warning: "POS mapping mismatch checks require orders/pos_item_map in Firestore.",
  cloud_backend: "firebase",
});
    
  } catch (error) {
    console.error("[pos-sync-alert] GET failed", error);
    return NextResponse.json({ error: "Unable to load POS mapping alerts" }, { status: 500 });
  }
}
