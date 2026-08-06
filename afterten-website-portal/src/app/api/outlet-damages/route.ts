import { NextRequest, NextResponse } from "next/server";
import { listFirestoreDamageReports } from "@/lib/firestore-damage-reports";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date")?.trim();
    const outletId = url.searchParams.get("outlet_id")?.trim() || null;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
    }

    const { reports } = await listFirestoreDamageReports({ date, outletId });
    return NextResponse.json({ reports, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[outlet-damages] GET failed", error);
    return NextResponse.json({ error: "Unable to load damage reports" }, { status: 500 });
  }
}
