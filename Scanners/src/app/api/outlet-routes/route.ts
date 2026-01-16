import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type RouteRow = {
  outlet_id: string;
  item_id: string;
  warehouse_id: string | null;
  normalized_variant_key: string;
  deduct_enabled?: boolean | null;
  target_outlet_id?: string | null;
};

type IncomingRoute = {
  outlet_id?: unknown;
  warehouse_id?: unknown;
  deduct_enabled?: unknown;
  target_outlet_id?: unknown;
};

const normalizeVariantKey = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized && normalized.length ? normalized : "base";
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

const cleanUuid = (value: unknown) => (isUuid(value) ? value.trim() : null);
const cleanBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallback;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const itemId = cleanUuid(url.searchParams.get("item_id"));
    if (!itemId) return NextResponse.json({ error: "item_id is required" }, { status: 400 });

    const variantKey = normalizeVariantKey(url.searchParams.get("variant_key") || url.searchParams.get("normalized_variant_key"));
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("outlet_item_routes")
      .select("outlet_id,item_id,warehouse_id,normalized_variant_key,deduct_enabled,target_outlet_id")
      .eq("item_id", itemId)
      .eq("normalized_variant_key", variantKey);

    if (error) throw error;

    const routes: RouteRow[] = Array.isArray(data) ? data : [];
    return NextResponse.json({ routes });
  } catch (error) {
    console.error("[outlet-routes] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlet routes" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const itemId = cleanUuid(body.item_id);
    if (!itemId) return NextResponse.json({ error: "item_id is required" }, { status: 400 });

    const variantKey = normalizeVariantKey(body.variant_key || body.normalized_variant_key);
    const routesInput: IncomingRoute[] = Array.isArray(body.routes) ? body.routes : [];

    const upserts: RouteRow[] = [];
    const deleteOutletIds: string[] = [];

    for (const entry of routesInput) {
      const outletId = cleanUuid(entry.outlet_id);
      const warehouseId = cleanUuid(entry.warehouse_id);
      if (!outletId) continue;

      if (!warehouseId) {
        deleteOutletIds.push(outletId);
        continue;
      }

      upserts.push({
        outlet_id: outletId,
        item_id: itemId,
        warehouse_id: warehouseId,
        normalized_variant_key: variantKey,
        deduct_enabled: cleanBoolean(entry.deduct_enabled, true),
        target_outlet_id: cleanUuid(entry.target_outlet_id),
      });
    }

    const supabase = getServiceClient();

    if (deleteOutletIds.length) {
      const { error: deleteError } = await supabase
        .from("outlet_item_routes")
        .delete()
        .eq("item_id", itemId)
        .eq("normalized_variant_key", variantKey)
        .in("outlet_id", deleteOutletIds);
      if (deleteError) throw deleteError;
    }

    if (upserts.length) {
      const { error: upsertError } = await supabase
        .from("outlet_item_routes")
        .upsert(upserts, { onConflict: "outlet_id,item_id,normalized_variant_key" });
      if (upsertError) throw upsertError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[outlet-routes] PUT failed", error);
    return NextResponse.json({ error: "Unable to save outlet routes" }, { status: 500 });
  }
}
