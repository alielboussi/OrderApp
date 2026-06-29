import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const warehouseId = typeof body.warehouse_id === "string" ? body.warehouse_id.trim() : "";
    const periodId = typeof body.stock_period_id === "string" ? body.stock_period_id.trim() : "";
    const itemId = typeof body.item_id === "string" ? body.item_id.trim() : "";
    const variantKey = typeof body.variant_key === "string" ? body.variant_key.trim() || "base" : "base";

    if (!warehouseId || !periodId || !itemId) {
      return NextResponse.json({ error: "warehouse_id, stock_period_id, and item_id are required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const patch: Record<string, unknown> = {
      warehouse_id: warehouseId,
      stock_period_id: periodId,
      item_id: itemId,
      variant_key: variantKey,
      portal_source_of_truth: true,
      updated_at: new Date().toISOString(),
    };
    if (body.portal_opening_override !== undefined && body.portal_opening_override !== null) {
      patch.portal_opening_override = Number(body.portal_opening_override);
    }
    if (body.portal_closing_override !== undefined && body.portal_closing_override !== null) {
      patch.portal_closing_override = Number(body.portal_closing_override);
    }

    const { data: periodRow } = await supabase
      .from("warehouse_stock_periods")
      .select("id,outlet_id")
      .eq("id", periodId)
      .maybeSingle();

    const { error } = await supabase.from("outlet_warehouse_period_variances").upsert(
      [
        {
          ...patch,
          outlet_id: periodRow?.outlet_id ?? null,
        },
      ],
      { onConflict: "stock_period_id,item_id,variant_key" }
    );

    if (error) {
      if (error.message.includes("outlet_warehouse_period_variances")) {
        return NextResponse.json(
          { error: "Run supabase/scripts/outlet_stocktake_portal_system.sql first" },
          { status: 503 }
        );
      }
      throw error;
    }

    await supabase
      .from("outlet_warehouse_period_summaries")
      .update({ portal_source_of_truth: true, updated_at: new Date().toISOString() })
      .eq("warehouse_id", warehouseId)
      .eq("stock_period_id", periodId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[outlet-stocktake-corrections] PUT failed", error);
    return NextResponse.json({ error: "Unable to save correction" }, { status: 500 });
  }
}
