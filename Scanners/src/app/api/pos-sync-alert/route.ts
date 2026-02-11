import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

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
    const supabase = getServiceClient();
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("id,outlet_id,raw_payload,created_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);

    if (orderError) throw orderError;

    const orderRows = (orders ?? []) as OrderRow[];
    const outletIds = Array.from(new Set(orderRows.map((row) => row.outlet_id).filter(Boolean)));

    if (outletIds.length === 0) {
      return NextResponse.json({
        mappingMismatchCount: 0,
        mappingMismatchSamples: [],
        syncFailureCount: 0,
        syncFailureSamples: [],
      });
    }

    const { data: posMaps, error: mapError } = await supabase
      .from("pos_item_map")
      .select("outlet_id,pos_item_id,pos_flavour_id")
      .in("outlet_id", outletIds);

    if (mapError) throw mapError;

    const mapRows = (posMaps ?? []) as PosMapRow[];
    const mapIndex = new Map<string, PosMapRow[]>();

    mapRows.forEach((row) => {
      const key = `${row.outlet_id}::${row.pos_item_id}`;
      const list = mapIndex.get(key) ?? [];
      list.push(row);
      mapIndex.set(key, list);
    });

    const missing: Array<{ outlet_id: string; pos_item_id: string; pos_flavour_id: string | null; order_id: string }> = [];

    orderRows.forEach((order) => {
      const items = order.raw_payload?.items ?? [];
      items.forEach((item) => {
        const posItemId = normalize(item.pos_item_id);
        if (!posItemId) return;
        const flavourId = normalize(item.flavour_id || "") || null;
        const key = `${order.outlet_id}::${posItemId}`;
        const candidates = mapIndex.get(key) ?? [];
        const matched = candidates.some((row) => !row.pos_flavour_id || row.pos_flavour_id === flavourId);
        if (!matched) {
          missing.push({ outlet_id: order.outlet_id, pos_item_id: posItemId, pos_flavour_id: flavourId, order_id: order.id });
        }
      });
    });

    const { data: failures, error: failureError } = await supabase
      .from("pos_sync_failures")
      .select("outlet_id,source_event_id,stage,error_message,created_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    if (failureError) throw failureError;

    const failureRows = (failures ?? []) as FailureRow[];
    const syncFailureSamples = failureRows.slice(0, 5).map((row) => ({
      outlet_id: row.outlet_id,
      source_event_id: row.source_event_id,
      stage: row.stage,
      error_message: row.error_message,
    }));

    const mappingMismatchSamples = missing.slice(0, 8);
    return NextResponse.json({
      mappingMismatchCount: missing.length,
      mappingMismatchSamples,
      syncFailureCount: failureRows.length,
      syncFailureSamples,
    });
  } catch (error) {
    console.error("[pos-sync-alert] GET failed", error);
    return NextResponse.json({ error: "Unable to load POS mapping alerts" }, { status: 500 });
  }
}
