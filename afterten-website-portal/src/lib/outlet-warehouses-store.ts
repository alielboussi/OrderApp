import "server-only";

import { isSupabaseBackend } from "@/lib/cloud-backend";
import {
  listFirestoreOutletWarehouseLinks,
  type OutletWarehouseLink,
} from "@/lib/firestore-outlet-warehouses";
import { listSupabaseOutletWarehouseLinks } from "@/lib/supabase-outlet-warehouses";

export type { OutletWarehouseLink };

export async function listOutletWarehouseLinks(options?: {
  outletId?: string | null;
  scope?: string | null;
}): Promise<OutletWarehouseLink[]> {
  if (isSupabaseBackend()) return listSupabaseOutletWarehouseLinks(options);
  return listFirestoreOutletWarehouseLinks(options);
}
