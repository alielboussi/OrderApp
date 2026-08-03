import { NextRequest, NextResponse } from "next/server";
import { planStockCatalogCleanup, runStockCatalogCleanup } from "@/lib/stock-catalog-cleanup";
import { requireWarehouseAuth } from "@/lib/warehouse-api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const plan = await planStockCatalogCleanup();
    return NextResponse.json({ dry_run: true, plan });
  } catch (error) {
    console.error("[catalog/stock-api-cleanup] GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to build cleanup plan" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get("apply") !== "true";
    const result = await runStockCatalogCleanup({ dryRun, refreshOutletCatalogs: true });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[catalog/stock-api-cleanup] POST failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stock catalog cleanup failed" },
      { status: 500 },
    );
  }
}
