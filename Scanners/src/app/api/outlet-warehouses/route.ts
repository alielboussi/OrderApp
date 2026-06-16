import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type LinkRow = {
  outlet_id: string;
  warehouse_id: string;
  warehouses: { id: string; name: string | null } | null;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const outletId = url.searchParams.get("outlet_id")?.trim();

    const supabase = getServiceClient();
    let query = supabase
      .from("outlet_warehouses")
      .select("outlet_id,warehouse_id,warehouses(id,name)")
      .order("outlet_id");

    if (outletId) query = query.eq("outlet_id", outletId);

    const { data, error } = await query;
    if (error) throw error;

    const links = ((data as LinkRow[]) ?? []).map((row) => ({
      outlet_id: row.outlet_id,
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouses?.name ?? "Warehouse",
    }));

    return NextResponse.json({ links });
  } catch (error) {
    console.error("[outlet-warehouses] GET failed", error);
    return NextResponse.json({ error: "Unable to load outlet warehouses" }, { status: 500 });
  }
}
