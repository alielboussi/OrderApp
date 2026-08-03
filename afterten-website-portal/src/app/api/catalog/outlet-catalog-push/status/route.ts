import { NextResponse } from "next/server";
import { getFirestoreCatalogSyncStatus } from "@/lib/firestore-catalog-sync";

function parseEventIds(request: Request): string[] {
  const url = new URL(request.url);
  const raw = url.searchParams.get("ids")?.trim() ?? "";
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

export async function GET(request: Request) {
  try {
    const eventIds = parseEventIds(request);
    if (!eventIds.length) {
      return NextResponse.json({ error: "ids query parameter is required" }, { status: 400 });
    }

    const status = await getFirestoreCatalogSyncStatus(eventIds);
return NextResponse.json({ ...status, cloud_backend: "firebase" });
    
  } catch (error) {
    console.error("[catalog/outlet-catalog-push/status] GET failed", error);
    return NextResponse.json({ error: "Unable to load catalog sync status" }, { status: 500 });
  }
}
