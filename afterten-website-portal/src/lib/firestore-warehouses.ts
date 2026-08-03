import { getFirestoreDb } from "@/lib/firebase-server";
import type { Warehouse } from "@/types/warehouse";

type WarehouseRecord = {
  id: string;
  name: string | null;
  parent_warehouse_id: string | null;
  active: boolean | null;
};

function mapWarehouse(record: WarehouseRecord): Warehouse {
  return {
    id: record.id,
    name: record.name ?? "Warehouse",
    parent_warehouse_id: record.parent_warehouse_id,
    active: record.active ?? false,
  };
}

export async function listFirestoreWarehouses(options?: {
  includeInactive?: boolean;
  lockedIds?: string[];
}): Promise<Warehouse[]> {
  const db = getFirestoreDb();
  const snapshot = await db.collection("warehouses").get();
  const lockedIds = new Set((options?.lockedIds ?? []).filter(Boolean));
  const includeInactive = options?.includeInactive === true;

  const byId = new Map<string, WarehouseRecord>();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    byId.set(doc.id, {
      id: doc.id,
      name: typeof data.name === "string" ? data.name : null,
      parent_warehouse_id:
        typeof data.parent_warehouse_id === "string" ? data.parent_warehouse_id : null,
      active: data.active !== false,
    });
  }

  for (const lockedId of lockedIds) {
    if (byId.has(lockedId)) continue;
    const snap = await db.collection("warehouses").doc(lockedId).get();
    if (!snap.exists) continue;
    const data = snap.data() ?? {};
    byId.set(lockedId, {
      id: lockedId,
      name: typeof data.name === "string" ? data.name : null,
      parent_warehouse_id:
        typeof data.parent_warehouse_id === "string" ? data.parent_warehouse_id : null,
      active: data.active !== false,
    });
  }

  return Array.from(byId.values())
    .filter((row) => includeInactive || row.active !== false || lockedIds.has(row.id))
    .map(mapWarehouse)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }));
}

export async function listFirestoreOutletWarehouseIds(outletId?: string | null): Promise<string[]> {
  const db = getFirestoreDb();
  let query: FirebaseFirestore.Query = db.collection("outlet_warehouses");
  if (outletId) {
    query = query.where("outlet_id", "==", outletId);
  }
  const snapshot = await query.get();
  const ids = snapshot.docs
    .map((doc) => doc.data().warehouse_id)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (!outletId) {
    const outlets = await db.collection("outlets").get();
    for (const doc of outlets.docs) {
      const warehouseIds = doc.data().warehouseIds;
      if (Array.isArray(warehouseIds)) {
        for (const id of warehouseIds) {
          if (typeof id === "string" && id.trim()) ids.push(id);
        }
      }
    }
  }

  return Array.from(new Set(ids));
}

export function filterFirestoreWarehousesByScope(
  warehouses: Warehouse[],
  outletWarehouseIds: Set<string>,
): Warehouse[] {
  return warehouses.filter((warehouse) => outletWarehouseIds.has(warehouse.id));
}
