import { NextRequest, NextResponse } from "next/server";
import {
  getLatestStockCatalogSyncReport,
  STOCK_CATALOG_SYNC_ENABLED,
  syncStockCatalogToPortal,
} from "@/lib/stock-catalog-sync";
import { requireWarehouseAuth } from "@/lib/warehouse-api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const report = await getLatestStockCatalogSyncReport();
    return NextResponse.json({
      enabled: STOCK_CATALOG_SYNC_ENABLED,
      report,
    });
  } catch (error) {
    console.error("[catalog/stock-api-sync] GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load stock catalog sync status" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  if (!STOCK_CATALOG_SYNC_ENABLED) {
    return NextResponse.json(
      {
        error:
          "Stock catalog sync is locked to prevent Firestore cost spikes. Unlock only in code for a one-off manual sync.",
        enabled: false,
      },
      { status: 403 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const deleteMissing =
      typeof body === "object" &&
      body !== null &&
      "delete_missing" in body &&
      body.delete_missing === true;
    const deactivateMissing =
      !deleteMissing &&
      typeof body === "object" &&
      body !== null &&
      "deactivate_missing" in body &&
      body.deactivate_missing === true;

    const report = await syncStockCatalogToPortal({ deactivateMissing, deleteMissing });
    return NextResponse.json({
      enabled: STOCK_CATALOG_SYNC_ENABLED,
      report,
    });
  } catch (error) {
    console.error("[catalog/stock-api-sync] POST failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stock catalog sync failed" },
      { status: 500 },
    );
  }
}
