import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get("path")?.trim();
    if (!path) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    if (useFirebaseBackend()) {
      const [signedUrl] = await getStorage()
        .bucket()
        .file(path)
        .getSignedUrl({
          action: "read",
          expires: Date.now() + 60 * 60 * 1000,
        });
      return NextResponse.json({ signed_url: signedUrl, cloud_backend: "firebase" });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase.storage.from("signatures").createSignedUrl(path, 3600);
    if (error) throw error;

    return NextResponse.json({ signed_url: data?.signedUrl ?? null });
  } catch (error) {
    console.error("[outlet-orders/signature] GET failed", error);
    return NextResponse.json({ error: "Unable to sign signature URL" }, { status: 500 });
  }
}
