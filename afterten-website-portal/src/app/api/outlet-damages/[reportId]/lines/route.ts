import { NextResponse } from "next/server";
import { listFirestoreDamageReportLines } from "@/lib/firestore-damage-reports";

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

    const lines = await listFirestoreDamageReportLines(reportId);
    return NextResponse.json({ lines, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[outlet-damages/lines] GET failed", error);
    return NextResponse.json({ error: "Unable to load damage report lines" }, { status: 500 });
  }
}
