/**
 * Inspect Supabase — table row counts + firestore_mirror summary.
 *
 *   node firebase/scripts/inspect-supabase.cjs
 *   node firebase/scripts/inspect-supabase.cjs --collection transfer_orders
 */
const { createSupabaseAdmin, getSupabaseConfig } = require("./lib/supabase-client.cjs");

const PUBLIC_TABLES = [
  "outlets",
  "warehouses",
  "outlet_warehouses",
  "catalog_items",
  "catalog_variants",
  "catalog_menu_groups",
  "orders",
  "order_items",
  "outlet_sales",
  "outlet_catalog_allowlist",
  "outlet_catalog_sync_events",
  "outlet_pos_heartbeats",
  "suppliers",
  "counter_values",
  "outlet_cashiers",
];

async function countTable(supabase, schema, table) {
  const builder = schema === "firestore_mirror" ? supabase.schema("firestore_mirror") : supabase;
  const probeColumn = schema === "firestore_mirror" && table === "documents" ? "collection_path" : "*";
  const probe = await builder.from(table).select(probeColumn, { count: "exact", head: true });
  if (probe.error) {
    const missing =
      probe.error.code === "PGRST205" || /could not find the table/i.test(probe.error.message || "");
    return { table, error: probe.error.message, missing };
  }
  const { count, error } = probe;
  if (error) {
    const missing = error.code === "PGRST205" || /could not find the table/i.test(error.message || "");
    return { table, error: error.message, missing };
  }
  return { table, count: count ?? 0 };
}

async function mirrorSummary(supabase) {
  const { data, error } = await supabase.rpc("firestore_mirror_collection_counts");
  if (!error && Array.isArray(data)) return data;

  const { data: rows, error: fetchError } = await supabase
    .schema("firestore_mirror")
    .from("documents")
    .select("collection_path");

  if (fetchError) {
    return { error: fetchError.message };
  }

  const counts = new Map();
  for (const row of rows ?? []) {
    counts.set(row.collection_path, (counts.get(row.collection_path) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([collection_path, document_count]) => ({ collection_path, document_count }))
    .sort((a, b) => a.collection_path.localeCompare(b.collection_path));
}

async function main() {
  const filter = process.argv.find((arg, index) => process.argv[index - 1] === "--collection");
  const { url } = getSupabaseConfig();
  const supabase = createSupabaseAdmin();

  console.log("=== Supabase inspect ===");
  console.log(`URL: ${url}\n`);

  console.log("--- public schema (existing tables) ---");
  for (const table of PUBLIC_TABLES) {
    const result = await countTable(supabase, "public", table);
    if (result.error) {
      console.log(`  ${table}: ${result.missing ? "(missing)" : `(error: ${result.error})`}`);
    } else {
      console.log(`  ${table}: ${result.count}`);
    }
  }

  console.log("\n--- firestore_mirror.documents ---");
  const mirrorTotal = await countTable(supabase, "firestore_mirror", "documents");
  if (mirrorTotal.error) {
    console.log(`  Not set up yet. Run supabase/migrations/20260830100000_firestore_mirror.sql`);
    console.log(`  Error: ${mirrorTotal.error}`);
    return;
  }
  console.log(`  total: ${mirrorTotal.count}`);

  const summary = await mirrorSummary(supabase);
  if (summary.error) {
    console.log(`  ${summary.error}`);
    return;
  }

  const rows = filter ? summary.filter((row) => row.collection_path === filter) : summary;
  for (const row of rows) {
    console.log(`  ${row.collection_path}: ${row.document_count}`);
  }

  if (filter && rows.length === 0) {
    console.log(`  (no documents for collection "${filter}")`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
