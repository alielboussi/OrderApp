import "server-only";

import { isSupabaseBackend } from "@/lib/cloud-backend";
import {
  filterFirestoreWarehousesByScope,
  listFirestoreOutletWarehouseIds,
  listFirestoreWarehouses,
} from "@/lib/firestore-warehouses";
import { listSupabaseOutletWarehouseIds, listSupabaseWarehouses } from "@/lib/supabase-warehouses";
import type { Warehouse } from "@/types/warehouse";

export async function listWarehouses(options?: {
  includeInactive?: boolean;
  lockedIds?: string[];
}): Promise<Warehouse[]> {
  if (isSupabaseBackend()) return listSupabaseWarehouses(options);
  return listFirestoreWarehouses(options);
}

export async function listOutletWarehouseIds(outletId?: string | null): Promise<string[]> {
  if (isSupabaseBackend()) return listSupabaseOutletWarehouseIds(outletId);
  return listFirestoreOutletWarehouseIds(outletId);
}

export { filterFirestoreWarehousesByScope as filterWarehousesByScope };
