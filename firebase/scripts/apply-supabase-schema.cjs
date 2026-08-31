/**
 * Apply generated public schema SQL to Supabase Postgres.
 *
 * Requires database password (Settings → Database → connection string):
 *   SUPABASE_DB_PASSWORD=your-db-password
 *
 * Optional overrides:
 *   SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@...
 *
 *   node firebase/scripts/apply-supabase-schema.cjs
 *   node firebase/scripts/apply-supabase-schema.cjs --file supabase/migrations/20260830110000_restore_public_schema.sql
 */
const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");
const { spawnSync } = require("child_process");
const { createRequire } = require("module");
const { loadEnv, getSupabaseConfig } = require("./lib/supabase-client.cjs");
const { buildDbUrls } = require("./lib/supabase-db-urls.cjs");
const { splitSqlStatements } = require("./lib/split-sql.cjs");

const portalRequire = createRequire(resolve(__dirname, "../../afterten-website-portal/package.json"));
const rootRequire = createRequire(resolve(__dirname, "../../package.json"));

function requirePg() {
  try {
    return portalRequire("pg");
  } catch {
    return rootRequire("pg");
  }
}

const DEFAULT_FILE = resolve(__dirname, "../../supabase/migrations/20260830110000_restore_public_schema.sql");
const CASHIERS_FILE = resolve(__dirname, "../../supabase/migrations/20260729_outlet_cashiers.sql");
const MIRROR_FILE = resolve(__dirname, "../../supabase/migrations/20260830100000_firestore_mirror.sql");

function parseArgs() {
  const fileIdx = process.argv.indexOf("--file");
  return {
    file: fileIdx >= 0 ? resolve(process.cwd(), process.argv[fileIdx + 1]) : DEFAULT_FILE,
    skipCashiers: process.argv.includes("--skip-cashiers"),
  };
}

function hasPsql() {
  const psql = process.env.PSQL_PATH?.trim() || "psql";
  const result = spawnSync(psql, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return result.status === 0;
}

function runPsql(dbUrl, filePath) {
  const psql = process.env.PSQL_PATH?.trim() || "psql";
  const result = spawnSync(
    psql,
    [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", filePath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) {
    const err = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`psql failed for ${filePath}:\n${err}`);
  }
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

function splitSqlStatementsFromFile(sql) {
  return splitSqlStatements(sql);
}

async function runPg(dbUrls, filePath) {
  const { Client } = requirePg();
  const sql = readFileSync(filePath, "utf8");
  const statements = splitSqlStatementsFromFile(sql);
  const regular = [];
  const functions = [];
  const triggers = [];
  const policies = [];
  for (const stmt of statements) {
    if (/^CREATE OR REPLACE FUNCTION/i.test(stmt)) functions.push(stmt);
    else if (/^CREATE TRIGGER/i.test(stmt) || /^DROP TRIGGER/i.test(stmt)) triggers.push(stmt);
    else if (
      /^CREATE POLICY/i.test(stmt) ||
      /^DROP POLICY/i.test(stmt) ||
      /^ALTER TABLE .* ENABLE ROW LEVEL SECURITY/i.test(stmt)
    ) {
      policies.push(stmt);
    } else regular.push(stmt);
  }

  let lastConnectError = null;
  for (const dbUrl of dbUrls) {
    const client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      try {
        for (let i = 0; i < regular.length; i += 1) {
          const stmt = regular[i];
          try {
            await client.query(stmt);
          } catch (sqlError) {
            throw new Error(
              `SQL error at statement ${i + 1}/${regular.length} in ${filePath}:\n${sqlError.message}\n---\n${stmt.slice(0, 400)}`,
            );
          }
        }

        let pending = [...functions];
        for (let round = 0; round < 12 && pending.length > 0; round += 1) {
          const next = [];
          for (const stmt of pending) {
            try {
              await client.query(stmt);
            } catch {
              next.push(stmt);
            }
          }
          pending = next;
        }
        if (pending.length > 0) {
          console.warn(`Warning: ${pending.length} functions could not be created (likely missing legacy tables).`);
        }

        let pendingTriggers = [...triggers];
        for (let round = 0; round < 5 && pendingTriggers.length > 0; round += 1) {
          const next = [];
          for (const stmt of pendingTriggers) {
            try {
              await client.query(stmt);
            } catch {
              next.push(stmt);
            }
          }
          pendingTriggers = next;
        }
        if (pendingTriggers.length > 0) {
          console.warn(`Warning: ${pendingTriggers.length} triggers could not be created.`);
        }

        let pendingPolicies = [...policies];
        for (let round = 0; round < 5 && pendingPolicies.length > 0; round += 1) {
          const next = [];
          for (const stmt of pendingPolicies) {
            try {
              await client.query(stmt);
            } catch {
              next.push(stmt);
            }
          }
          pendingPolicies = next;
        }
        if (pendingPolicies.length > 0) {
          console.warn(`Warning: ${pendingPolicies.length} RLS policies could not be created.`);
        }

        await client.end();
        return;
      } catch (sqlError) {
        await client.end();
        throw sqlError;
      }
    } catch (error) {
      if (/SQL error at statement/.test(error.message || "")) {
        throw error;
      }
      lastConnectError = error;
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }
  throw new Error(`pg connection failed for ${filePath}:\n${lastConnectError?.message || lastConnectError}`);
}

async function runSqlFile(dbUrls, filePath) {
  if (hasPsql()) {
    return runPsql(dbUrls[0], filePath);
  }
  await runPg(dbUrls, filePath);
}

async function main() {
  loadEnv();
  const { file, skipCashiers } = parseArgs();
  const dbUrls = buildDbUrls();

  if (!existsSync(file)) {
    throw new Error(`Schema file not found: ${file}\nRun: node supabase/scripts/generate-schema-sql-from-export.cjs`);
  }

  if (!dbUrls.length) {
    console.log("SUPABASE_DB_PASSWORD (or SUPABASE_DB_URL) is not set — apply manually:");
    console.log("");
    console.log("1. Open Supabase → SQL Editor");
    console.log("2. Run supabase/migrations/20260830100000_firestore_mirror.sql (if not already)");
    console.log(`3. Run ${file}`);
    if (!skipCashiers && existsSync(CASHIERS_FILE)) {
      console.log(`4. Run ${CASHIERS_FILE}`);
    }
    console.log("5. Verify: node firebase/scripts/inspect-supabase.cjs");
    process.exit(0);
  }

  if (existsSync(MIRROR_FILE)) {
    console.log(`Applying ${MIRROR_FILE} ...`);
    await runSqlFile(dbUrls, MIRROR_FILE);
  }

  console.log(`Applying ${file} ...`);
  const out1 = await runSqlFile(dbUrls, file);
  if (typeof out1 === "string" && out1.trim()) console.log(out1.trim());

  if (!skipCashiers && existsSync(CASHIERS_FILE)) {
    console.log(`Applying ${CASHIERS_FILE} ...`);
    const out2 = await runSqlFile(dbUrls, CASHIERS_FILE);
    if (typeof out2 === "string" && out2.trim()) console.log(out2.trim());
  }

  console.log("Schema apply complete. Run: node firebase/scripts/inspect-supabase.cjs");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
