/**
 * Import portal reference data from Supabase → Firestore.
 *
 * Tables: warehouses, outlet_warehouses, uom_options, suppliers,
 *         middleware_catalog_schedule, outlet_catalog_allowlist, outlet_auth_assignments
 *
 * Run from firebase folder:
 *   node scripts/migrate-reference-data-from-supabase.cjs
 */
const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const PORTAL_DIR = resolve(__dirname, "../../Afterten Website Portal");
const PORTAL_ENV_FILES = [
  process.env.SUPABASE_ENV_PATH,
  resolve(PORTAL_DIR, ".env.local"),
  resolve(PORTAL_DIR, ".env"),
].filter(Boolean);
const KEY_PATH = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
const BATCH_LIMIT = 400;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

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
    ""
  ).trim();
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function fetchAllRows(supabase, table, select = "*", order = "id", optional = false) {
  const rows = [];
  let from = 0;
  const pageSize = 500;

  while (true) {
    const to = from + pageSize - 1;
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
        console.warn(`  Skipping optional table ${table}`);
        return [];
      }
      throw new Error(`Supabase ${table} fetch failed (${response.status}): ${body}`);
    }

    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
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

  console.log(DRY_RUN ? "DRY RUN" : "Migrating reference data → Firestore...");
  console.log(`Supabase: ${supabase.url}\n`);

  const [warehouses, outletWarehouses, uoms, suppliers, schedule, allowlist, authAssignments] =
    await Promise.all([
      fetchAllRows(supabase, "warehouses"),
      fetchAllRows(supabase, "outlet_warehouses", "*", "outlet_id", true),
      fetchAllRows(supabase, "uom_options", "*", "sort_order", true),
      fetchAllRows(supabase, "suppliers"),
      fetchAllRows(supabase, "middleware_catalog_schedule", "*", "id", true),
      fetchAllRows(supabase, "outlet_catalog_allowlist", "*", "outlet_id", true),
      fetchAllRows(supabase, "outlet_auth_assignments", "*", "outlet_id", true),
    ]);

  await commitBatches(
    db,
    "warehouses",
    warehouses.map((row) => ({ id: row.id, data: { ...row, migrated_at: new Date().toISOString() } })),
    "warehouses",
  );

  await commitBatches(
    db,
    "outlet_warehouses",
    outletWarehouses.map((row, index) => ({
      id: row.id || `${row.outlet_id}_${row.warehouse_id}_${index}`,
      data: row,
    })),
    "outlet_warehouses",
  );

  await commitBatches(
    db,
    "uom_options",
    uoms.map((row) => ({ id: row.code || row.id, data: row })),
    "uom_options",
  );

  await commitBatches(
    db,
    "suppliers",
    suppliers.map((row) => ({ id: row.id, data: row })),
    "suppliers",
  );

  await commitBatches(
    db,
    "middleware_catalog_schedule",
    schedule.map((row) => ({ id: row.id || "global", data: row })),
    "middleware_catalog_schedule",
  );

  await commitBatches(
    db,
    "outlet_catalog_allowlist",
    allowlist.map((row) => ({
      id: row.id || `${row.outlet_id}_${row.item_id}_${row.variant_id || "base"}`,
      data: row,
    })),
    "outlet_catalog_allowlist",
  );

  await commitBatches(
    db,
    "outlet_auth_assignments",
    authAssignments.map((row, index) => ({
      id: `${row.outlet_id}_${row.auth_user_id}` || `assignment_${index}`,
      data: row,
    })),
    "outlet_auth_assignments",
  );

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
