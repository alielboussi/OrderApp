/**
 * Shared Supabase admin client for migration scripts.
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env or portal .env.local.
 */
const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");
const { createRequire } = require("module");

const portalRequire = createRequire(resolve(__dirname, "../../../afterten-website-portal/package.json"));
const { createClient } = portalRequire("@supabase/supabase-js");

function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
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
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

function loadEnv() {
  const portalEnv = resolve(__dirname, "../../../afterten-website-portal/.env.local");
  loadDotEnvFile(portalEnv);
}

function getSupabaseConfig() {
  loadEnv();
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Set them in afterten-website-portal/.env.local",
    );
  }
  return { url, serviceRoleKey };
}

function createSupabaseAdmin() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

module.exports = {
  loadEnv,
  getSupabaseConfig,
  createSupabaseAdmin,
};
