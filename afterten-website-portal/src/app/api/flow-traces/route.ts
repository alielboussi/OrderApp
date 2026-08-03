import { NextRequest, NextResponse } from "next/server";
import { listFirestoreFlowTraces } from "@/lib/firestore-flow-traces";

type FlowTraceRow = {
  id: string;
  created_at: string;
  flow_batch_id: string | null;
  outlet_id: string | null;
  level: string;
  item_id: string;
  variant_key: string | null;
  warehouse_id: string | null;
  context: Record<string, unknown> | null;
};

type FlowTraceStep = {
  trace_id: string;
  occurred_at: string;
  delta_units: number | null;
  available_units: number | null;
  negative: boolean | null;
};

function parseNumber(value: number | null): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const outletIds = url.searchParams.getAll("outlet_id").filter(Boolean);
    const levels = url.searchParams.getAll("level").filter(Boolean);
    const startDate = url.searchParams.get("start_date");
    const startTime = url.searchParams.get("start_time");
    const endDate = url.searchParams.get("end_date");
    const endTime = url.searchParams.get("end_time");

    if (levels.length === 0) {
  return NextResponse.json({ rows: [], variant_names: {}, cloud_backend: "firebase" });
}
const result = await listFirestoreFlowTraces({
  outletIds,
  levels,
  startDate,
  startTime,
  endDate,
  endTime,
});
return NextResponse.json({ ...result, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[flow-traces] GET failed", error);
    return NextResponse.json({ error: "Unable to load flow traces" }, { status: 500 });
  }
}
