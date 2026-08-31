/**
 * Import exported Firestore JSON into Supabase firestore_mirror.documents.
 *
 * Prerequisite: run supabase/migrations/20260830100000_firestore_mirror.sql
 *
 *   node firebase/scripts/import-firestore-to-supabase.cjs
 *   node firebase/scripts/import-firestore-to-supabase.cjs --in exports/firestore/latest
 */
const { readFileSync } = require("fs");
const { resolve, join } = require("path");
const { createSupabaseAdmin } = require("./lib/supabase-client.cjs");

const DEFAULT_IN = resolve(__dirname, "../../exports/firestore/latest");
const BATCH_SIZE = 200;

async function ensureMirrorTable(supabase) {
  const { error } = await supabase.schema("firestore_mirror").from("documents").select("collection_path").limit(1);
  if (!error) return;

  throw new Error(
    "firestore_mirror.documents not found. Run this SQL in Supabase SQL Editor first:\n" +
      "  supabase/migrations/20260830100000_firestore_mirror.sql",
  );
}

async function main() {
  const inArg = process.argv.find((arg, index) => process.argv[index - 1] === "--in");
  const inDir = resolve(inArg || DEFAULT_IN);
  const documentsPath = join(inDir, "documents.json");
  const manifestPath = join(inDir, "manifest.json");

  const documents = JSON.parse(readFileSync(documentsPath, "utf8"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const supabase = createSupabaseAdmin();

  await ensureMirrorTable(supabase);

  console.log(`Importing ${documents.length} documents from ${inDir}\n`);

  let imported = 0;
  for (let index = 0; index < documents.length; index += BATCH_SIZE) {
    const chunk = documents.slice(index, index + BATCH_SIZE).map((row) => ({
      collection_path: row.collection_path,
      document_id: row.document_id,
      data: row.data,
      exported_at: manifest.exported_at,
    }));

    const { error } = await supabase
      .schema("firestore_mirror")
      .from("documents")
      .upsert(chunk, { onConflict: "collection_path,document_id" });

    if (error) {
      throw new Error(`Import failed at offset ${index}: ${error.message}`);
    }

    imported += chunk.length;
    process.stdout.write(`\r  Imported ${imported}/${documents.length}`);
  }

  const { error: runError } = await supabase.schema("firestore_mirror").from("export_runs").insert({
    source_project: manifest.project_id,
    document_count: documents.length,
    collection_count: manifest.collections?.length ?? 0,
    finished_at: new Date().toISOString(),
    notes: `import from ${inDir}`,
  });
  if (runError) {
    console.warn(`\nWarning: could not write export_runs: ${runError.message}`);
  }

  console.log(`\n\nDone. ${imported} documents in firestore_mirror.documents`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
