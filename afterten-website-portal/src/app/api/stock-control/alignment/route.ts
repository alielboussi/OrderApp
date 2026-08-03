import { NextRequest, NextResponse } from "next/server";
import { buildStockControlAlignmentReport } from "@/lib/stock-control-alignment";
import { requireWarehouseAuth } from "@/lib/warehouse-api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const report = await buildStockControlAlignmentReport();
    return NextResponse.json(report);
  } catch (error) {
    console.error("[stock-control/alignment] GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to build stock alignment report" },
      { status: 500 },
    );
  }
}
