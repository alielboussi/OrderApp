import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  try {
    const outletId = new URL(request.url).searchParams.get("outlet_id")?.trim();
    if (!outletId) {
      return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
    }
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("outlet_order_yield_rules")
      .select("*")
      .eq("outlet_id", outletId)
      .eq("active", true)
      .order("sort_order");
    if (error) {
      if (error.message.includes("outlet_order_yield_rules")) {
        return NextResponse.json({ rules: [] });
      }
      throw error;
    }
    return NextResponse.json({ rules: data ?? [] });
  } catch (error) {
    console.error("[outlet-order-yield-rules] GET failed", error);
    return NextResponse.json({ error: "Unable to load yield rules" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const outletId = typeof body.outlet_id === "string" ? body.outlet_id.trim() : "";
    if (!outletId) {
      return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
    }
    const supabase = getServiceClient();
    const { error: insertError } = await supabase.from("outlet_order_yield_rules").insert([
      {
        outlet_id: outletId,
        finished_item_id: body.finished_item_id,
        ingredient_item_id: body.ingredient_item_id,
        grams_per_finished_unit: body.grams_per_finished_unit ?? null,
        qty_per_finished_unit: body.qty_per_finished_unit ?? null,
        uom: body.uom ?? "each",
        active: true,
      },
    ]);
    if (insertError) {
      if (insertError.message.includes("outlet_order_yield_rules")) {
        return NextResponse.json(
          { error: "Run supabase/scripts/outlet_stocktake_portal_system.sql first" },
          { status: 503 }
        );
      }
      throw insertError;
    }
    const { data, error } = await supabase
      .from("outlet_order_yield_rules")
      .select("*")
      .eq("outlet_id", outletId)
      .eq("active", true);
    if (error) throw error;
    return NextResponse.json({ rules: data ?? [] });
  } catch (error) {
    console.error("[outlet-order-yield-rules] POST failed", error);
    return NextResponse.json({ error: "Unable to save yield rule" }, { status: 500 });
  }
}
