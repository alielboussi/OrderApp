/**
 * One-time import: Supabase catalog → Firestore.
 *
 * Copies menu groups, items, variants, storage homes, and recent change events.
 * Preserves Supabase UUIDs as Firestore document IDs.
 *
 * Prerequisites:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env, or in
 *   Afterten Website Portal/.env.local or .env
 *
 * Run from firebase folder:
 *   node scripts/migrate-catalog-from-supabase.cjs
 *
 * Options (env):
 *   DRY_RUN=1          — count only, no writes
 *   CHANGE_EVENT_LIMIT — max change events (default 2000)
 */
const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const PORTAL_DIR = resolve(__dirname, "../../Afterten Website Portal");
const PORTAL_ENV_FILES = [
  process.env.SUPABASE_ENV_PATH,
  resolve(PORTAL_DIR, ".env.local"),
  resolve(PORTAL_DIR, ".env"),
  resolve(__dirname, "../../Afterten/.env.local"),
  resolve(__dirname, "../../Afterten/.env"),
].filter(Boolean);
const KEY_PATH = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
const PAGE_SIZE = 500;
const BATCH_LIMIT = 400;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const CHANGE_EVENT_LIMIT = Number(process.env.CHANGE_EVENT_LIMIT || 2000);

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function getSupabaseConfig() {
  for (const filePath of PORTAL_ENV_FILES) {
    loadEnvFile(filePath);
  }

  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
  if (!url || !key) {
    const checked = PORTAL_ENV_FILES.map((p) => `  - ${p}`).join("\n");
    throw new Error(
      `Missing Supabase credentials.\n\nAdd to Afterten Website Portal/.env.local (or .env):\n` +
        `  SUPABASE_URL=https://your-project.supabase.co\n` +
        `  SUPABASE_SERVICE_ROLE_KEY=eyJ...\n\nChecked:\n${checked}`,
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

function normalizeVariantKey(value) {
  if (typeof value !== "string" || !value.trim()) return "base";
  return value.trim();
}

function storageHomeDocId(row) {
  const itemId = row.item_id;
  const warehouseId = row.storage_warehouse_id;
  const variantKey = normalizeVariantKey(row.normalized_variant_key ?? row.variant_key);
  if (!itemId || !warehouseId) return null;
  return `${itemId}_${variantKey}_${warehouseId}`;
}

function stripRow(row) {
  const copy = { ...row };
  delete copy.id;
  return copy;
}

async function fetchAllRows(supabase, table, select = "*", order = "id", optional = false) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const response = await fetch(
      `${supabase.url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${encodeURIComponent(order)}`,
      {
        headers: {
          apikey: supabase.key,
          Authorization: `Bearer ${supabase.key}`,
          Range: `${from}-${to}`,
        },
      },
    );

    if (!response.ok) {
      const body = await response.text();
      if (optional && (response.status === 404 || body.includes("PGRST205"))) {
        console.warn(`  Skipping optional table ${table} (not in Supabase)`);
        return [];
      }
      throw new Error(`Supabase ${table} fetch failed (${response.status}): ${body}`);
    }

    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function commitBatches(db, collectionName, docs, label) {
  if (!docs.length) {
    console.log(`  ${label}: 0 rows`);
    return 0;
  }

  if (DRY_RUN) {
    console.log(`  ${label}: ${docs.length} rows (dry run)`);
    return docs.length;
  }

  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const chunk = docs.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const { id, data } of chunk) {
      batch.set(db.collection(collectionName).doc(id), data, { merge: true });
    }
    await batch.commit();
    written += chunk.length;
  }

  console.log(`  ${label}: ${written} rows`);
  return written;
}

async function main() {
  const supabase = getSupabaseConfig();
  const serviceAccount = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const migratedAt = new Date().toISOString();

  console.log(DRY_RUN ? "DRY RUN — no Firestore writes" : "Migrating Supabase catalog → Firestore...");
  console.log(`Supabase: ${supabase.url}`);
  console.log("");

  const [menuGroups, items, variants, storageHomes, changeEvents] = await Promise.all([
    fetchAllRows(supabase, "catalog_menu_groups"),
    fetchAllRows(supabase, "catalog_items"),
    fetchAllRows(supabase, "catalog_variants"),
    fetchAllRows(supabase, "item_storage_homes", "*", "item_id", true),
    fetchAllRows(supabase, "catalog_change_events", "*", "created_at.desc", true).then((rows) =>
      rows.slice(0, CHANGE_EVENT_LIMIT),
    ),
  ]);

  const menuGroupDocs = menuGroups
    .filter((row) => row.id)
    .map((row) => ({
      id: row.id,
      data: { ...stripRow(row), migrated_at: migratedAt },
    }));

  const itemDocs = items
    .filter((row) => row.id)
    .map((row) => ({
      id: row.id,
      data: { ...stripRow(row), migrated_at: migratedAt },
    }));

  const variantDocs = variants
    .filter((row) => row.id)
    .map((row) => ({
      id: row.id,
      data: { ...stripRow(row), migrated_at: migratedAt },
    }));

  const storageDocs = storageHomes
    .map((row) => {
      const id = storageHomeDocId(row);
      if (!id) return null;
      return {
        id,
        data: {
          item_id: row.item_id,
          variant_key: row.variant_key ?? normalizeVariantKey(row.normalized_variant_key),
          normalized_variant_key: normalizeVariantKey(row.normalized_variant_key ?? row.variant_key),
          storage_warehouse_id: row.storage_warehouse_id,
          migrated_at: migratedAt,
        },
      };
    })
    .filter(Boolean);

  const changeEventDocs = changeEvents
    .filter((row) => row.id)
    .map((row) => ({
      id: row.id,
      data: { ...stripRow(row), migrated_at: migratedAt },
    }));

  await commitBatches(db, "catalog_menu_groups", menuGroupDocs, "catalog_menu_groups");
  await commitBatches(db, "catalog_items", itemDocs, "catalog_items");
  await commitBatches(db, "catalog_variants", variantDocs, "catalog_variants");
  await commitBatches(db, "item_storage_homes", storageDocs, "item_storage_homes");
  await commitBatches(db, "catalog_change_events", changeEventDocs, "catalog_change_events");

  console.log("");
  console.log("Done.");
  if (DRY_RUN) {
    console.log("Re-run without DRY_RUN=1 to write to Firestore.");
  } else {
    console.log("Portal with CLOUD_BACKEND=firebase should now see migrated catalog data.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
