import { getServiceClient } from "@/lib/supabase-server";

export type AllowlistEntry = {
  id?: string;
  item_id: string;
  variant_id: string | null;
  allow_orders: boolean;
  allow_stocktake: boolean;
  item_name?: string;
  variant_name?: string | null;
  sku?: string | null;
  has_variations?: boolean;
};

export type OutletAuthAssignment = {
  outlet_id: string;
  auth_user_id: string;
  assignment_role: "orders" | "stocktake" | "both";
  active: boolean;
};

export async function fetchOutletCatalogAccess(outletId: string) {
  const supabase = getServiceClient();

  const [outletRes, itemsRes, variantsRes, allowlistRes, authRes] = await Promise.all([
    supabase.from("outlets").select("id,name,auth_user_id").eq("id", outletId).maybeSingle(),
    supabase
      .from("catalog_items")
      .select("id,name,sku,has_variations,active,image_url")
      .eq("active", true)
      .order("name"),
    supabase
      .from("catalog_variants")
      .select("id,item_id,name,sku,active")
      .eq("active", true)
      .order("name"),
    supabase
      .from("outlet_catalog_allowlist")
      .select("id,item_id,variant_id,allow_orders,allow_stocktake")
      .eq("outlet_id", outletId),
    supabase
      .from("outlet_auth_assignments")
      .select("outlet_id,auth_user_id,assignment_role,active")
      .eq("outlet_id", outletId)
      .eq("active", true),
  ]);

  if (outletRes.error) throw outletRes.error;
  if (!outletRes.data) throw new Error("Outlet not found");
  if (itemsRes.error) throw itemsRes.error;
  if (variantsRes.error) throw variantsRes.error;
  if (allowlistRes.error && !allowlistRes.error.message.includes("outlet_catalog_allowlist")) {
    throw allowlistRes.error;
  }
  if (authRes.error && !authRes.error.message.includes("outlet_auth_assignments")) {
    throw authRes.error;
  }

  const variantsByItem = new Map<string, typeof variantsRes.data>();
  for (const variant of variantsRes.data ?? []) {
    const list = variantsByItem.get(variant.item_id) ?? [];
    list.push(variant);
    variantsByItem.set(variant.item_id, list);
  }

  const allowByKey = new Map<string, AllowlistEntry>();
  for (const row of allowlistRes.data ?? []) {
    const key = `${row.item_id}:${row.variant_id ?? ""}`;
    allowByKey.set(key, row as AllowlistEntry);
  }

  const catalog = (itemsRes.data ?? []).map((item) => {
    const variants = variantsByItem.get(item.id) ?? [];
    const itemKey = `${item.id}:`;
    const itemAllow = allowByKey.get(itemKey);
    return {
      ...item,
      allow_orders: itemAllow?.allow_orders ?? false,
      allow_stocktake: itemAllow?.allow_stocktake ?? false,
      variants: variants.map((variant) => {
        const variantKey = `${item.id}:${variant.id}`;
        const variantAllow = allowByKey.get(variantKey);
        return {
          ...variant,
          allow_orders: variantAllow?.allow_orders ?? false,
          allow_stocktake: variantAllow?.allow_stocktake ?? false,
        };
      }),
    };
  });

  return {
    outlet: outletRes.data,
    catalog,
    auth_assignments: authRes.data ?? [],
    legacy_auth_user_id: outletRes.data.auth_user_id ?? null,
  };
}

export async function saveOutletCatalogAccess(input: {
  outlet_id: string;
  auth_user_id?: string | null;
  assignment_role?: "orders" | "stocktake" | "both";
  entries: Array<{
    item_id: string;
    variant_id?: string | null;
    allow_orders: boolean;
    allow_stocktake: boolean;
  }>;
}) {
  const supabase = getServiceClient();
  const outletId = input.outlet_id;

  const rows = input.entries
    .filter((entry) => entry.allow_orders || entry.allow_stocktake)
    .map((entry) => ({
      outlet_id: outletId,
      item_id: entry.item_id,
      variant_id: entry.variant_id ?? null,
      allow_orders: entry.allow_orders,
      allow_stocktake: entry.allow_stocktake,
      updated_at: new Date().toISOString(),
    }));

  const { error: deleteError } = await supabase.from("outlet_catalog_allowlist").delete().eq("outlet_id", outletId);
  if (deleteError && !deleteError.message.includes("outlet_catalog_allowlist")) throw deleteError;

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("outlet_catalog_allowlist").insert(rows);
    if (insertError) throw insertError;
  }

  if (input.auth_user_id) {
    const { error: authError } = await supabase.from("outlet_auth_assignments").upsert(
      [
        {
          outlet_id: outletId,
          auth_user_id: input.auth_user_id,
          assignment_role: input.assignment_role ?? "both",
          active: true,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "outlet_id,auth_user_id" }
    );
    if (authError && !authError.message.includes("outlet_auth_assignments")) throw authError;

    await supabase.from("outlets").update({ auth_user_id: input.auth_user_id }).eq("id", outletId);
  }

  return fetchOutletCatalogAccess(outletId);
}
