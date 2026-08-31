/**
 * Convert supabase/Supabase Schema.sql (JSON export) into executable Postgres DDL.
 *
 *   node supabase/scripts/generate-schema-sql-from-export.cjs
 *   node supabase/scripts/generate-schema-sql-from-export.cjs --out supabase/migrations/20260830110000_restore_public_schema.sql
 */
const { readFileSync, writeFileSync, mkdirSync } = require("fs");
const { resolve, dirname } = require("path");

const DEFAULT_IN = resolve(__dirname, "..", "Supabase Schema.sql");
const DEFAULT_OUT = resolve(__dirname, "..", "migrations", "20260830110000_restore_public_schema.sql");

function parseArgs() {
  const outIdx = process.argv.indexOf("--out");
  const inIdx = process.argv.indexOf("--in");
  return {
    inPath: inIdx >= 0 ? resolve(process.cwd(), process.argv[inIdx + 1]) : DEFAULT_IN,
    outPath: outIdx >= 0 ? resolve(process.cwd(), process.argv[outIdx + 1]) : DEFAULT_OUT,
  };
}

function loadExport(inPath) {
  const raw = readFileSync(inPath, "utf8");
  const doc = JSON.parse(raw);
  const root = Array.isArray(doc) ? doc[0]?.schema_export : doc.schema_export;
  if (!root) {
    throw new Error(`No schema_export found in ${inPath}`);
  }
  return root;
}

function mapDataType(col) {
  if (col.data_type === "USER-DEFINED") {
    if (col.column_name === "item_kind") return "public.item_kind";
    if (col.column_name.endsWith("_mass_uom")) return "public.recipe_measure_unit";
    return "text";
  }
  switch (col.data_type) {
    case "timestamp with time zone":
      return "timestamptz";
    case "timestamp without time zone":
      return "timestamp";
    case "character varying":
      return col.character_maximum_length ? `varchar(${col.character_maximum_length})` : "varchar";
    case "double precision":
      return "double precision";
    case "ARRAY":
      return `${col.udt_name || "text"}[]`;
    default:
      return col.data_type;
  }
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function joinWithSplit(statements) {
  return statements
    .map((stmt) => stmt.trim())
    .filter(Boolean)
    .map((stmt) => (stmt.endsWith(";") ? stmt.slice(0, -1) : stmt))
    .join("\n-- @split\n");
}

function buildSequencesSql(exportRoot) {
  const sequences = new Set();
  for (const col of exportRoot.columns || []) {
    if (col.table_schema !== "public" || !col.column_default) continue;
    const match = col.column_default.match(/nextval\('([^']+)'::regclass\)/);
    if (match) sequences.add(match[1]);
  }
  if (!sequences.size) return "";
  return joinWithSplit([...sequences].map((seq) => `CREATE SEQUENCE IF NOT EXISTS public.${quoteIdent(seq)}`));
}

function buildEnumsSql() {
  return joinWithSplit([
    `DO $$ BEGIN
  CREATE TYPE public.item_kind AS ENUM ('finished', 'ingredient', 'raw');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`,
    `DO $$ BEGIN
  CREATE TYPE public.recipe_measure_unit AS ENUM (
    'grams', 'kilograms', 'milligrams', 'litres', 'millilitres', 'units'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`,
    `DO $$ BEGIN
  CREATE TYPE public.order_lock_stage AS ENUM ('outlet', 'supervisor', 'driver', 'offloader');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`,
  ]);
}

function buildTablesSql(exportRoot) {
  const tables = (exportRoot.tables || [])
    .filter((t) => t.table_schema === "public")
    .map((t) => t.table_name)
    .sort();

  const columns = (exportRoot.columns || []).filter((c) => c.table_schema === "public");
  const byTable = new Map();
  for (const col of columns) {
    if (!byTable.has(col.table_name)) byTable.set(col.table_name, []);
    byTable.get(col.table_name).push(col);
  }

  const statements = [];
  for (const table of tables) {
    const cols = (byTable.get(table) || []).sort((a, b) => a.ordinal_position - b.ordinal_position);
    if (!cols.length) continue;
    const lines = cols.map((col) => {
      const type = mapDataType(col);
      const nullable = col.is_nullable === "NO" ? "NOT NULL" : "";
      const def = col.column_default != null ? `DEFAULT ${col.column_default}` : "";
      return `  ${quoteIdent(col.column_name)} ${type} ${nullable} ${def}`.replace(/\s+/g, " ").trim();
    });
    statements.push(`CREATE TABLE IF NOT EXISTS public.${quoteIdent(table)} (\n${lines.join(",\n")}\n)`);
  }
  return joinWithSplit(statements);
}

function buildConstraintSql(exportRoot) {
  const constraints = exportRoot.constraints || [];
  const statements = [];

  for (const c of constraints) {
    if (c.table_schema !== "public") continue;
    if (c.constraint_type === "FOREIGN KEY" && c.constraint_def) {
      statements.push(
        `ALTER TABLE public.${quoteIdent(c.table_name)} DROP CONSTRAINT IF EXISTS ${quoteIdent(c.constraint_name)}`,
      );
      statements.push(
        `ALTER TABLE public.${quoteIdent(c.table_name)} ADD CONSTRAINT ${quoteIdent(c.constraint_name)} ${c.constraint_def}`,
      );
    }
  }

  statements.push(
    "ALTER TABLE public.warehouses DROP CONSTRAINT IF EXISTS warehouses_warehouse_scope_check",
    "ALTER TABLE public.warehouses ADD CONSTRAINT warehouses_warehouse_scope_check CHECK (warehouse_scope = ANY (ARRAY['hub'::text, 'outlet'::text]))",
  );

  return joinWithSplit(statements);
}

function buildIndexSql(exportRoot) {
  const statements = [];
  for (const idx of exportRoot.indexes || []) {
    if (idx.table_schema !== "public" || !idx.indexdef) continue;
    const stmt = idx.indexdef.replace(/^CREATE UNIQUE INDEX /, "CREATE UNIQUE INDEX IF NOT EXISTS ");
    const stmt2 = stmt.replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ");
    statements.push(stmt2);
  }
  return joinWithSplit(statements);
}

function buildViewSql(exportRoot) {
  const statements = [];
  for (const view of exportRoot.views || []) {
    if (view.view_schema !== "public" || !view.definition) continue;
    statements.push(`CREATE OR REPLACE VIEW public.${quoteIdent(view.view_name)} AS ${view.definition.trim()}`);
  }
  return joinWithSplit(statements);
}

function buildFunctionSql(exportRoot) {
  const statements = [];
  const seen = new Set();
  for (const fn of exportRoot.functions || []) {
    if (fn.function_schema !== "public" || !fn.definition) continue;
    const key = `${fn.function_name}(${fn.arguments || ""})`;
    if (seen.has(key)) continue;
    seen.add(key);
    statements.push(fn.definition.trim().replace(/;$/g, ""));
  }
  return joinWithSplit(statements);
}

function buildTriggerSql(exportRoot) {
  const statements = [];
  for (const trg of exportRoot.triggers || []) {
    if (trg.table_schema !== "public" || !trg.trigger_def) continue;
    const stmt = trg.trigger_def.replace(/EXECUTE FUNCTION/g, "EXECUTE PROCEDURE").replace(/;$/g, "");
    statements.push(`DROP TRIGGER IF EXISTS ${quoteIdent(trg.trigger_name)} ON public.${quoteIdent(trg.table_name)}`);
    statements.push(stmt);
  }
  return joinWithSplit(statements);
}

function buildPolicySql(exportRoot) {
  const statements = [];
  const tables = new Set((exportRoot.tables || []).filter((t) => t.table_schema === "public").map((t) => t.table_name));
  for (const table of tables) {
    statements.push(`ALTER TABLE public.${quoteIdent(table)} ENABLE ROW LEVEL SECURITY`);
  }

  for (const policy of exportRoot.policies || []) {
    if (policy.table_schema !== "public") continue;
    const roles = (policy.roles || ["public"]).map((r) => quoteIdent(r)).join(", ");
    const permissive = policy.permissive === "RESTRICTIVE" ? "AS RESTRICTIVE" : "";
    const cmd = policy.command || "ALL";
    const usingExpr = policy.using_expression ? ` USING (${policy.using_expression})` : "";
    const checkExpr = policy.with_check_expression ? ` WITH CHECK (${policy.with_check_expression})` : "";
    statements.push(`DROP POLICY IF EXISTS ${quoteIdent(policy.policy_name)} ON public.${quoteIdent(policy.table_name)}`);
    statements.push(
      `CREATE POLICY ${quoteIdent(policy.policy_name)} ON public.${quoteIdent(policy.table_name)} ${permissive} FOR ${cmd} TO ${roles}${usingExpr}${checkExpr}`,
    );
  }
  return joinWithSplit(statements);
}

function buildHeader() {
  return joinWithSplit([
    "CREATE EXTENSION IF NOT EXISTS pgcrypto",
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
  ]);
}

function buildFooter() {
  return "";
}

function main() {
  const { inPath, outPath } = parseArgs();
  const exportRoot = loadExport(inPath);
  const sql = `-- Afterten public schema (structure only, no data)
-- Generated from supabase/Supabase Schema.sql JSON export.

${[
    buildHeader(),
    buildEnumsSql(),
    buildSequencesSql(exportRoot),
    buildTablesSql(exportRoot),
    buildConstraintSql(exportRoot),
    buildIndexSql(exportRoot),
    buildViewSql(exportRoot),
    buildFunctionSql(exportRoot),
    buildTriggerSql(exportRoot),
    buildPolicySql(exportRoot),
  ]
    .filter(Boolean)
    .join("\n-- @split\n")}
`;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, sql, "utf8");
  const tableCount = (exportRoot.tables || []).filter((t) => t.table_schema === "public").length;
  const fnCount = (exportRoot.functions || []).filter((f) => f.function_schema === "public").length;
  console.log(`Wrote ${outPath}`);
  console.log(`  tables: ${tableCount}`);
  console.log(`  functions: ${fnCount}`);
  console.log(`  bytes: ${Buffer.byteLength(sql, "utf8")}`);
}

main();
