/**
 * Run all Supabase → Firestore portal migrations in order.
 *
 *   node scripts/migrate-all-portal-data-from-supabase.cjs
 *
 * Set DRY_RUN=1 to preview counts only.
 */
const { spawnSync } = require("child_process");
const { resolve } = require("path");

const scriptsDir = __dirname;
const steps = [
  "migrate-reference-data-from-supabase.cjs",
  "migrate-catalog-from-supabase.cjs",
  "migrate-portal-operational-data-from-supabase.cjs",
  "migrate-remaining-portal-data-from-supabase.cjs",
];

const env = { ...process.env };
const dryRun = env.DRY_RUN === "1" || env.DRY_RUN === "true";

console.log(dryRun ? "=== DRY RUN: all portal migrations ===\n" : "=== Portal data migration ===\n");

for (const script of steps) {
  console.log(`\n--- ${script} ---\n`);
  const result = spawnSync(process.execPath, [resolve(scriptsDir, script)], {
    stdio: "inherit",
    env,
    cwd: resolve(scriptsDir, ".."),
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("\nAll migration steps completed.");
