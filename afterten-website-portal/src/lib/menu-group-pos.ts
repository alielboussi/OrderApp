export type MenuGroupLike = {
  id?: string | null;
  name?: string | null;
  pos_menu_group_id?: number | string | null;
  posMenuGroupId?: number | string | null;
  active?: boolean | null;
};

export type MintPosMenuGroupOption = {
  id: string;
  name: string;
  pos_menu_group_id: number;
};

export function resolvePosMenuGroupId(group: MenuGroupLike): number | null {
  for (const value of [group.pos_menu_group_id, group.posMenuGroupId]) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.trunc(value);
    }
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      const parsed = Number(value.trim());
      if (parsed > 0) return parsed;
    }
  }

  const id = String(group.id ?? "").trim();
  if (/^\d+$/.test(id)) {
    const parsed = Number(id);
    if (parsed > 0) return parsed;
  }

  return null;
}

/** MintPOS groups use the MintPOS numeric id as the Firestore document id. */
export function isMintPosMenuGroup(group: MenuGroupLike): boolean {
  const posId = resolvePosMenuGroupId(group);
  if (posId == null) return false;
  return String(group.id ?? "").trim() === String(posId);
}

export function isMenuGroupActive(group: MenuGroupLike): boolean {
  return group.active !== false;
}

export function listMintPosMenuGroupOptions(groups: MenuGroupLike[]): MintPosMenuGroupOption[] {
  const byPosId = new Map<number, MintPosMenuGroupOption>();

  for (const group of groups) {
    if (!isMintPosMenuGroup(group)) continue;
    if (group.active === false) continue;

    const posId = resolvePosMenuGroupId(group)!;
    const name = String(group.name ?? "").trim() || `Group ${posId}`;
    byPosId.set(posId, {
      id: String(posId),
      name,
      pos_menu_group_id: posId,
    });
  }

  return Array.from(byPosId.values()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export function cleanMintPosMenuGroupId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || !/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return String(parsed);
}
