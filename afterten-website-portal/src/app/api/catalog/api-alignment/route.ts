import { NextResponse } from "next/server";
import { getCatalogApiAlignment } from "@/lib/catalog-api-alignment";
import { requireWarehouseAuth } from "@/lib/warehouse-api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const alignment = await getCatalogApiAlignment();
    return NextResponse.json({ alignment });
  } catch (error) {
    console.error("[catalog/api-alignment] GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load catalog API alignment" },
      { status: 500 },
    );
  }
}
