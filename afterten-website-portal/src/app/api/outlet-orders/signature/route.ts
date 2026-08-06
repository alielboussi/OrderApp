import { NextRequest, NextResponse } from "next/server";
import { ensureFirebaseAdmin, getFirebaseStorageBucket } from "@/lib/firebase-server";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get("path")?.trim();
    if (!path) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    ensureFirebaseAdmin();
    const [signedUrl] = await getFirebaseStorageBucket()
  .file(path)
  .getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000,
  });
return NextResponse.json({ signed_url: signedUrl, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[outlet-orders/signature] GET failed", error);
    return NextResponse.json({ error: "Unable to sign signature URL" }, { status: 500 });
  }
}
