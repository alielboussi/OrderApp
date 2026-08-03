import { NextResponse } from "next/server";
import {
  listFirestoreOutletOrderRoutes,
  saveFirestoreOutletOrderRoutes,
} from "@/lib/firestore-outlet-order-routes";

type RouteRow = {
  outlet_id: string;
  item_id: string;
  warehouse_id: string | null;
  normalized_variant_key: string;
  variant_key?: string | null;
};

type IncomingRoute = {
  outlet_id?: unknown;
  warehouse_id?: unknown;
};

const normalizeVariantKey = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized && normalized.length ? normalized : "base";
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

const cleanUuid = (value: unknown) => (isUuid(value) ? value.trim() : null);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const itemId = cleanUuid(url.searchParams.get("item_id"));
    if (!itemId) return NextResponse.json({ error: "item_id is required" }, { status: 400 });

    const variantKey = normalizeVariantKey(url.searchParams.get("variant_key") || url.searchParams.get("normalized_variant_key"));

    const routes = await listFirestoreOutletOrderRoutes(itemId, variantKey);
return NextResponse.json({ routes, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[outlet-order-routes] GET failed", error);
    return NextResponse.json({ error: "Unable to load order routes" }, { status: 500 });
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
        variant_key: variantKey,
        normalized_variant_key: variantKey,
      });
    }

    const routes = [
  ...upserts.map((row) => ({ outlet_id: row.outlet_id, warehouse_id: row.warehouse_id })),
  ...deleteOutletIds.map((outlet_id) => ({ outlet_id, warehouse_id: null })),
];
await saveFirestoreOutletOrderRoutes(itemId, variantKey, routes);
return NextResponse.json({ ok: true, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[outlet-order-routes] PUT failed", error);
    return NextResponse.json({ error: "Unable to save order routes" }, { status: 500 });
  }
}
