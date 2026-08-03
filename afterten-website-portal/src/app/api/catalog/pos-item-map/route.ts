import { NextResponse } from "next/server";
import {
  createFirestorePosItemMap,
  deleteFirestorePosItemMap,
  listFirestorePosItemMap,
} from "@/lib/firestore-pos-item-map";

export async function GET() {
  try {
    const mappings = await listFirestorePosItemMap();
    return NextResponse.json({ mappings, cloud_backend: "firebase" });
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
    if (pos_item_id === catalog_item_id) {
      return NextResponse.json({ error: "pos_item_id cannot be the same as catalog_item_id" }, { status: 400 });
    }

    const result = await createFirestorePosItemMap({
      pos_item_id,
      pos_item_name,
      pos_flavour_id,
      pos_flavour_name,
      catalog_item_id,
      catalog_variant_key,
      warehouse_id,
      outlet_id,
    });
    return NextResponse.json(
      { mapping: result.mapping, duplicate: result.duplicate, cloud_backend: "firebase" },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    console.error("[pos-item-map] POST failed", error);
    const message = error instanceof Error ? error.message : "Unable to create mapping";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pos_item_id = searchParams.get("pos_item_id");
    const catalog_item_id = searchParams.get("catalog_item_id");
    const outlet_id = searchParams.get("outlet_id");
    const pos_flavour_id = searchParams.get("pos_flavour_id");
    const catalog_variant_key = searchParams.get("catalog_variant_key");
    const warehouse_id = searchParams.get("warehouse_id");

    if (!pos_item_id || !catalog_item_id || !outlet_id) {
      return NextResponse.json({ error: "pos_item_id, catalog_item_id, and outlet_id are required" }, { status: 400 });
    }

    await deleteFirestorePosItemMap({
      pos_item_id,
      catalog_item_id,
      outlet_id,
      pos_flavour_id,
      catalog_variant_key,
      warehouse_id,
    });
    return NextResponse.json({ ok: true, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[pos-item-map] DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete mapping" }, { status: 500 });
  }
}
