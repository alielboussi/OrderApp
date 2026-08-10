import { NextRequest, NextResponse } from "next/server";

import { buildAcceptedOutletOrdersExport } from "@/lib/outlet-orders-accepted-export";
import { requireOutletOrdersApiBearer } from "@/lib/outlet-orders-api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requireOutletOrdersApiBearer(request);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date")?.trim();
    const outletId = url.searchParams.get("outlet_id")?.trim() || null;

    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD when provided" }, { status: 400 });
    }

    const payload = await buildAcceptedOutletOrdersExport({
      date: dateParam || null,
      outletId,
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[outlet-orders/accepted] GET failed", error);
    return NextResponse.json({ error: "Unable to load accepted outlet orders" }, { status: 500 });
  }
}
