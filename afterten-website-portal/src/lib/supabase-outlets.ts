import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  middlewareSalesApiProfileForOutletId,
  MIDDLEWARE_SALES_API_PATHS,
} from "@/lib/outletScope";
import type { FirestoreOutletListItem } from "@/lib/firestore-outlets";

export async function listSupabaseOutlets(): Promise<FirestoreOutletListItem[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("outlets")
    .select("id,name,code,active,channel,has_pos_middleware,default_sales_warehouse_id,middleware_sales_api_profile");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const id = String(row.id);
    const profile =
      typeof row.middleware_sales_api_profile === "string" && row.middleware_sales_api_profile.trim()
        ? row.middleware_sales_api_profile.trim()
        : middlewareSalesApiProfileForOutletId(id);
    return {
      id,
      name: String(row.name ?? "Outlet").trim(),
      code: typeof row.code === "string" ? row.code : null,
      active: row.active !== false,
      channel: typeof row.channel === "string" ? row.channel : null,
      has_pos_middleware: row.has_pos_middleware === true,
      default_sales_warehouse_id:
        typeof row.default_sales_warehouse_id === "string" ? row.default_sales_warehouse_id : null,
      middleware_sales_api_profile: profile,
      middleware_sales_api_path: profile ? MIDDLEWARE_SALES_API_PATHS[profile as keyof typeof MIDDLEWARE_SALES_API_PATHS] ?? null : null,
    };
  });
}

export async function updateSupabaseOutletDefaultWarehouse(
  updates: Array<{ id: string; default_sales_warehouse_id: string | null }>,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  let count = 0;

  for (const entry of updates) {
    const { data: existing, error: lookupError } = await supabase
      .from("outlets")
      .select("id")
      .eq("id", entry.id)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!existing) continue;

    const { error: updateError } = await supabase
      .from("outlets")
      .update({
        default_sales_warehouse_id: entry.default_sales_warehouse_id,
        updated_at: now,
      })
      .eq("id", entry.id);
    if (updateError) throw new Error(updateError.message);

    if (entry.default_sales_warehouse_id) {
      const { error: linkError } = await supabase.from("outlet_warehouses").upsert(
        {
          outlet_id: entry.id,
          warehouse_id: entry.default_sales_warehouse_id,
        },
        { onConflict: "outlet_id,warehouse_id" },
      );
      if (linkError) throw new Error(linkError.message);
    }

    count += 1;
  }

  return count;
}
