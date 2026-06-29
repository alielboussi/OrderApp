import type { SupabaseClient } from "@supabase/supabase-js";

export type MenuGroupSyncFields = {
  menu_group_id: string | null;
  menu_group_name: string | null;
  pos_menu_group_id: number | null;
};

export async function fetchMenuGroupSyncFields(
  supabase: SupabaseClient,
  menuGroupId: string | null | undefined
): Promise<MenuGroupSyncFields> {
  const empty: MenuGroupSyncFields = {
    menu_group_id: null,
    menu_group_name: null,
    pos_menu_group_id: null,
  };
  if (!menuGroupId) return empty;

  const { data, error } = await supabase
    .from("catalog_menu_groups")
    .select("id,name,pos_menu_group_id")
    .eq("id", menuGroupId)
    .maybeSingle();

  if (error || !data) return empty;

  return {
    menu_group_id: data.id,
    menu_group_name: data.name ?? null,
    pos_menu_group_id: typeof data.pos_menu_group_id === "number" ? data.pos_menu_group_id : null,
  };
}

export async function fetchMenuGroupSyncFieldsForItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<MenuGroupSyncFields> {
  const { data, error } = await supabase
    .from("catalog_items")
    .select("menu_group_id")
    .eq("id", itemId)
    .maybeSingle();

  if (error || !data?.menu_group_id) {
    return {
      menu_group_id: null,
      menu_group_name: null,
      pos_menu_group_id: null,
    };
  }

  return fetchMenuGroupSyncFields(supabase, data.menu_group_id);
}
