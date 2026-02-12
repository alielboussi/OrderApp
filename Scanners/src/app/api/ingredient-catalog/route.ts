import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawIds = url.searchParams.getAll("storage_home_id");
    const storageHomeIds = rawIds.filter((id) => isUuid(id));
    if (!storageHomeIds.length) {
      return NextResponse.json({ items: [] });
    }

    const supabase = getServiceClient();
    const { data: homeRows, error: homeError } = await supabase
      .from("item_storage_homes")
      .select("item_id")
      .in("storage_warehouse_id", storageHomeIds);
    if (homeError) throw homeError;

    const itemIds = (homeRows ?? []).map((row) => row?.item_id).filter(Boolean);
    if (!itemIds.length) {
      return NextResponse.json({ items: [] });
    }

    const { data, error } = await supabase
      .from("catalog_items")
      .select(
        "id,name,item_kind,has_variations,purchase_pack_unit,consumption_uom,sku,supplier_sku,package_contains:units_per_purchase_pack,transfer_unit,transfer_quantity,active"
      )
      .in("id", itemIds)
      .eq("item_kind", "ingredient")
      .eq("active", true)
      .order("name");
    if (error) throw error;

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    console.error("[ingredient-catalog] GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load ingredient catalog" },
      { status: 500 }
    );
  }
}
