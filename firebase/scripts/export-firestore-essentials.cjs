/**
 * Export only essential Firestore data (products + orders + outlets).
 * Skips heavy collections like pos_sales that burn read quota.
 *
 *   node firebase/scripts/export-firestore-essentials.cjs
 *   node firebase/scripts/export-firestore-essentials.cjs --import
 */
const { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } = require("fs");
const { resolve, join } = require("path");
const { getFirestoreAdmin } = require("./lib/firestore-admin.cjs");

const DEFAULT_OUT = resolve(__dirname, "../../exports/firestore/essentials");

/** Root collections to export (small / critical). */
const ESSENTIAL_ROOT_COLLECTIONS = [
  "catalog_items",
  "catalog_variants",
  "catalog_menu_groups",
  "uom_options",
  "warehouses",
  "suppliers",
  "operators",
  "outlets",
  "outlet_warehouses",
  "outlet_catalog_allowlist",
  "outlet_order_catalog",
  "outlet_order_routes",
  "outlet_auth_assignments",
  "app_users",
  "transfer_orders",
  "transfer_order_counters",
  "outlet_order_counters",
  "outlet_damage_reports",
  "outlet_damage_counters",
  "pos_item_map",
  "item_storage_homes",
  "outlet_cashiers",
  "preparation_sessions",
  "push_tokens",
  "warehouse_auth_accounts",
  "middleware_catalog_schedule",
  "stock_catalog_sync_state",
];

const SUBCOLLECTIONS = {
  transfer_orders: ["items"],
  outlet_damage_reports: ["lines"],
};

/** Skipped intentionally — huge read cost, not needed for products/orders restore. */
const SKIPPED = [
  "pos_sales",
  "outlet_catalog_sync_events",
  "outlet_cashier_sync_events",
  "catalog_change_events",
  "flow_traces",
  "flow_trace_steps",
  "pos_sync_failures",
  "outlet_heartbeats",
  "outlet_counters",
  "outlet_catalog_bindings",
  "warehouse_backoffice_logs",
  "warehouse_live_items",
  "recipes",
];

function serializeValue(value) {
  if (value == null) return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = serializeValue(child);
    }
    return out;
  }
  return value;
}

function collectionRef(db, collectionPath) {
  const segments = collectionPath.split("/");
  let ref = db.collection(segments[0]);
  for (let i = 1; i < segments.length; i += 2) {
    ref = ref.doc(segments[i]).collection(segments[i + 1]);
  }
  return ref;
}

async function exportCollection(db, collectionPath) {
  const snap = await collectionRef(db, collectionPath).get();
  return snap.docs.map((doc) => ({
    collection_path: collectionPath,
    document_id: doc.id,
    data: serializeValue(doc.data()),
  }));
}

function saveCollectionFile(outDir, collectionPath, rows) {
  mkdirSync(join(outDir, "collections"), { recursive: true });
  const safeName = collectionPath.replace(/[\\/]/g, "__");
  writeFileSync(join(outDir, "collections", `${safeName}.json`), JSON.stringify(rows, null, 2), "utf8");
}

function loadManifest(outDir) {
  const path = join(outDir, "manifest.json");
  if (!existsSync(path)) {
    return {
      exported_at: new Date().toISOString(),
      mode: "essentials",
      completed_collections: [],
      failed_collections: [],
      skipped_collections: SKIPPED,
      document_count: 0,
      collections: [],
    };
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveManifest(outDir, manifest) {
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}

function mergeDocuments(outDir) {
  const collectionsDir = join(outDir, "collections");
  if (!existsSync(collectionsDir)) return 0;
  const bucket = [];
  for (const file of readdirSync(collectionsDir)) {
    if (!file.endsWith(".json")) continue;
    bucket.push(...JSON.parse(readFileSync(join(collectionsDir, file), "utf8")));
  }
  writeFileSync(join(outDir, "documents.json"), JSON.stringify(bucket, null, 2), "utf8");
  return bucket.length;
}

async function exportSubcollections(db, rootCollection, outDir) {
  const subNames = SUBCOLLECTIONS[rootCollection] ?? [];
  if (!subNames.length) return 0;

  const rows = [];
  const parents = await db.collection(rootCollection).get();
  for (const parent of parents.docs) {
    for (const subName of subNames) {
      const path = `${rootCollection}/${parent.id}/${subName}`;
      rows.push(...(await exportCollection(db, path)));
    }
  }
  if (rows.length) saveCollectionFile(outDir, `${rootCollection}__subcollections`, rows);
  return rows.length;
}

async function main() {
  const outDir = resolve(DEFAULT_OUT);
  mkdirSync(outDir, { recursive: true });
  const db = getFirestoreAdmin();
  const manifest = loadManifest(outDir);

  console.log("=== Essentials Firestore export ===");
  console.log(`Output: ${outDir}`);
  console.log(`Skipping heavy collections: ${SKIPPED.join(", ")}\n`);

  for (const collection of ESSENTIAL_ROOT_COLLECTIONS) {
    if (manifest.completed_collections.includes(collection)) {
      console.log(`  skip ${collection} (already done)`);
      continue;
    }

    try {
      const rows = await exportCollection(db, collection);
      saveCollectionFile(outDir, collection, rows);
      let count = rows.length;
      const subCount = await exportSubcollections(db, collection, outDir);
      count += subCount;
      if (subCount > 0) console.log(`  ${collection} subcollections: ${subCount}`);

      manifest.completed_collections.push(collection);
      manifest.document_count = mergeDocuments(outDir);
      saveManifest(outDir, manifest);
      console.log(`  OK ${collection}: ${count} doc(s)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      manifest.failed_collections = manifest.failed_collections ?? [];
      manifest.failed_collections.push({ collection, error: message, at: new Date().toISOString() });
      saveManifest(outDir, manifest);
      console.error(`  FAIL ${collection}: ${message}`);
      if (message.includes("RESOURCE_EXHAUSTED") || message.includes("Quota exceeded")) {
        console.error("\nRead quota hit. Re-run tomorrow — completed collections are skipped.");
        break;
      }
    }
  }

  manifest.document_count = mergeDocuments(outDir);
  saveManifest(outDir, manifest);

  console.log(`\nDone. ${manifest.document_count} essential documents exported.`);
  console.log(`  ${join(outDir, "documents.json")}`);

  if (process.argv.includes("--import")) {
    console.log("\nImporting to Supabase...");
    const { spawnSync } = require("child_process");
    const result = spawnSync(
      process.execPath,
      [resolve(__dirname, "import-firestore-to-supabase.cjs"), "--in", outDir],
      { stdio: "inherit" },
    );
    process.exit(result.status ?? 1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
