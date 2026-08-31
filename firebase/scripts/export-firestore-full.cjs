/**
 * Export Firestore collection-by-collection (resumable, partial on quota errors).
 *
 *   node firebase/scripts/export-firestore-full.cjs
 *   node firebase/scripts/export-firestore-full.cjs --out exports/firestore/latest
 *   node firebase/scripts/export-firestore-full.cjs --only catalog_items,outlets
 */
const { mkdirSync, writeFileSync, readFileSync, existsSync } = require("fs");
const { resolve, join } = require("path");
const { getFirestoreAdmin } = require("./lib/firestore-admin.cjs");

const DEFAULT_OUT = resolve(__dirname, "../../exports/firestore/latest");

const SUBCOLLECTIONS = {
  transfer_orders: ["items"],
  outlet_damage_reports: ["lines"],
};

function serializeValue(value) {
  if (value == null) return value;
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
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
  const safeName = collectionPath.replace(/[\\/]/g, "__");
  writeFileSync(join(outDir, "collections", `${safeName}.json`), JSON.stringify(rows, null, 2), "utf8");
}

function loadManifest(outDir) {
  const path = join(outDir, "manifest.json");
  if (!existsSync(path)) {
    return {
      exported_at: new Date().toISOString(),
      project_id: null,
      completed_collections: [],
      failed_collections: [],
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
  const { readdirSync } = require("fs");
  const bucket = [];
  for (const file of readdirSync(collectionsDir)) {
    if (!file.endsWith(".json")) continue;
    const rows = JSON.parse(readFileSync(join(collectionsDir, file), "utf8"));
    bucket.push(...rows);
  }
  writeFileSync(join(outDir, "documents.json"), JSON.stringify(bucket, null, 2), "utf8");
  return bucket.length;
}

async function exportPosSales(db, outDir) {
  const rows = [];
  const outletsSnap = await db.collection("pos_sales").get();
  for (const outletDoc of outletsSnap.docs) {
    const billsPath = `pos_sales/${outletDoc.id}/bills`;
    rows.push(...(await exportCollection(db, billsPath)));

    const billsSnap = await outletDoc.ref.collection("bills").get();
    for (const billDoc of billsSnap.docs) {
      const linesPath = `${billsPath}/${billDoc.id}/lines`;
      rows.push(...(await exportCollection(db, linesPath)));
    }
  }
  saveCollectionFile(outDir, "pos_sales__nested", rows);
  return rows.length;
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
  if (rows.length) {
    saveCollectionFile(outDir, `${rootCollection}__subcollections`, rows);
  }
  return rows.length;
}

async function main() {
  const outArg = process.argv.find((arg, index) => process.argv[index - 1] === "--out");
  const onlyArg = process.argv.find((arg, index) => process.argv[index - 1] === "--only");
  const outDir = resolve(outArg || DEFAULT_OUT);
  mkdirSync(join(outDir, "collections"), { recursive: true });

  const db = getFirestoreAdmin();
  const manifest = loadManifest(outDir);
  const only = onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim()).filter(Boolean)) : null;

  console.log(`Exporting Firestore → ${outDir}\n`);

  const rootCollections = await db.listCollections();
  const queue = [];

  for (const col of rootCollections) {
    if (col.id === "pos_sales") continue;
    if (only && !only.has(col.id)) continue;
    queue.push(col.id);
  }
  if (!only || only.has("pos_sales")) {
    queue.push("__pos_sales__");
  }

  for (const job of queue) {
    if (manifest.completed_collections.includes(job)) {
      console.log(`  skip ${job} (already exported)`);
      continue;
    }

    try {
      let count = 0;
      if (job === "__pos_sales__") {
        count = await exportPosSales(db, outDir);
      } else {
        const rows = await exportCollection(db, job);
        saveCollectionFile(outDir, job, rows);
        count = rows.length;
        const subCount = await exportSubcollections(db, job, outDir);
        count += subCount;
        if (subCount > 0) console.log(`  ${job} subcollections: ${subCount}`);
      }

      manifest.completed_collections.push(job);
      manifest.document_count = mergeDocuments(outDir);
      manifest.collections = manifest.completed_collections.map((name) => ({ path: name }));
      saveManifest(outDir, manifest);
      console.log(`  ${job}: ${count}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      manifest.failed_collections = manifest.failed_collections ?? [];
      manifest.failed_collections.push({ collection: job, error: message, at: new Date().toISOString() });
      saveManifest(outDir, manifest);
      console.error(`  FAILED ${job}: ${message}`);
      if (message.includes("RESOURCE_EXHAUSTED") || message.includes("Quota exceeded")) {
        console.error("\nFirestore quota blocked. Re-run later or enable billing briefly to export.");
        break;
      }
    }
  }

  manifest.document_count = mergeDocuments(outDir);
  saveManifest(outDir, manifest);
  console.log(`\nDone. ${manifest.document_count} documents in documents.json`);
  if (manifest.failed_collections?.length) {
    console.log(`Failed collections: ${manifest.failed_collections.map((f) => f.collection).join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
