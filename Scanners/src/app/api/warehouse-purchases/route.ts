import { NextRequest, NextResponse } from "next/server";
import {
  fetchReceiveMovements,
  filterStockMovements,
  normalizeStockMovement,
  resolvePurchasesApiToken,
  type StockMovementRow,
} from "@/lib/afterten-stock-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const token = resolvePurchasesApiToken(req.headers.get("x-afterten-token"));
    if (!token) {
      return NextResponse.json(
        { error: "Afterten_Purchases_Api_Token is missing" },
        { status: 500 },
      );
    }

    const url = new URL(req.url);
    const warehouseName = url.searchParams.get("warehouseName")?.trim() || null;
    const startDate = url.searchParams.get("startDate")?.trim() || null;
    const endDate = url.searchParams.get("endDate")?.trim() || null;
    const timeFrom = url.searchParams.get("timeFrom")?.trim() || null;
    const timeTo = url.searchParams.get("timeTo")?.trim() || null;
    const productSearch = url.searchParams.get("productSearch")?.trim() || null;

    const rawItems = await fetchReceiveMovements(token);
    const movements = rawItems
      .map((item) => normalizeStockMovement(item))
      .filter((row): row is StockMovementRow => Boolean(row))
      .sort((a, b) => {
        const at = a.movement_at ? Date.parse(a.movement_at) : 0;
        const bt = b.movement_at ? Date.parse(b.movement_at) : 0;
        return bt - at;
      });

    const purchases = filterStockMovements(movements, {
      warehouseName,
      startDate,
      endDate,
      timeFrom,
      timeTo,
      productSearch,
    });

    return NextResponse.json({
      source: "afterten_stock_api",
      source_url: "https://afterten-stock-api-896827614552.us-central1.run.app/stock/movements?type=receive",
      purchases,
      total: purchases.length,
    });
  } catch (error) {
    console.error("warehouse-purchases api failed", error);
    const message = error instanceof Error ? error.message : "Unable to load warehouse purchases";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
