/**
 * Shared helpers for Supabase → Firestore migration scripts.
 */
const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");

const PORTAL_DIR = resolve(__dirname, "../../../afterten-website-portal");
const PORTAL_ENV_FILES = [
  process.env.SUPABASE_ENV_PATH,
  resolve(PORTAL_DIR, ".env.local"),
  resolve(PORTAL_DIR, ".env"),
].filter(Boolean);
const KEY_PATH =
  process.env.FIREBASE_CREDENTIALS_PATH ||
  resolve(__dirname, "../../../secrets/afterten-firebase-adminsdk.json");

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

async function fetchAllRows(supabase, table, options = {}) {
  const select = options.select || "*";
  const order = options.order || "id";
  const optional = options.optional === true;
  const filter = options.filter || "";
  const limit = options.limit || null;
  const rows = [];
  let from = 0;
  const pageSize = 500;

  while (true) {
    if (limit && rows.length >= limit) break;
    const to = from + pageSize - 1;
    const url = `${supabase.url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${encodeURIComponent(order)}${filter}`;
    const response = await fetch(url, {
      headers: {
        apikey: supabase.key,
        Authorization: `Bearer ${supabase.key}`,
        Range: `${from}-${to}`,
      },
    });

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
    if (limit && rows.length >= limit) {
      return rows.slice(0, limit);
    }
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function commitBatches(db, collectionName, docs, label, dryRun) {
  const BATCH_LIMIT = 400;
  if (!docs.length) {
    console.log(`  ${label}: 0 rows`);
    return 0;
  }
  if (dryRun) {
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

module.exports = {
  KEY_PATH,
  getSupabaseConfig,
  fetchAllRows,
  commitBatches,
  PORTAL_DIR,
};
