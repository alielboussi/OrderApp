import { NextRequest, NextResponse } from "next/server";
import { ensureFirebaseAdmin, getFirebaseStorageBucket } from "@/lib/firebase-server";
import { getFirestoreDamageReportById } from "@/lib/firestore-damage-reports";

export const dynamic = "force-dynamic";

function inlineDataUrl(data?: string | null): string | undefined {
  const trimmed = data?.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("data:") ? trimmed : `data:image/png;base64,${trimmed}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await context.params;
    const role = new URL(request.url).searchParams.get("role")?.trim().toLowerCase();
    if (!reportId) {
      return NextResponse.json({ error: "reportId is required" }, { status: 400 });
    }
    if (role !== "driver" && role !== "offloader") {
      return NextResponse.json({ error: "role must be driver or offloader" }, { status: 400 });
    }

    const report = await getFirestoreDamageReportById(reportId);
    if (!report) {
      return NextResponse.json({ error: "Damage report not found" }, { status: 404 });
    }

    const inline =
      role === "driver"
        ? inlineDataUrl(report.driver_signature_data)
        : inlineDataUrl(report.offloader_signature_data);
    if (inline) {
      return NextResponse.json({ data_url: inline });
    }

    const path =
      role === "driver" ? report.driver_signature_path?.trim() : report.offloader_signature_path?.trim();
    if (!path) {
      return NextResponse.json({ error: "Signature not available" }, { status: 404 });
    }

    ensureFirebaseAdmin();
    const [signedUrl] = await getFirebaseStorageBucket().file(path).getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });
    return NextResponse.json({ signed_url: signedUrl });
  } catch (error) {
    console.error("[outlet-damages/signature] GET failed", error);
    return NextResponse.json({ error: "Unable to load damage signature" }, { status: 500 });
  }
}
