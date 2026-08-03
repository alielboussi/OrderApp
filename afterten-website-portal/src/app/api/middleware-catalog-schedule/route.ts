import { NextResponse } from "next/server";
import {
  getGlobalCatalogSyncSchedule,
  normalizeFutureScheduledAt,
  upsertGlobalCatalogSyncSchedule,
} from "@/lib/catalogSyncSchedule";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import {
  getFirestoreGlobalCatalogSyncSchedule,
  upsertFirestoreGlobalCatalogSyncSchedule,
} from "@/lib/firestore-catalog-sync-schedule";

export async function GET() {
  try {
    if (useFirebaseBackend()) {
      const schedule = await getFirestoreGlobalCatalogSyncSchedule();
      return NextResponse.json({ schedule, cloud_backend: "firebase" });
    }

    const schedule = await getGlobalCatalogSyncSchedule();
    return NextResponse.json({ schedule });
  } catch (error) {
    console.error("[middleware-catalog-schedule] GET failed", error);
    return NextResponse.json({ error: "Unable to load middleware schedule" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const raw = typeof body?.scheduled_at === "string" ? body.scheduled_at : null;
    const normalized = normalizeFutureScheduledAt(raw);

    if (useFirebaseBackend()) {
      const saved = await upsertFirestoreGlobalCatalogSyncSchedule(normalized);
      return NextResponse.json({ schedule: saved, cloud_backend: "firebase" });
    }

    const saved = await upsertGlobalCatalogSyncSchedule(normalized);
    return NextResponse.json({ schedule: saved });
  } catch (error) {
    console.error("[middleware-catalog-schedule] PUT failed", error);
    const message = error instanceof Error ? error.message : "Unable to save middleware schedule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
