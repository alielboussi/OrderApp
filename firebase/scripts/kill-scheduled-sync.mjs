/**
 * One-off: remove syncStockCatalogScheduled and any related Cloud Scheduler jobs.
 * Uses the same Firebase CLI login token as `firebase deploy`.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FT = "C:/Users/aliel/AppData/Roaming/npm/node_modules/firebase-tools/lib";
const auth = require(`${FT}/auth`);
const apiv2 = require(`${FT}/apiv2`);
const scopes = require(`${FT}/scopes`);

async function getToken() {
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error("Not logged in. Run: firebase login");
  }
  apiv2.setRefreshToken(account.tokens.refresh_token);
  return auth.getAccessToken(account.tokens.refresh_token, [scopes.CLOUD_PLATFORM]);
}

const PROJECT = "afterten-portal-system";
const REGIONS = ["europe-west1", "africa-south1", "us-central1"];
const FUNCTION_NAME = "syncStockCatalogScheduled";

async function apiFetch(url, options = {}) {
  const tokens = await getToken();
  const bearer = typeof tokens === "string" ? tokens : tokens.access_token;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* plain text */
  }
  return { status: res.status, body };
}

async function listSchedulerJobs(region) {
  const url = `https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations/${region}/jobs`;
  return apiFetch(url);
}

async function deleteSchedulerJob(name) {
  const url = `https://cloudscheduler.googleapis.com/v1/${name}`;
  return apiFetch(url, { method: "DELETE" });
}

async function deleteCloudFunction(region) {
  const url = `https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/${region}/functions/${FUNCTION_NAME}`;
  return apiFetch(url, { method: "DELETE" });
}

async function deleteCloudRunService(region) {
  const url = `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${region}/services/${FUNCTION_NAME.toLowerCase()}`;
  return apiFetch(url, { method: "DELETE" });
}

function isSyncJob(name) {
  const lower = name.toLowerCase();
  return lower.includes("syncstockcatalog") || lower.includes("stock-catalog");
}

async function main() {
  console.log(`Project: ${PROJECT}\n`);

  for (const region of REGIONS) {
    console.log(`--- Scheduler jobs (${region}) ---`);
    const listed = await listSchedulerJobs(region);
    if (listed.status !== 200) {
      console.log(`  list failed: ${listed.status}`, listed.body);
      continue;
    }
    const jobs = listed.body?.jobs ?? [];
    if (jobs.length === 0) {
      console.log("  (none)");
      continue;
    }
    for (const job of jobs) {
      console.log(`  ${job.name} [${job.state ?? "?"}]`);
      if (isSyncJob(job.name)) {
        const deleted = await deleteSchedulerJob(job.name);
        console.log(`    -> delete ${deleted.status}`, deleted.body);
      }
    }
  }

  for (const region of REGIONS) {
    console.log(`\n--- Cloud Function ${FUNCTION_NAME} (${region}) ---`);
    const deleted = await deleteCloudFunction(region);
    console.log(`  delete: ${deleted.status}`, deleted.body);
  }

  console.log(`\n--- Cloud Run service (${REGIONS[0]}) ---`);
  const runDeleted = await deleteCloudRunService(REGIONS[0]);
  console.log(`  delete: ${runDeleted.status}`, runDeleted.body);

  console.log("\nDone. Run: firebase functions:list --project afterten-portal-system");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
