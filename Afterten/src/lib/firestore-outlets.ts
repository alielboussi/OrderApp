import { getFirestoreDb } from "@/lib/firebase-server";
import {
  isMiddlewareCatalogSyncOutlet,
  isPosMiddlewareOutlet,
  middlewareSalesApiProfileForOutletId,
  MIDDLEWARE_SALES_API_PATHS,
} from "@/lib/outletScope";
import { isHeartbeatMonitoredOutlet } from "@/app/Warehouse_Backoffice/middlewareMonitorShared";

export type FirestoreOutletListItem = {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
  channel: string | null;
  has_pos_middleware: boolean | null;
  default_sales_warehouse_id: string | null;
  middleware_sales_api_profile: string | null;
  middleware_sales_api_path: string | null;
};

export async function listFirestoreOutlets(): Promise<FirestoreOutletListItem[]> {
  const db = getFirestoreDb();
  const snapshot = await db.collection("outlets").get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const warehouseIds = Array.isArray(data.warehouseIds) ? data.warehouseIds : [];
    const profile = middlewareSalesApiProfileForOutletId(doc.id);
    return {
      id: doc.id,
      name: String(data.name ?? "Outlet").trim(),
      code: null,
      active: data.active !== false,
      channel: null,
      has_pos_middleware: data.hasPosMiddleware === true,
      default_sales_warehouse_id: typeof warehouseIds[0] === "string" ? warehouseIds[0] : null,
      middleware_sales_api_profile: profile,
      middleware_sales_api_path: profile ? MIDDLEWARE_SALES_API_PATHS[profile] : null,
    };
  });
}

export function filterFirestoreOutletsByScope(
  outlets: FirestoreOutletListItem[],
  scope: string | null,
): FirestoreOutletListItem[] {
  if (scope === "selling") {
    return outlets.filter((outlet) => isPosMiddlewareOutlet(outlet));
  }
  if (scope === "middleware" || scope === "catalog-sync") {
    return outlets.filter((outlet) => isMiddlewareCatalogSyncOutlet(outlet));
  }
  if (scope === "heartbeat") {
    return outlets.filter((outlet) => isHeartbeatMonitoredOutlet(outlet));
  }
  return outlets;
}
