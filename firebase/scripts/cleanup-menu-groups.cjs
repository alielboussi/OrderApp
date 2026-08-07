/**
 * Remove duplicate/inactive menu groups and migrate portal UUID groups to MintPOS doc ids.
 *
 *   node firebase/scripts/cleanup-menu-groups.cjs
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
const db = admin.firestore();

function nowIso() {
  return new Date().toISOString();
}

function resolvePosMenuGroupId(group) {
  for (const value of [group.pos_menu_group_id, group.posMenuGroupId]) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value);
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

function isMintPosMenuGroup(group) {
  const posId = resolvePosMenuGroupId(group);
  if (posId == null) return false;
  return String(group.id ?? "").trim() === String(posId);
}

function isMenuGroupActive(group) {
  return group.active !== false;
}

function pickKeeper(set, itemCounts) {
  return [...set].sort((a, b) => {
    const aMintPosActive = isMintPosMenuGroup(a) && isMenuGroupActive(a) ? 1 : 0;
    const bMintPosActive = isMintPosMenuGroup(b) && isMenuGroupActive(b) ? 1 : 0;
    if (aMintPosActive !== bMintPosActive) return bMintPosActive - aMintPosActive;
    const aActive = isMenuGroupActive(a) ? 1 : 0;
    const bActive = isMenuGroupActive(b) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const aMintPos = isMintPosMenuGroup(a) ? 1 : 0;
    const bMintPos = isMintPosMenuGroup(b) ? 1 : 0;
    if (aMintPos !== bMintPos) return bMintPos - aMintPos;
    const countDiff = (itemCounts.get(b.id) ?? 0) - (itemCounts.get(a.id) ?? 0);
    if (countDiff !== 0) return countDiff;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  })[0];
}

async function relinkItems(fromId, toId) {
  const snap = await db.collection("catalog_items").where("menu_group_id", "==", fromId).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.set(doc.ref, { menu_group_id: toId, updated_at: nowIso() }, { merge: true }));
  await batch.commit();
  return snap.size;
}

async function clearItems(groupId) {
  const snap = await db.collection("catalog_items").where("menu_group_id", "==", groupId).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.set(doc.ref, { menu_group_id: null, updated_at: nowIso() }, { merge: true }));
  await batch.commit();
  return snap.size;
}

async function loadGroups() {
  const [groupsSnap, itemsSnap] = await Promise.all([
    db.collection("catalog_menu_groups").get(),
    db.collection("catalog_items").select("menu_group_id").get(),
  ]);
  const rawById = new Map();
  const groups = groupsSnap.docs.map((doc) => {
    const data = doc.data();
    rawById.set(doc.id, data);
    return {
      id: doc.id,
      name: String(data.name ?? ""),
      pos_menu_group_id: resolvePosMenuGroupId({ id: doc.id, ...data }),
      active: data.active === false ? false : true,
      created_at: typeof data.created_at === "string" ? data.created_at : null,
      sort_order: typeof data.sort_order === "number" ? data.sort_order : null,
      raw: data,
    };
  });
  const itemCounts = new Map();
  for (const doc of itemsSnap.docs) {
    const groupId = doc.get("menu_group_id");
    if (typeof groupId === "string" && groupId) {
      itemCounts.set(groupId, (itemCounts.get(groupId) ?? 0) + 1);
    }
  }
  return { groups, itemCounts, rawById };
}

async function main() {
  let { groups, itemCounts, rawById } = await loadGroups();
  let removed = 0;
  let migrated = 0;
  let relinked = 0;
  let inactiveDeleted = 0;

  const byPos = new Map();
  for (const group of groups) {
    const posId = group.pos_menu_group_id;
    if (!posId) continue;
    const bucket = byPos.get(posId) ?? [];
    bucket.push(group);
    byPos.set(posId, bucket);
  }

  for (const set of byPos.values()) {
    if (set.length <= 1) continue;
    const keeper = pickKeeper(set, itemCounts);
    for (const loser of set.filter((g) => g.id !== keeper.id)) {
      relinked += await relinkItems(loser.id, keeper.id);
      await db.collection("catalog_menu_groups").doc(loser.id).delete();
      removed += 1;
      console.log(`Removed duplicate ${loser.name} (${loser.id}) -> ${keeper.id}`);
    }
  }

  ({ groups, itemCounts, rawById } = await loadGroups());
  for (const group of groups) {
    const posId = group.pos_menu_group_id;
    if (!posId) continue;
    const targetId = String(posId);
    if (group.id === targetId) continue;
    const targetSnap = await db.collection("catalog_menu_groups").doc(targetId).get();
    if (targetSnap.exists) continue;
    if (!isMenuGroupActive(group)) continue;

    await db.collection("catalog_menu_groups").doc(targetId).set(
      {
        name: group.name,
        pos_menu_group_id: posId,
        posMenuGroupId: posId,
        active: true,
        sort_order: group.sort_order ?? posId,
        created_at: group.raw.created_at ?? nowIso(),
        updated_at: nowIso(),
        migrated_from: group.id,
      },
      { merge: true },
    );
    relinked += await relinkItems(group.id, targetId);
    await db.collection("catalog_menu_groups").doc(group.id).delete();
    migrated += 1;
    console.log(`Migrated ${group.name} ${group.id} -> ${targetId}`);
  }

  ({ groups, itemCounts } = await loadGroups());
  const keeperByPosId = new Map();
  for (const group of groups) {
    const posId = group.pos_menu_group_id;
    if (!posId || !isMenuGroupActive(group)) continue;
    if (!keeperByPosId.has(posId) || isMintPosMenuGroup(group)) keeperByPosId.set(posId, group.id);
  }

  for (const group of groups) {
    if (group.active !== false) continue;
    const keeperId = keeperByPosId.get(group.pos_menu_group_id) ?? null;
    if (keeperId && keeperId !== group.id) {
      relinked += await relinkItems(group.id, keeperId);
    } else {
      await clearItems(group.id);
    }
    await db.collection("catalog_menu_groups").doc(group.id).delete();
    inactiveDeleted += 1;
    console.log(`Deleted inactive ${group.name} (${group.id})`);
  }

  const finalSnap = await db.collection("catalog_menu_groups").get();
  for (const doc of finalSnap.docs) {
    const data = doc.data();
    if (data.active === false) continue;
    if (!isMintPosMenuGroup({ id: doc.id, ...data })) continue;
    if (data.active === true) continue;
    await db.collection("catalog_menu_groups").doc(doc.id).set({ active: true, updated_at: nowIso() }, { merge: true });
  }

  console.log(`Done. removed=${removed} migrated=${migrated} inactive_deleted=${inactiveDeleted} relinked=${relinked} remaining=${finalSnap.size}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
