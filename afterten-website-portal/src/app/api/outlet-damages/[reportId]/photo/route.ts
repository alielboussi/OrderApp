import { NextRequest, NextResponse } from "next/server";
import { ensureFirebaseAdmin, getFirebaseStorageBucket, getFirestoreDb } from "@/lib/firebase-server";

export const dynamic = "force-dynamic";

function inlineDataUrl(data?: string | null): string | undefined {
  const trimmed = data?.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("data:") ? trimmed : `data:image/jpeg;base64,${trimmed}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await context.params;
    if (!reportId) {
      return NextResponse.json({ error: "reportId is required" }, { status: 400 });
    }

    const snap = await getFirestoreDb().collection("outlet_damage_reports").doc(reportId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Damage report not found" }, { status: 404 });
    }
    const data = snap.data() as Record<string, unknown>;
    const inline = inlineDataUrl(data.photoData as string | null | undefined);
    if (inline) {
      return NextResponse.json({ data_url: inline });
    }

    const photoPath = String(data.photoPath ?? "").trim();
    if (!photoPath) {
      return NextResponse.json({ error: "Photo not available" }, { status: 404 });
    }

    ensureFirebaseAdmin();
    const [signedUrl] = await getFirebaseStorageBucket().file(photoPath).getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });
    return NextResponse.json({ signed_url: signedUrl });
  } catch (error) {
    console.error("[outlet-damages/photo] GET failed", error);
    return NextResponse.json({ error: "Unable to load damage photo" }, { status: 500 });
  }
}
