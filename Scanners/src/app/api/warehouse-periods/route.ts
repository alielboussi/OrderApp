import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

const MAX_LIMIT = 50;

type StockPeriodRow = {
  id: string;
  warehouse_id: string;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  stocktake_number: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const warehouseId = url.searchParams.get("warehouseId")?.trim();
    const limitRaw = url.searchParams.get("limit");
    const limitParsed = limitRaw ? Number(limitRaw) : Number.NaN;
    const limit = Number.isFinite(limitParsed)
      ? Math.min(Math.max(Math.floor(limitParsed), 1), MAX_LIMIT)
      : 20;

    if (!warehouseId) {
      return NextResponse.json({ periods: [] });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("warehouse_stock_periods")
      .select("id,warehouse_id,status,opened_at,closed_at,stocktake_number")
      .eq("warehouse_id", warehouseId)
      .order("opened_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ periods: (data ?? []) as StockPeriodRow[] });
  } catch (error) {
    console.error("warehouse-periods api failed", error);
    return NextResponse.json({ error: "Unable to load stock periods" }, { status: 500 });
  }
}
