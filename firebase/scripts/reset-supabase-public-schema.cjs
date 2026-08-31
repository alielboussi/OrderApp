/**
 * Drop and recreate public schema (keeps firestore_mirror).
 * Use before re-applying a failed partial schema migration.
 */
const { createRequire } = require("module");
const { resolve } = require("path");
const { loadEnv } = require("./lib/supabase-client.cjs");
const { buildDbUrls } = require("./lib/supabase-db-urls.cjs");

loadEnv();
const { Client } = createRequire(resolve(__dirname, "../../package.json"))("pg");

const RESET_SQL = `
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO service_role;
`;

(async () => {
  const dbUrls = buildDbUrls();
  let lastError = null;
  for (const connectionString of dbUrls) {
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      await client.query(RESET_SQL);
      await client.end();
      console.log("Public schema reset complete.");
      return;
    } catch (error) {
      lastError = error;
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }
  throw lastError;
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
