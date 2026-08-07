export type MenuGroupDedupRow = {
  id: string;
  name: string;
  pos_menu_group_id: number | null;
  active?: boolean | null;
  sort_order?: number | null;
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
  migrated: Array<{ from_id: string; to_id: string; name: string; pos_menu_group_id: number }>;
  inactive_deleted: number;
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

import { isMenuGroupActive, isMintPosMenuGroup } from "@/lib/menu-group-pos";

export function pickMenuGroupKeeper(
  groups: MenuGroupDedupRow[],
  itemCounts: ReadonlyMap<string, number>,
): MenuGroupDedupRow {
  return [...groups].sort((a, b) => {
    const aExplicitActive = a.active === true ? 1 : 0;
    const bExplicitActive = b.active === true ? 1 : 0;
    if (aExplicitActive !== bExplicitActive) return bExplicitActive - aExplicitActive;

    const aActive = isMenuGroupActive(a) ? 1 : 0;
    const bActive = isMenuGroupActive(b) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;

    const aMintPos = isMintPosMenuGroup(a) ? 1 : 0;
    const bMintPos = isMintPosMenuGroup(b) ? 1 : 0;
    if (aMintPos !== bMintPos) return bMintPos - aMintPos;

    const countDiff = (itemCounts.get(b.id) ?? 0) - (itemCounts.get(a.id) ?? 0);
    if (countDiff !== 0) return countDiff;

    const nameDiff = a.name.trim().length - b.name.trim().length;
    if (nameDiff !== 0) return nameDiff;

    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  })[0];
}
