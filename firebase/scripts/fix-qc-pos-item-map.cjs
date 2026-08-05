/**
 * Seed Quick Corner POS → catalog mappings and missing catalog rows.
 *
 * Run from firebase/functions:
 *   node ../scripts/fix-qc-pos-item-map.cjs
 *   DRY_RUN=1 node ../scripts/fix-qc-pos-item-map.cjs
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const DRY_RUN = process.env.DRY_RUN === "1";
const QC_OUTLET_ID = "a406fede-7aab-4473-8e9f-ff645267466f";
const NOW = new Date().toISOString();

const PLASTIC_BAG_ID = "5933ba28-eb11-4c23-b9dc-7c04057b0e6a";

const MAPPINGS = [
  {
    pos_item_id: "62",
    pos_flavour_id: "93",
    catalog_item_id: "fa313d72-146b-49d3-8e84-32995bad6335",
    catalog_variant_key: "f035c682-d84c-447a-8874-827179147805",
    pos_item_name: "Mineral Water",
    pos_flavour_name: "Afterten 500mls",
  },
  {
    pos_item_id: "62",
    pos_flavour_id: "92",
    catalog_item_id: "fa313d72-146b-49d3-8e84-32995bad6335",
    catalog_variant_key: "b88e157b-f84d-49c1-8dea-b8a73800e82c",
    pos_item_name: "Mineral Water",
    pos_flavour_name: "Vatra 500mls",
  },
  {
    pos_item_id: "184",
    pos_flavour_id: null,
    catalog_item_id: PLASTIC_BAG_ID,
    catalog_variant_key: "base",
    pos_item_name: "Plastic Bag",
    pos_flavour_name: null,
  },
  {
    pos_item_id: "357",
    pos_flavour_id: null,
    catalog_item_id: "be370f52-2ae3-4ab2-92e5-fd3b863d70a9",
    catalog_variant_key: "base",
    pos_item_name: "Muffin",
    pos_flavour_name: null,
  },
  {
    pos_item_id: "117",
    pos_flavour_id: "117",
    catalog_item_id: "21e1d144-4a9c-46c8-937f-07be7dd355a9",
    catalog_variant_key: "base",
    pos_item_name: "Ice Cream 250Mls",
    pos_flavour_name: "Ice Cream 250Mls",
  },
];

function normalizeVariantKey(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed && trimmed !== "base" ? trimmed : "base";
}

function mapDocId(row) {
  return [
    QC_OUTLET_ID,
    row.pos_item_id,
    row.pos_flavour_id || "none",
    row.catalog_item_id,
    normalizeVariantKey(row.catalog_variant_key),
    "none",
  ].join("__");
}

const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
const db = admin.firestore();

async function ensurePlasticBagCatalogItem() {
  const ref = db.collection("catalog_items").doc(PLASTIC_BAG_ID);
  const snap = await ref.get();
  if (snap.exists) {
    console.log(`catalog_items/${PLASTIC_BAG_ID} already exists (${snap.data()?.name ?? ""})`);
    return;
  }

  const row = {
    name: "Plastic Bag",
    item_kind: "finished",
    active: true,
    has_variations: false,
    outlet_order_visible: true,
    created_at: NOW,
    updated_at: NOW,
    seeded_by: "fix-qc-pos-item-map.cjs",
  };

  console.log(`${DRY_RUN ? "[dry-run] would create" : "creating"} catalog_items/${PLASTIC_BAG_ID} Plastic Bag`);
  if (!DRY_RUN) await ref.set(row);
}

async function upsertMappings() {
  for (const row of MAPPINGS) {
    const id = mapDocId(row);
    const data = {
      outlet_id: QC_OUTLET_ID,
      pos_item_id: row.pos_item_id,
      pos_flavour_id: row.pos_flavour_id,
      catalog_item_id: row.catalog_item_id,
      catalog_variant_key: row.catalog_variant_key,
      normalized_variant_key: normalizeVariantKey(row.catalog_variant_key),
      pos_item_name: row.pos_item_name,
      pos_flavour_name: row.pos_flavour_name,
      updated_at: NOW,
      seeded_by: "fix-qc-pos-item-map.cjs",
    };
    console.log(
      `${DRY_RUN ? "[dry-run] would upsert" : "upserting"} pos_item_map/${id} -> ${row.catalog_item_id} (${row.catalog_variant_key})`,
    );
    if (!DRY_RUN) await db.collection("pos_item_map").doc(id).set(data, { merge: true });
  }
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== Applying QC POS item map fixes ===");
  await ensurePlasticBagCatalogItem();
  await upsertMappings();
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
