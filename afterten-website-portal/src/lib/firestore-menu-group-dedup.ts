import { getFirestoreDb } from "@/lib/firebase-server";
import type { MenuGroupDedupRow, MenuGroupDedupResult } from "@/lib/menu-group-dedup";

export async function dedupeFirestoreMenuGroupsByPosId(): Promise<MenuGroupDedupResult> {
  const db = getFirestoreDb();
  const [groupsSnap, itemsSnap] = await Promise.all([
    db.collection("catalog_menu_groups").get(),
    db.collection("catalog_items").select("menu_group_id").get(),
  ]);

  const groups = groupsSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: String(data.name ?? ""),
      pos_menu_group_id: typeof data.pos_menu_group_id === "number" ? data.pos_menu_group_id : null,
      created_at: typeof data.created_at === "string" ? data.created_at : null,
    } satisfies MenuGroupDedupRow;
  });

  const itemCounts = new Map<string, number>();
  for (const doc of itemsSnap.docs) {
    const groupId = doc.data().menu_group_id;
    if (typeof groupId !== "string" || !groupId) continue;
    itemCounts.set(groupId, (itemCounts.get(groupId) ?? 0) + 1);
  }

  const duplicateSets = groups
    .reduce<Map<number, MenuGroupDedupRow[]>>((byPosId, group) => {
      const posId = group.pos_menu_group_id;
      if (typeof posId !== "number" || !Number.isFinite(posId) || posId <= 0) return byPosId;
      const bucket = byPosId.get(posId) ?? [];
      bucket.push(group);
      byPosId.set(posId, bucket);
      return byPosId;
    }, new Map())
    .values();

  const removed: MenuGroupDedupResult["removed"] = [];
  const kept: MenuGroupDedupResult["kept"] = [];
  let itemsRelinked = 0;

  for (const set of duplicateSets) {
    if (set.length <= 1) continue;

    const keeper = [...set].sort((a, b) => {
      const countDiff = (itemCounts.get(b.id) ?? 0) - (itemCounts.get(a.id) ?? 0);
      if (countDiff !== 0) return countDiff;
      const nameDiff = a.name.trim().length - b.name.trim().length;
      if (nameDiff !== 0) return nameDiff;
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    })[0];

    const losers = set.filter((group) => group.id !== keeper.id);
    if (!losers.length) continue;

    kept.push({
      id: keeper.id,
      name: keeper.name,
      pos_menu_group_id: keeper.pos_menu_group_id,
    });

    for (const loser of losers) {
      const itemsToRelink = await db
        .collection("catalog_items")
        .where("menu_group_id", "==", loser.id)
        .get();

      if (!itemsToRelink.empty) {
        const batch = db.batch();
        itemsToRelink.docs.forEach((doc) => {
          batch.set(doc.ref, { menu_group_id: keeper.id, updated_at: new Date().toISOString() }, { merge: true });
        });
        await batch.commit();
        itemsRelinked += itemsToRelink.size;
      }

      await db.collection("catalog_menu_groups").doc(loser.id).delete();

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
