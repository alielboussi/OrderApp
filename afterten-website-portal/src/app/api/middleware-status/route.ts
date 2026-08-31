import { NextResponse } from "next/server";
import { cloudBackendMeta } from "@/lib/cloud-backend";
import { getMiddlewareStatus } from "@/lib/middleware-status-store";
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
    return NextResponse.json(await getMiddlewareStatus());
    
  } catch (error) {
    console.error("[middleware-status] GET failed", error);
    return NextResponse.json(
      {
        online_count: 0,
        offline_count: 0,
        outlets: [],
        ...cloudBackendMeta(),
        error: "Unable to load middleware status",
        debug: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 200 },
    );
  }
}
