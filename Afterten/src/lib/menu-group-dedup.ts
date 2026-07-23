import type { SupabaseClient } from "@supabase/supabase-js";

export type MenuGroupDedupRow = {
  id: string;
  name: string;
  pos_menu_group_id: number | null;
  created_at?: string | null;
};

export type MenuGroupDedupRemoved = {
  id: string;
  name: string;
  pos_menu_group_id: number | null;
  merged_into: string;
  merged_into_name: string;
};

export type MenuGroupDedupResult = {
  removed: MenuGroupDedupRemoved[];
  kept: Array<{ id: string; name: string; pos_menu_group_id: number | null }>;
  items_relinked: number;
};

export function findDuplicateMenuGroupSets(groups: MenuGroupDedupRow[]): MenuGroupDedupRow[][] {
  const byPosId = new Map<number, MenuGroupDedupRow[]>();

  for (const group of groups) {
    const posId = group.pos_menu_group_id;
    if (typeof posId !== "number" || !Number.isFinite(posId) || posId <= 0) continue;
    const bucket = byPosId.get(posId) ?? [];
    bucket.push(group);
    byPosId.set(posId, bucket);
  }

  return Array.from(byPosId.values()).filter((set) => set.length > 1);
}

export function pickMenuGroupKeeper(
  groups: MenuGroupDedupRow[],
  itemCounts: ReadonlyMap<string, number>
): MenuGroupDedupRow {
  return [...groups].sort((a, b) => {
    const countDiff = (itemCounts.get(b.id) ?? 0) - (itemCounts.get(a.id) ?? 0);
    if (countDiff !== 0) return countDiff;

    const nameDiff = a.name.trim().length - b.name.trim().length;
    if (nameDiff !== 0) return nameDiff;

    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  })[0];
}

async function loadItemCountsByGroup(supabase: SupabaseClient): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("menu_group_id")
    .not("menu_group_id", "is", null);
  if (error) throw error;

  for (const row of data ?? []) {
    const groupId = (row as { menu_group_id?: string | null }).menu_group_id;
    if (!groupId) continue;
    counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }

  return counts;
}

export async function dedupeMenuGroupsByPosId(supabase: SupabaseClient): Promise<MenuGroupDedupResult> {
  const { data: groupsData, error: groupsError } = await supabase
    .from("catalog_menu_groups")
    .select("id,name,pos_menu_group_id,created_at");
  if (groupsError) throw groupsError;

  const groups = (groupsData ?? []) as MenuGroupDedupRow[];
  const duplicateSets = findDuplicateMenuGroupSets(groups);
  if (!duplicateSets.length) {
    return { removed: [], kept: [], items_relinked: 0 };
  }

  const itemCounts = await loadItemCountsByGroup(supabase);
  const removed: MenuGroupDedupRemoved[] = [];
  const kept: MenuGroupDedupResult["kept"] = [];
  let itemsRelinked = 0;

  for (const set of duplicateSets) {
    const keeper = pickMenuGroupKeeper(set, itemCounts);
    const losers = set.filter((group) => group.id !== keeper.id);
    if (!losers.length) continue;

    kept.push({
      id: keeper.id,
      name: keeper.name,
      pos_menu_group_id: keeper.pos_menu_group_id,
    });

    for (const loser of losers) {
      const { data: relinkedRows, error: relinkError } = await supabase
        .from("catalog_items")
        .update({ menu_group_id: keeper.id })
        .eq("menu_group_id", loser.id)
        .select("id");
      if (relinkError) throw relinkError;

      itemsRelinked += relinkedRows?.length ?? 0;

      const { error: deleteError } = await supabase.from("catalog_menu_groups").delete().eq("id", loser.id);
      if (deleteError) throw deleteError;

      removed.push({
        id: loser.id,
        name: loser.name,
        pos_menu_group_id: loser.pos_menu_group_id,
        merged_into: keeper.id,
        merged_into_name: keeper.name,
      });
    }
  }

  return { removed, kept, items_relinked: itemsRelinked };
}
