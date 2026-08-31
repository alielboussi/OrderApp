const { createRequire } = require("module");
const { resolve } = require("path");
const { readFileSync, existsSync } = require("fs");
const { loadEnv } = require("./lib/supabase-client.cjs");
const { buildDbUrls } = require("./lib/supabase-db-urls.cjs");
const { splitSqlStatements } = require("./lib/split-sql.cjs");

loadEnv();
const { Client } = createRequire(resolve(__dirname, "../../package.json"))("pg");

const CASHIERS_FILE = resolve(__dirname, "../../supabase/migrations/20260729_outlet_cashiers.sql");

(async () => {
  const client = new Client({ connectionString: buildDbUrls()[0], ssl: { rejectUnauthorized: false } });
  await client.connect();

  const tables = await client.query("select tablename from pg_tables where schemaname = 'public' order by 1");
  for (const row of tables.rows) {
    const table = row.tablename.replace(/"/g, '""');
    await client.query(`GRANT ALL ON TABLE public."${table}" TO service_role, postgres, authenticated, anon`);
  }

  const sequences = await client.query("select sequence_name from information_schema.sequences where sequence_schema = 'public'");
  for (const row of sequences.rows) {
    const seq = row.sequence_name.replace(/"/g, '""');
    await client.query(`GRANT ALL ON SEQUENCE public."${seq}" TO service_role, postgres, authenticated, anon`);
  }

  const cashiers = await client.query("select to_regclass('public.outlet_cashiers') as t");
  if (!cashiers.rows[0]?.t && existsSync(CASHIERS_FILE)) {
    console.log("Applying outlet_cashiers migration...");
    for (const stmt of splitSqlStatements(readFileSync(CASHIERS_FILE, "utf8"))) {
      await client.query(stmt);
    }
  }

  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log(`Granted access on ${tables.rows.length} tables.`);
  await client.end();
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
