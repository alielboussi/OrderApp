import { NextResponse } from "next/server";
import { getFirestoreMiddlewareStatus } from "@/lib/firestore-middleware-status";
import {
  type CatalogSyncEventRow,
  type HeartbeatRow,
  type OutletRow,
  isHeartbeatMonitoredOutlet,
  isPosCatalogSyncEvent,
  OFFLINE_MS,
} from "@/app/Warehouse_Backoffice/middlewareMonitorShared";

export async function GET() {
  try {
    return NextResponse.json(await getFirestoreMiddlewareStatus());
    
  } catch (error) {
    console.error("[middleware-status] GET failed", error);
    return NextResponse.json(
      {
        online_count: 0,
        offline_count: 0,
        outlets: [],
        cloud_backend: "firebase",
        error: "Unable to load middleware status",
        debug: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 200 },
    );
  }
}
