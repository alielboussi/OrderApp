import { NextResponse } from "next/server";
import { getFirestoreDamageReportById } from "@/lib/firestore-damage-reports";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await context.params;
    if (!reportId) {
      return NextResponse.json({ error: "reportId is required" }, { status: 400 });
    }
    const report = await getFirestoreDamageReportById(reportId);
    if (!report) {
      return NextResponse.json({ error: "Damage report not found" }, { status: 404 });
    }
    return NextResponse.json({ report, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[outlet-damages/detail] GET failed", error);
    return NextResponse.json({ error: "Unable to load damage report" }, { status: 500 });
  }
}
