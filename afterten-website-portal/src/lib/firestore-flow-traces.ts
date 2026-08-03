import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";

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

function toIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

function parseNumber(value: number | null): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return value;
}

function mapTrace(id: string, data: FirebaseFirestore.DocumentData): FlowTraceRow {
  return {
    id,
    created_at: toIso(data.createdAt ?? data.created_at),
    flow_batch_id:
      typeof data.flowBatchId === "string"
        ? data.flowBatchId
        : typeof data.flow_batch_id === "string"
          ? data.flow_batch_id
          : null,
    outlet_id: typeof data.outletId === "string" ? data.outletId : typeof data.outlet_id === "string" ? data.outlet_id : null,
    level: typeof data.level === "string" ? data.level : "",
    item_id: typeof data.itemId === "string" ? data.itemId : typeof data.item_id === "string" ? data.item_id : "",
    variant_key:
      typeof data.variantKey === "string"
        ? data.variantKey
        : typeof data.variant_key === "string"
          ? data.variant_key
          : null,
    warehouse_id:
      typeof data.warehouseId === "string"
        ? data.warehouseId
        : typeof data.warehouse_id === "string"
          ? data.warehouse_id
          : null,
    context: data.context && typeof data.context === "object" ? (data.context as Record<string, unknown>) : null,
  };
}

export async function listFirestoreFlowTraces(options: {
  outletIds: string[];
  levels: string[];
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
}): Promise<{ rows: Array<Record<string, unknown>>; variant_names: Record<string, string> }> {
  const db = getFirestoreDb();
  const snapshot = await db.collection("flow_traces").orderBy("createdAt", "desc").limit(2000).get();

  let traces = snapshot.docs.map((doc) => mapTrace(doc.id, doc.data()));

  if (options.outletIds.length > 0) {
    const outletSet = new Set(options.outletIds);
    traces = traces.filter((trace) => trace.outlet_id && outletSet.has(trace.outlet_id));
  }
  traces = traces.filter((trace) => options.levels.includes(trace.level));

  if (options.startDate) {
    const startIso = new Date(`${options.startDate}T${options.startTime || "00:00"}:00`).toISOString();
    traces = traces.filter((trace) => trace.created_at >= startIso);
  }
  if (options.endDate) {
    if (options.endTime) {
      const endIso = new Date(`${options.endDate}T${options.endTime}:00`).toISOString();
      traces = traces.filter((trace) => trace.created_at <= endIso);
    } else {
      const end = new Date(`${options.endDate}T00:00:00`);
      end.setDate(end.getDate() + 1);
      const endIso = end.toISOString();
      traces = traces.filter((trace) => trace.created_at < endIso);
    }
  }

  if (traces.length === 0) {
    return { rows: [], variant_names: {} };
  }

  const traceIds = new Set(traces.map((trace) => trace.id));
  const itemIds = Array.from(new Set(traces.map((trace) => trace.item_id).filter(Boolean)));
  const traceOutletIds = Array.from(new Set(traces.map((trace) => trace.outlet_id).filter(Boolean))) as string[];
  const warehouseIds = Array.from(new Set(traces.map((trace) => trace.warehouse_id).filter(Boolean))) as string[];
  const variantKeys = Array.from(
    new Set(
      traces
        .map((trace) => (trace.variant_key ?? "base").trim())
        .filter((key) => key && key.toLowerCase() !== "base"),
    ),
  );

  const [stepsSnap, itemsSnap, outletsSnap, warehousesSnap, variantsSnap] = await Promise.all([
    db.collection("flow_trace_steps").get(),
    itemIds.length > 0
      ? Promise.all(itemIds.map((id) => db.collection("catalog_items").doc(id).get()))
      : Promise.resolve([]),
    traceOutletIds.length > 0 ? db.collection("outlets").get() : Promise.resolve(null),
    warehouseIds.length > 0 ? db.collection("warehouses").get() : Promise.resolve(null),
    variantKeys.length > 0
      ? Promise.all(variantKeys.map((id) => db.collection("catalog_variants").doc(id).get()))
      : Promise.resolve([]),
  ]);

  const steps: FlowTraceStep[] = [];
  for (const doc of stepsSnap.docs) {
    const data = doc.data();
    const traceId = typeof data.traceId === "string" ? data.traceId : data.trace_id;
    if (!traceId || !traceIds.has(traceId)) continue;
    steps.push({
      trace_id: traceId,
      occurred_at: toIso(data.occurredAt ?? data.occurred_at),
      delta_units: typeof data.deltaUnits === "number" ? data.deltaUnits : data.delta_units ?? null,
      available_units:
        typeof data.availableUnits === "number" ? data.availableUnits : data.available_units ?? null,
      negative: data.negative === true ? true : data.negative === false ? false : null,
    });
  }
  steps.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  const itemMap = new Map<string, { name?: string; item_kind?: string }>();
  for (const snap of itemsSnap) {
    if (!snap.exists) continue;
    const data = snap.data()!;
    itemMap.set(snap.id, { name: data.name, item_kind: data.item_kind });
  }

  const outletMap = new Map<string, string>();
  if (outletsSnap) {
    for (const doc of outletsSnap.docs) {
      if (!traceOutletIds.includes(doc.id)) continue;
      const name = doc.data().name;
      outletMap.set(doc.id, typeof name === "string" && name.trim() ? name.trim() : doc.id);
    }
  }

  const warehouseMap = new Map<string, string>();
  if (warehousesSnap) {
    for (const doc of warehousesSnap.docs) {
      if (!warehouseIds.includes(doc.id)) continue;
      const name = doc.data().name;
      warehouseMap.set(doc.id, typeof name === "string" && name.trim() ? name.trim() : doc.id);
    }
  }

  const variantMap: Record<string, string> = {};
  for (const snap of variantsSnap) {
    if (!snap.exists) continue;
    const data = snap.data()!;
    const name = data.name;
    variantMap[snap.id] = typeof name === "string" && name.trim() ? name.trim() : snap.id;
  }

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

  return { rows, variant_names: variantMap };
}
