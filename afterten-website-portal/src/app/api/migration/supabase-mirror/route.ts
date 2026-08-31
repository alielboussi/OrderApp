import { NextResponse } from "next/server";

import { countFirestoreMirrorDocuments, listFirestoreMirrorDocuments } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Dev/migration helper — inspect imported Firestore mirror data in Supabase.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on the server.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const collectionPath = url.searchParams.get("collection")?.trim();
    const limit = Number(url.searchParams.get("limit") ?? "25");

    if (!collectionPath) {
      const total = await countFirestoreMirrorDocuments();
      return NextResponse.json({
        ok: true,
        message: "Pass ?collection=<firestore_collection_path> to list documents",
        firestore_mirror_total: total,
      });
    }

    const [total, rows] = await Promise.all([
      countFirestoreMirrorDocuments(collectionPath),
      listFirestoreMirrorDocuments({ collectionPath, limit }),
    ]);

    return NextResponse.json({
      ok: true,
      collection_path: collectionPath,
      total,
      rows,
    });
  } catch (error) {
    console.error("[migration/supabase-mirror] GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read Supabase mirror" },
      { status: 500 },
    );
  }
}
