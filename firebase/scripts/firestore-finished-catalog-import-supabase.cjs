/**
 * Import finished catalog (items + variants + menu groups) from Firestore → Supabase.
 * Useful when MintPOS SQL is not reachable from this machine.
 *
 *   node firebase/scripts/firestore-finished-catalog-import-supabase.cjs
 *   node firebase/scripts/firestore-finished-catalog-import-supabase.cjs --dry-run
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const { createSupabaseAdmin } = require("./lib/supabase-client.cjs");

const BATCH_SIZE = 100;
const ITEM_KIND = "finished";

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  return { dryRun: argv.includes("--dry-run") };
}

function initFirestore() {
  const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));
  if (!admin.apps.length) {
    const keyPath =
      process.env.FIREBASE_CREDENTIALS_PATH?.trim() ||
      resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, "utf8"))),
    });
  }
  return admin.firestore();
}

function asNumber(value, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBool(value, fallback = true) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asText(value, fallback = null) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function mapMenuGroup(doc) {
  const data = doc.data();
  const posMenuGroupId = data.pos_menu_group_id ?? data.posMenuGroupId ?? null;
  return {
    id: doc.id,
    name: asText(data.name, `Group ${doc.id}`),
    pos_menu_group_id:
      typeof posMenuGroupId === "number"
        ? posMenuGroupId
        : /^\d+$/.test(String(posMenuGroupId ?? ""))
          ? Number(posMenuGroupId)
          : null,
    active: asBool(data.active, true),
    sort_order: asNumber(data.sort_order, 0),
    created_at: asText(data.created_at, nowIso()),
    updated_at: nowIso(),
  };
}

function mapItem(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    name: asText(data.name, "Unnamed"),
    sku: asText(data.sku),
    item_kind: ITEM_KIND,
    selling_price: data.selling_price == null ? null : asNumber(data.selling_price, 0),
    menu_group_id: asText(data.menu_group_id),
    active: asBool(data.active, true),
    has_variations: asBool(data.has_variations, false),
    outlet_order_visible: asBool(data.outlet_order_visible, true),
    consumption_uom: asText(data.consumption_uom, "each"),
    consumption_unit: asText(data.consumption_unit, "each"),
    purchase_pack_unit: asText(data.purchase_pack_unit, "each"),
    transfer_unit: asText(data.transfer_unit, "each"),
    transfer_quantity: asNumber(data.transfer_quantity, 1),
    units_per_purchase_pack: asNumber(data.units_per_purchase_pack, 1),
    cost: asNumber(data.cost, 0),
    image_url: asText(data.image_url),
    has_recipe: asBool(data.has_recipe, false),
    created_at: asText(data.created_at, nowIso()),
    updated_at: nowIso(),
  };
}

function mapVariant(doc, finishedItemIds) {
  const data = doc.data();
  const itemId = asText(data.item_id);
  if (!itemId || !finishedItemIds.has(itemId)) return null;
  const kind = asText(data.item_kind, ITEM_KIND).toLowerCase();
  if (kind !== ITEM_KIND && kind !== "product") return null;
  return {
    id: doc.id,
    item_id: itemId,
    name: asText(data.name, "Variant"),
    sku: asText(data.sku),
    item_kind: ITEM_KIND,
    selling_price: data.selling_price == null ? null : asNumber(data.selling_price, 0),
    active: asBool(data.active, true),
    outlet_order_visible: asBool(data.outlet_order_visible, true),
    consumption_uom: asText(data.consumption_uom, "each"),
    purchase_pack_unit: asText(data.purchase_pack_unit, "each"),
    transfer_unit: asText(data.transfer_unit, "each"),
    transfer_quantity: asNumber(data.transfer_quantity, 1),
    units_per_purchase_pack: asNumber(data.units_per_purchase_pack, 1),
    cost: asNumber(data.cost, 0),
    image_url: asText(data.image_url),
    created_at: asText(data.created_at, nowIso()),
    updated_at: nowIso(),
  };
}

async function upsertBatches(supabase, table, rows, dryRun) {
  if (dryRun || !rows.length) return;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

async function main() {
  const { dryRun } = parseArgs(process.argv);
  const db = initFirestore();
  const supabase = createSupabaseAdmin();

  const [itemsSnap, variantsSnap, groupsSnap] = await Promise.all([
    db.collection("catalog_items").where("item_kind", "==", "finished").get(),
    db.collection("catalog_variants").get(),
    db.collection("catalog_menu_groups").get(),
  ]);

  const finishedItemIds = new Set(itemsSnap.docs.map((doc) => doc.id));
  const menuGroups = groupsSnap.docs.map(mapMenuGroup);
  const items = itemsSnap.docs.map(mapItem).filter((row) => row.name);
  const variants = variantsSnap.docs
    .map((doc) => mapVariant(doc, finishedItemIds))
    .filter(Boolean);

  await upsertBatches(supabase, "catalog_menu_groups", menuGroups, dryRun);
  await upsertBatches(supabase, "catalog_items", items, dryRun);
  await upsertBatches(supabase, "catalog_variants", variants, dryRun);

  const { count: finishedCount } = await supabase
    .from("catalog_items")
    .select("id", { count: "exact", head: true })
    .eq("item_kind", ITEM_KIND);
  const { count: variantCount } = await supabase
    .from("catalog_variants")
    .select("id", { count: "exact", head: true })
    .eq("item_kind", ITEM_KIND);

  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: dryRun,
        source: "firestore",
        summary: {
          menu_groups: menuGroups.length,
          catalog_items: items.length,
          catalog_variants: variants.length,
          catalog_items_finished_total: dryRun ? null : finishedCount ?? 0,
          catalog_variants_finished_total: dryRun ? null : variantCount ?? 0,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
