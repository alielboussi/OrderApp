/**
 * Full audit: Cloud Scheduler jobs + Cloud Functions named syncStockCatalog*
 * across all GCP regions. Uses Firebase CLI login token.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FT = "C:/Users/aliel/AppData/Roaming/npm/node_modules/firebase-tools/lib";
const auth = require(`${FT}/auth`);
const apiv2 = require(`${FT}/apiv2`);
const scopes = require(`${FT}/scopes`);

const PROJECT = "afterten-portal-system";

async function getToken() {
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error("Not logged in. Run: firebase login");
  }
  apiv2.setRefreshToken(account.tokens.refresh_token);
  const tokens = await auth.getAccessToken(account.tokens.refresh_token, [scopes.CLOUD_PLATFORM]);
  return typeof tokens === "string" ? tokens : tokens.access_token;
}

async function api(method, url, body) {
  const bearer = await getToken();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* text */
  }
  return { status: res.status, body: parsed };
}

async function listSchedulerLocations() {
  const url = `https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations`;
  return api("GET", url);
}

async function listSchedulerJobs(location) {
  const url = `https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations/${location}/jobs`;
  return api("GET", url);
}

async function listFunctionLocations() {
  const url = `https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations`;
  return api("GET", url);
}

async function listFunctions(location) {
  const url = `https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/${location}/functions`;
  return api("GET", url);
}

function isSyncRelated(name) {
  const n = String(name).toLowerCase();
  return (
    n.includes("syncstockcatalog") ||
    n.includes("stock-catalog-sync") ||
    n.includes("stockcatalogsync")
  );
}

async function main() {
  console.log("=== SYNC INFRASTRUCTURE AUDIT ===");
  console.log(`Project: ${PROJECT}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const syncJobs = [];
  const syncFunctions = [];
  const allJobs = [];
  const errors = [];

  console.log("--- Cloud Scheduler: all regions ---");
  const locs = await listSchedulerLocations();
  if (locs.status !== 200) {
    console.log("Failed to list scheduler locations:", locs.status, locs.body);
    errors.push("scheduler locations");
  } else {
    const locations = (locs.body?.locations ?? []).map((l) => l.locationId).filter(Boolean);
    console.log(`Found ${locations.length} scheduler regions\n`);
    for (const location of locations) {
      const jobs = await listSchedulerJobs(location);
      if (jobs.status !== 200) {
        if (jobs.status !== 404) {
          errors.push(`scheduler ${location}: ${jobs.status}`);
        }
        continue;
      }
      for (const job of jobs.body?.jobs ?? []) {
        allJobs.push({ location, name: job.name, state: job.state, schedule: job.schedule });
        if (isSyncRelated(job.name)) {
          syncJobs.push(job);
        }
      }
    }
    if (allJobs.length === 0) {
      console.log("No Cloud Scheduler jobs in any region.");
    } else {
      for (const job of allJobs) {
        const flag = isSyncRelated(job.name) ? " *** SYNC ***" : "";
        console.log(`  [${job.location}] ${job.name} (${job.state}) ${job.schedule ?? ""}${flag}`);
      }
    }
  }

  console.log("\n--- Cloud Functions v2: all regions ---");
  const fnLocs = await listFunctionLocations();
  if (fnLocs.status !== 200) {
    console.log("Failed to list function locations:", fnLocs.status, fnLocs.body);
    errors.push("function locations");
  } else {
    const locations = (fnLocs.body?.locations ?? []).map((l) => l.locationId).filter(Boolean);
    console.log(`Scanning ${locations.length} function regions\n`);
    for (const location of locations) {
      const fns = await listFunctions(location);
      if (fns.status !== 200) continue;
      for (const fn of fns.body?.functions ?? []) {
        const shortName = fn.name?.split("/").pop() ?? fn.name;
        if (isSyncRelated(shortName) || isSyncRelated(fn.name)) {
          syncFunctions.push({
            location,
            name: shortName,
            fullName: fn.name,
            state: fn.state,
            labels: fn.labels,
          });
          console.log(`  *** SYNC *** [${location}] ${shortName} state=${fn.state}`);
        }
      }
    }
    if (syncFunctions.length === 0) {
      console.log("No syncStockCatalog* Cloud Functions found in any region.");
    }
  }

  console.log("\n--- SUMMARY ---");
  console.log(`Scheduler jobs (total): ${allJobs.length}`);
  console.log(`Scheduler jobs (sync-related): ${syncJobs.length}`);
  console.log(`Cloud Functions (sync-related): ${syncFunctions.length}`);
  if (errors.length) console.log(`Errors: ${errors.join("; ")}`);

  const clean = syncJobs.length === 0 && !syncFunctions.some((f) => f.name === "syncStockCatalogScheduled");
  console.log(clean ? "\nRESULT: syncStockCatalogScheduled NOT FOUND in GCP." : "\nRESULT: SYNC ARTIFACTS STILL PRESENT — see above.");

  process.exit(clean ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
