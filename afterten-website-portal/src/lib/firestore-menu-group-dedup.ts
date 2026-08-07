import { getFirestoreDb } from "@/lib/firebase-server";
import type { MenuGroupDedupRow, MenuGroupDedupResult } from "@/lib/menu-group-dedup";
import { pickMenuGroupKeeper } from "@/lib/menu-group-dedup";
import { isMenuGroupActive, isMintPosMenuGroup, resolvePosMenuGroupId } from "@/lib/menu-group-pos";

type MenuGroupRecord = MenuGroupDedupRow & {
  sort_order?: number | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

async function relinkMenuGroupItems(fromId: string, toId: string): Promise<number> {
  const db = getFirestoreDb();
  const itemsToRelink = await db.collection("catalog_items").where("menu_group_id", "==", fromId).get();
  if (itemsToRelink.empty) return 0;

  const batch = db.batch();
  itemsToRelink.docs.forEach((doc) => {
    batch.set(doc.ref, { menu_group_id: toId, updated_at: nowIso() }, { merge: true });
  });
  await batch.commit();
  return itemsToRelink.size;
}

async function clearMenuGroupItems(groupId: string): Promise<number> {
  const db = getFirestoreDb();
  const items = await db.collection("catalog_items").where("menu_group_id", "==", groupId).get();
  if (items.empty) return 0;

  const batch = db.batch();
  items.docs.forEach((doc) => {
    batch.set(doc.ref, { menu_group_id: null, updated_at: nowIso() }, { merge: true });
  });
  await batch.commit();
  return items.size;
}

async function loadMenuGroupRecords(): Promise<{
  groups: MenuGroupRecord[];
  itemCounts: Map<string, number>;
  rawById: Map<string, FirebaseFirestore.DocumentData>;
}> {
  const db = getFirestoreDb();
  const [groupsSnap, itemsSnap] = await Promise.all([
    db.collection("catalog_menu_groups").get(),
    db.collection("catalog_items").select("menu_group_id").get(),
  ]);

  const rawById = new Map<string, FirebaseFirestore.DocumentData>();
  const groups = groupsSnap.docs.map((doc) => {
    const data = doc.data();
    rawById.set(doc.id, data);
    const posMenuGroupId = resolvePosMenuGroupId({ id: doc.id, ...data });
    return {
      id: doc.id,
      name: String(data.name ?? ""),
      pos_menu_group_id: posMenuGroupId,
      active: data.active === false ? false : true,
      created_at: typeof data.created_at === "string" ? data.created_at : null,
      sort_order: typeof data.sort_order === "number" ? data.sort_order : null,
    } satisfies MenuGroupRecord;
  });

  const itemCounts = new Map<string, number>();
  for (const doc of itemsSnap.docs) {
    const groupId = doc.data().menu_group_id;
    if (typeof groupId !== "string" || !groupId) continue;
    itemCounts.set(groupId, (itemCounts.get(groupId) ?? 0) + 1);
  }

  return { groups, itemCounts, rawById };
}

export async function dedupeFirestoreMenuGroupsByPosId(): Promise<MenuGroupDedupResult> {
  return cleanupFirestoreMenuGroups();
}

export async function cleanupFirestoreMenuGroups(): Promise<MenuGroupDedupResult> {
  const db = getFirestoreDb();
  let { groups, itemCounts, rawById } = await loadMenuGroupRecords();

  const removed: MenuGroupDedupResult["removed"] = [];
  const kept: MenuGroupDedupResult["kept"] = [];
  const migrated: MenuGroupDedupResult["migrated"] = [];
  let itemsRelinked = 0;
  let inactiveDeleted = 0;

  const duplicateSets = groups
    .reduce<Map<number, MenuGroupRecord[]>>((byPosId, group) => {
      const posId = group.pos_menu_group_id;
      if (typeof posId !== "number" || !Number.isFinite(posId) || posId <= 0) return byPosId;
      const bucket = byPosId.get(posId) ?? [];
      bucket.push(group);
      byPosId.set(posId, bucket);
      return byPosId;
    }, new Map())
    .values();

  for (const set of duplicateSets) {
    if (set.length <= 1) continue;

    const keeper = pickMenuGroupKeeper(set, itemCounts);
    const losers = set.filter((group) => group.id !== keeper.id);
    if (!losers.length) continue;

    kept.push({
      id: keeper.id,
      name: keeper.name,
      pos_menu_group_id: keeper.pos_menu_group_id,
    });

    for (const loser of losers) {
      if (isMintPosMenuGroup(keeper) && !isMintPosMenuGroup(loser)) {
        const loserData = rawById.get(loser.id) ?? {};
        const keeperRef = db.collection("catalog_menu_groups").doc(keeper.id);
        await keeperRef.set(
          {
            name: String(loser.name ?? keeper.name).trim() || keeper.name,
            active: true,
            sort_order:
              typeof loser.sort_order === "number"
                ? loser.sort_order
                : typeof keeper.sort_order === "number"
                  ? keeper.sort_order
                  : keeper.pos_menu_group_id,
            updated_at: nowIso(),
          },
          { merge: true },
        );
      }

      itemsRelinked += await relinkMenuGroupItems(loser.id, keeper.id);
      await db.collection("catalog_menu_groups").doc(loser.id).delete();
      rawById.delete(loser.id);
      removed.push({
        id: loser.id,
        name: loser.name,
        pos_menu_group_id: loser.pos_menu_group_id,
        merged_into: keeper.id,
        merged_into_name: keeper.name,
      });
    }
  }

  ({ groups, itemCounts, rawById } = await loadMenuGroupRecords());

  for (const group of groups) {
    const posId = group.pos_menu_group_id;
    if (typeof posId !== "number" || !Number.isFinite(posId) || posId <= 0) continue;

    const targetId = String(posId);
    if (group.id === targetId) continue;

    const targetSnap = await db.collection("catalog_menu_groups").doc(targetId).get();
    if (targetSnap.exists) continue;
    if (!isMenuGroupActive(group)) continue;

    const sourceData = rawById.get(group.id) ?? {};
    const createdAt = typeof sourceData.created_at === "string" ? sourceData.created_at : nowIso();
    await db.collection("catalog_menu_groups").doc(targetId).set(
      {
        name: group.name,
        pos_menu_group_id: posId,
        posMenuGroupId: posId,
        active: true,
        sort_order: group.sort_order ?? posId,
        created_at: createdAt,
        updated_at: nowIso(),
        migrated_from: group.id,
      },
      { merge: true },
    );

    itemsRelinked += await relinkMenuGroupItems(group.id, targetId);
    await db.collection("catalog_menu_groups").doc(group.id).delete();

    migrated.push({
      from_id: group.id,
      to_id: targetId,
      name: group.name,
      pos_menu_group_id: posId,
    });
  }

  ({ groups, itemCounts, rawById } = await loadMenuGroupRecords());
  const keeperByPosId = new Map<number, string>();
  for (const group of groups) {
    const posId = group.pos_menu_group_id;
    if (typeof posId !== "number" || !Number.isFinite(posId) || posId <= 0) continue;
    if (!isMenuGroupActive(group)) continue;
    if (!keeperByPosId.has(posId) || isMintPosMenuGroup(group)) {
      keeperByPosId.set(posId, group.id);
    }
  }

  for (const group of groups) {
    if (group.active !== false) continue;

    const posId = group.pos_menu_group_id;
    const keeperId =
      typeof posId === "number" && keeperByPosId.has(posId) ? keeperByPosId.get(posId)! : null;

    if (!keeperId) {
      // Do not delete inactive-only groups that still have products assigned.
      if ((itemCounts.get(group.id) ?? 0) > 0) continue;
    }

    if (keeperId && keeperId !== group.id) {
      itemsRelinked += await relinkMenuGroupItems(group.id, keeperId);
    } else if (!keeperId) {
      await clearMenuGroupItems(group.id);
    }

    await db.collection("catalog_menu_groups").doc(group.id).delete();
    inactiveDeleted += 1;
    removed.push({
      id: group.id,
      name: group.name,
      pos_menu_group_id: group.pos_menu_group_id,
      merged_into: keeperId ?? "",
      merged_into_name: keeperId ? groups.find((row) => row.id === keeperId)?.name ?? "" : "",
    });
  }

  for (const doc of (await db.collection("catalog_menu_groups").get()).docs) {
    const data = doc.data();
    if (data.active === false) continue;
    if (!isMintPosMenuGroup({ id: doc.id, ...data })) continue;
    if (data.active === true) continue;
    await db.collection("catalog_menu_groups").doc(doc.id).set({ active: true, updated_at: nowIso() }, { merge: true });
  }

  return { removed, kept, items_relinked: itemsRelinked, migrated, inactive_deleted: inactiveDeleted };
}
