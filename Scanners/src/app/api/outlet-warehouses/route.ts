import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type Outlet = { id: string; name?: string | null; code?: string | null; active?: boolean | null };
type Warehouse = { id: string; name?: string | null; code?: string | null; active?: boolean | null };

type MappingRow = {
  outlet_id: string;
  warehouse_id: string;
  outlet: Outlet | null;
  warehouse: Warehouse | null;
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value.trim());

const cleanUuid = (value: unknown) => (isUuid(value) ? value.trim() : null);

export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("outlet_warehouses")
      .select("outlet_id,warehouse_id,outlet:outlet_id(id,name,code,active),warehouse:warehouse_id(id,name,code,active)")
      .order("outlet_id")
      .order("warehouse_id");

    if (error) throw error;

    const mappings: MappingRow[] = (Array.isArray(data) ? data : []).map((row) => ({
      outlet_id: row.outlet_id,
      warehouse_id: row.warehouse_id,
      outlet: Array.isArray(row.outlet) ? row.outlet[0] ?? null : row.outlet ?? null,
      warehouse: Array.isArray(row.warehouse) ? row.warehouse[0] ?? null : row.warehouse ?? null,
    }));
    return NextResponse.json({ mappings });
  } catch (error) {
    console.error("[outlet-warehouses] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlet warehouses" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const outletId = cleanUuid(body.outlet_id);
    const warehouseId = cleanUuid(body.warehouse_id);
    if (!outletId || !warehouseId) {
      return NextResponse.json({ error: "outlet_id and warehouse_id are required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { error } = await supabase
      .from("outlet_warehouses")
      .upsert({ outlet_id: outletId, warehouse_id: warehouseId }, { onConflict: "outlet_id,warehouse_id" });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[outlet-warehouses] POST failed", error);
    return NextResponse.json({ error: "Unable to save mapping" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const outletId = cleanUuid(url.searchParams.get("outlet_id"));
    const warehouseId = cleanUuid(url.searchParams.get("warehouse_id"));
    if (!outletId || !warehouseId) {
      return NextResponse.json({ error: "outlet_id and warehouse_id are required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { error } = await supabase.from("outlet_warehouses").delete().match({ outlet_id: outletId, warehouse_id: warehouseId });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[outlet-warehouses] DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete mapping" }, { status: 500 });
  }
}
