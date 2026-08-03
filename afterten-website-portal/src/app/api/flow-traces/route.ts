import { NextRequest, NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { listFirestoreFlowTraces } from "@/lib/firestore-flow-traces";
import { getServiceClient } from "@/lib/supabase-server";

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

    if (useFirebaseBackend()) {
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
    }

    if (levels.length === 0) {
      return NextResponse.json({ rows: [], variant_names: {} });
    }

    const supabase = getServiceClient();

    let query = supabase
      .from("flow_traces")
      .select("id,created_at,flow_batch_id,outlet_id,level,item_id,variant_key,warehouse_id,context")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (outletIds.length > 0) {
      query = query.in("outlet_id", outletIds);
    }
    query = query.in("level", levels);

    if (startDate) {
      const startIso = new Date(`${startDate}T${startTime || "00:00"}:00`).toISOString();
      query = query.gte("created_at", startIso);
    }
    if (endDate) {
      if (endTime) {
        const endIso = new Date(`${endDate}T${endTime}:00`).toISOString();
        query = query.lte("created_at", endIso);
      } else {
        const end = new Date(`${endDate}T00:00:00`);
        end.setDate(end.getDate() + 1);
        query = query.lt("created_at", end.toISOString());
      }
    }

    const { data: traceData, error: traceError } = await query;
    if (traceError) throw traceError;

    const traces = (traceData ?? []) as FlowTraceRow[];
    if (traces.length === 0) {
      return NextResponse.json({ rows: [], variant_names: {} });
    }

    const traceIds = traces.map((trace) => trace.id);
    const itemIds = Array.from(new Set(traces.map((trace) => trace.item_id)));
    const traceOutletIds = Array.from(new Set(traces.map((trace) => trace.outlet_id).filter(Boolean))) as string[];
    const warehouseIds = Array.from(new Set(traces.map((trace) => trace.warehouse_id).filter(Boolean))) as string[];
    const variantKeys = Array.from(
      new Set(
        traces
          .map((trace) => (trace.variant_key ?? "base").trim())
          .filter((key) => key && key.toLowerCase() !== "base"),
      ),
    );

    const [stepsRes, itemRes, outletRes, warehouseRes, variantRes] = await Promise.all([
      supabase
        .from("flow_trace_steps")
        .select("trace_id,occurred_at,delta_units,available_units,negative")
        .in("trace_id", traceIds)
        .order("occurred_at", { ascending: true }),
      supabase.from("catalog_items").select("id,name,item_kind").in("id", itemIds),
      traceOutletIds.length > 0
        ? supabase.from("outlets").select("id,name").in("id", traceOutletIds)
        : Promise.resolve({ data: [], error: null }),
      warehouseIds.length > 0
        ? supabase.from("warehouses").select("id,name").in("id", warehouseIds)
        : Promise.resolve({ data: [], error: null }),
      variantKeys.length > 0
        ? supabase.from("catalog_variants").select("id,name").in("id", variantKeys)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (stepsRes.error) throw stepsRes.error;
    if (itemRes.error) throw itemRes.error;
    if (outletRes.error) throw outletRes.error;
    if (warehouseRes.error) throw warehouseRes.error;
    if (variantRes.error) throw variantRes.error;

    const steps = (stepsRes.data ?? []) as FlowTraceStep[];
    const items = itemRes.data ?? [];
    const outletsList = outletRes.data ?? [];
    const warehousesList = warehouseRes.data ?? [];

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const outletMap = new Map(outletsList.map((outlet) => [outlet.id, outlet.name ?? outlet.id]));
    const warehouseMap = new Map(warehousesList.map((warehouse) => [warehouse.id, warehouse.name ?? warehouse.id]));

    const variantMap: Record<string, string> = {};
    (variantRes.data ?? []).forEach((variant: { id?: string; name?: string | null }) => {
      if (variant?.id) {
        variantMap[variant.id] = (variant.name ?? "").trim() || variant.id;
      }
    });

    const stepsByTrace = new Map<string, FlowTraceStep[]>();
    steps.forEach((step) => {
      const list = stepsByTrace.get(step.trace_id) ?? [];
      list.push(step);
      stepsByTrace.set(step.trace_id, list);
    });

    const rows = traces.map((trace) => {
      const traceSteps = stepsByTrace.get(trace.id) ?? [];
      const totalDelta = traceSteps.reduce((sum, step) => sum + parseNumber(step.delta_units), 0);
      const lastStep = traceSteps.length ? traceSteps[traceSteps.length - 1] : null;
      const available = lastStep?.available_units ?? null;
      const negative = traceSteps.some((step) => Boolean(step.negative));
      const item = itemMap.get(trace.item_id);
      const variantKey = (trace.variant_key ?? "base").trim();
      const variantLabel =
        !variantKey || variantKey.toLowerCase() === "base" ? "Base" : (variantMap[variantKey] ?? variantKey);

      return {
        id: trace.id,
        created_at: new Date(trace.created_at).toLocaleString(),
        created_at_epoch: new Date(trace.created_at).getTime(),
        flow_batch_id: trace.flow_batch_id ?? null,
        outlet_id: trace.outlet_id,
        outlet_name: trace.outlet_id ? (outletMap.get(trace.outlet_id) ?? trace.outlet_id) : "Unknown",
        level: trace.level,
        item_id: trace.item_id,
        item_name: item?.name ?? trace.item_id,
        variant_key: variantKey || "base",
        variant_label: variantLabel,
        warehouse_id: trace.warehouse_id,
        warehouse_name: trace.warehouse_id ? (warehouseMap.get(trace.warehouse_id) ?? trace.warehouse_id) : "Unknown",
        total_delta: totalDelta,
        available_units: available,
        negative,
      };
    });

    return NextResponse.json({ rows, variant_names: variantMap });
  } catch (error) {
    console.error("[flow-traces] GET failed", error);
    return NextResponse.json({ error: "Unable to load flow traces" }, { status: 500 });
  }
}
