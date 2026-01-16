import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("pos_item_map")
      .select(
        [
          "pos_item_id",
          "pos_item_name",
          "pos_flavour_id",
          "pos_flavour_name",
          "catalog_item_id",
          "catalog_variant_key",
          "normalized_variant_key",
          "warehouse_id",
          "outlet_id",
        ].join(",")
      );

    if (error) throw error;
    return NextResponse.json({ mappings: data ?? [] });
  } catch (error) {
    console.error("[pos-item-map] GET failed", error);
    return NextResponse.json({ error: "Unable to load POS item mappings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const pos_item_id = typeof body.pos_item_id === "string" && body.pos_item_id.trim() ? body.pos_item_id.trim() : null;
    const pos_item_name = typeof body.pos_item_name === "string" && body.pos_item_name.trim() ? body.pos_item_name.trim() : null;
    const pos_flavour_id = typeof body.pos_flavour_id === "string" && body.pos_flavour_id.trim() ? body.pos_flavour_id.trim() : null;
    const pos_flavour_name =
      typeof body.pos_flavour_name === "string" && body.pos_flavour_name.trim() ? body.pos_flavour_name.trim() : null;
    const catalog_item_id = typeof body.catalog_item_id === "string" && body.catalog_item_id.trim() ? body.catalog_item_id.trim() : null;
    const catalog_variant_key = typeof body.catalog_variant_key === "string" && body.catalog_variant_key.trim()
      ? body.catalog_variant_key.trim()
      : "base";
    const warehouse_id = typeof body.warehouse_id === "string" && body.warehouse_id.trim() ? body.warehouse_id.trim() : null;
    const outlet_id = typeof body.outlet_id === "string" && body.outlet_id.trim() ? body.outlet_id.trim() : null;

    if (!pos_item_id) return NextResponse.json({ error: "pos_item_id is required" }, { status: 400 });
    if (!catalog_item_id) return NextResponse.json({ error: "catalog_item_id is required" }, { status: 400 });
    if (!outlet_id) return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("pos_item_map")
      .insert({
        pos_item_id,
        pos_item_name,
        pos_flavour_id,
        pos_flavour_name,
        catalog_item_id,
        catalog_variant_key,
        normalized_variant_key: catalog_variant_key || "base",
        warehouse_id,
        outlet_id,
      })
      .select(
        [
          "pos_item_id",
          "pos_item_name",
          "pos_flavour_id",
          "pos_flavour_name",
          "catalog_item_id",
          "catalog_variant_key",
          "normalized_variant_key",
          "warehouse_id",
          "outlet_id",
        ].join(",")
      )
      .single();

    if (error) throw error;
    return NextResponse.json({ mapping: data }, { status: 201 });
  } catch (error) {
    console.error("[pos-item-map] POST failed", error);
    return NextResponse.json({ error: "Unable to create mapping" }, { status: 500 });
  }
}
