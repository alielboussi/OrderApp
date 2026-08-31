import "server-only";

import { isSupabaseBackend } from "@/lib/cloud-backend";
import {
  createFirestoreOrdersOutlet,
  filterFirestoreOutletsByScope,
  listFirestoreOutlets,
  updateFirestoreOutletDefaultWarehouse,
  type CreateOrdersOutletInput,
  type CreateOrdersOutletResult,
  type FirestoreOutletListItem,
} from "@/lib/firestore-outlets";
import { listSupabaseOutlets, updateSupabaseOutletDefaultWarehouse } from "@/lib/supabase-outlets";

export type { FirestoreOutletListItem as OutletListItem, CreateOrdersOutletInput, CreateOrdersOutletResult };

export async function listOutlets(): Promise<FirestoreOutletListItem[]> {
  if (isSupabaseBackend()) return listSupabaseOutlets();
  return listFirestoreOutlets();
}

export async function updateOutletDefaultWarehouse(
  updates: Array<{ id: string; default_sales_warehouse_id: string | null }>,
): Promise<number> {
  if (isSupabaseBackend()) return updateSupabaseOutletDefaultWarehouse(updates);
  return updateFirestoreOutletDefaultWarehouse(updates);
}

export { filterFirestoreOutletsByScope as filterOutletsByScope };

export async function createOrdersOutlet(
  input: CreateOrdersOutletInput,
): Promise<CreateOrdersOutletResult> {
  if (isSupabaseBackend()) {
    throw new Error(
      "Creating orders-app outlets on Supabase is not implemented yet. Use SQL or a provisioning script.",
    );
  }
  return createFirestoreOrdersOutlet(input);
}
