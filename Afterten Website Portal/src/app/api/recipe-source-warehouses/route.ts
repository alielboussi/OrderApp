import { NextResponse } from "next/server";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import {
  listFirestoreRecipeSourceWarehouses,
  saveFirestoreRecipeSourceWarehouses,
} from "@/lib/firestore-recipes";
import { getServiceClient } from "@/lib/supabase-server";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim())
  );
}

function cleanUuid(value: unknown): string | null {
  if (isUuid(value)) return value.trim();
  return null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawIds = url.searchParams.get("item_ids") ?? "";
    const ids = rawIds
      .split(",")
      .map((id) => cleanUuid(id))
      .filter((id): id is string => Boolean(id));

    if (!ids.length) {
      return NextResponse.json({ selections: {} });
    }

    if (useFirebaseBackend()) {
      const selections = await listFirestoreRecipeSourceWarehouses(ids);
      return NextResponse.json({ selections, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("item_warehouse_handling_policies")
      .select("item_id,warehouse_id,recipe_source,variant_key")
      .in("item_id", ids)
      .eq("recipe_source", true);

    if (error) throw error;

    const selections: Record<string, string[]> = {};
    (data ?? []).forEach((row) => {
      const itemId = row.item_id as string | null;
      const warehouseId = row.warehouse_id as string | null;
      if (!itemId || !warehouseId) return;
      if (!selections[itemId]) selections[itemId] = [];
      selections[itemId].push(warehouseId);
    });

    return NextResponse.json({ selections });
  } catch (error) {
    console.error("[recipe-source-warehouses] GET failed", error);
    return NextResponse.json({ error: "Unable to load recipe source warehouses" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const selections = Array.isArray(body?.selections) ? body.selections : [];

    if (useFirebaseBackend()) {
      const normalized: Array<{ item_id: string; warehouse_ids: string[] }> = [];
      for (const entry of selections) {
        const itemId = cleanUuid(entry?.item_id);
        if (!itemId) continue;
        const rawWarehouseIds: unknown[] = Array.isArray(entry?.warehouse_ids) ? entry.warehouse_ids : [];
        const warehouseIds = rawWarehouseIds.map((rawId) => cleanUuid(rawId)).filter((id): id is string => Boolean(id));
        normalized.push({ item_id: itemId, warehouse_ids: warehouseIds });
      }
      await saveFirestoreRecipeSourceWarehouses(normalized);
      return NextResponse.json({ ok: true, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();

    for (const entry of selections) {
      const itemId = cleanUuid(entry?.item_id);
      if (!itemId) continue;
      const rawWarehouseIds = Array.isArray(entry?.warehouse_ids) ? entry.warehouse_ids : [];
      const warehouseIds: string[] = [];
      for (const rawId of rawWarehouseIds) {
        const cleaned = cleanUuid(rawId);
        if (cleaned) warehouseIds.push(cleaned);
      }

      const { error: deleteError } = await supabase
        .from("item_warehouse_handling_policies")
        .delete()
        .eq("item_id", itemId)
        .eq("recipe_source", true);
      if (deleteError) throw deleteError;

      if (!warehouseIds.length) continue;

      const rows = warehouseIds.map((warehouseId: string) => ({
        item_id: itemId,
        warehouse_id: warehouseId,
        recipe_source: true,
        variant_key: "base",
      }));
      const { error: insertError } = await supabase.from("item_warehouse_handling_policies").insert(rows);
      if (insertError) throw insertError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[recipe-source-warehouses] PUT failed", error);
    return NextResponse.json({ error: "Unable to save recipe source warehouses" }, { status: 500 });
  }
}
