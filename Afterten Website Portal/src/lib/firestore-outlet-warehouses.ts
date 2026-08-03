import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";
import {
  isOutletDeductionWarehouse,
  isPosMiddlewareOutlet,
  outletCandidateFromLink,
  outletWarehouseLabel,
} from "@/lib/outletScope";

export type OutletWarehouseLink = {
  outlet_id: string;
  outlet_name: string;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_scope: string | null;
  display_name: string;
};

function isSellingOutletWarehouseLink(row: {
  outlet_id: string;
  warehouse_id: string;
  outlet_name: string;
  warehouse_name: string;
  warehouse_scope: string | null;
  outlet: { id: string; name: string | null; channel?: string | null; has_pos_middleware?: boolean | null } | null;
  warehouse: { id: string; name: string | null; warehouse_scope?: string | null } | null;
}): boolean {
  if (!isPosMiddlewareOutlet(outletCandidateFromLink(row))) return false;
  return isOutletDeductionWarehouse({
    name: row.warehouse?.name ?? row.warehouse_name,
    warehouse_scope: row.warehouse?.warehouse_scope ?? row.warehouse_scope,
  });
}

export async function listFirestoreOutletWarehouseLinks(options?: {
  outletId?: string | null;
  scope?: string | null;
}): Promise<OutletWarehouseLink[]> {
  const db = getFirestoreDb();
  const outletId = options?.outletId?.trim() || null;
  const scope = options?.scope?.trim().toLowerCase() || null;

  let query: FirebaseFirestore.Query = db.collection("outlet_warehouses");
  if (outletId) {
    query = query.where("outlet_id", "==", outletId);
  }
  const linkSnap = await query.get();

  const [outletsSnap, warehousesSnap] = await Promise.all([
    db.collection("outlets").get(),
    db.collection("warehouses").get(),
  ]);

  const outletMap = new Map<string, { id: string; name: string | null; channel: string | null; has_pos_middleware: boolean | null }>();
  for (const doc of outletsSnap.docs) {
    const data = doc.data();
    outletMap.set(doc.id, {
      id: doc.id,
      name: typeof data.name === "string" ? data.name : null,
      channel: null,
      has_pos_middleware: data.hasPosMiddleware === true,
    });
  }

  const warehouseMap = new Map<string, { id: string; name: string | null; warehouse_scope: string | null }>();
  for (const doc of warehousesSnap.docs) {
    const data = doc.data();
    warehouseMap.set(doc.id, {
      id: doc.id,
      name: typeof data.name === "string" ? data.name : null,
      warehouse_scope: typeof data.warehouse_scope === "string" ? data.warehouse_scope : null,
    });
  }

  let links = linkSnap.docs
    .map((doc) => {
      const data = doc.data();
      const oId = typeof data.outlet_id === "string" ? data.outlet_id : "";
      const wId = typeof data.warehouse_id === "string" ? data.warehouse_id : "";
      const outlet = outletMap.get(oId) ?? null;
      const warehouse = warehouseMap.get(wId) ?? null;
      return {
        outlet_id: oId,
        outlet_name: outlet?.name ?? "Outlet",
        warehouse_id: wId,
        warehouse_name: warehouse?.name ?? "Warehouse",
        warehouse_scope: warehouse?.warehouse_scope ?? null,
        outlet,
        warehouse,
      };
    })
    .filter((row) => row.outlet_id && row.warehouse_id);

  if (scope === "outlet") {
    links = links.filter((row) => isSellingOutletWarehouseLink(row));
  }

  links.sort((a, b) =>
    (a.outlet_name ?? "").localeCompare(b.outlet_name ?? "", undefined, { sensitivity: "base" }),
  );

  return links.map((row) => ({
    outlet_id: row.outlet_id,
    outlet_name: row.outlet_name,
    warehouse_id: row.warehouse_id,
    warehouse_name: row.warehouse_name,
    warehouse_scope: row.warehouse_scope,
    display_name: outletWarehouseLabel(row, links),
  }));
}

export async function listFirestoreWarehouseIdsForOutlets(outletIds: string[]): Promise<string[]> {
  if (outletIds.length === 0) return [];
  const links = await listFirestoreOutletWarehouseLinks();
  const outletSet = new Set(outletIds);
  return Array.from(
    new Set(links.filter((link) => outletSet.has(link.outlet_id)).map((link) => link.warehouse_id)),
  );
}
