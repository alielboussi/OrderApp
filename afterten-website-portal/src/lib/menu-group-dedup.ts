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
