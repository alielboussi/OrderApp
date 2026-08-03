/**
 * Step 2.2 — Seed outlet + heartbeat + counter docs in Firestore (no sales data).
 *
 * Copy outlet-warehouse-ids.template.json → outlet-warehouse-ids.json and fill
 * warehouse UUIDs from Supabase (outlets.default_sales_warehouse_id).
 *
 * Run from firebase/functions:
 *   cd C:\Projects\Afterten\firebase\functions
 *   node ../scripts/seed-outlets.cjs
 */
const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const oneWay = JSON.parse(readFileSync(resolve(__dirname, "oneway-outlet.json"), "utf8"));

const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
const warehouseMapPath = resolve(__dirname, "outlet-warehouse-ids.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const now = new Date().toISOString();

const OUTLETS = [
  { id: "648e949d-8648-4c43-80d4-f08feb7bdd04", name: "Till 1", hasPosMiddleware: true, usesOrdersApp: false },
  { id: "a655b0a1-a37a-43d6-aa55-7f97377b2660", name: "Till 2", hasPosMiddleware: true, usesOrdersApp: false },
  { id: "a406fede-7aab-4473-8e9f-ff645267466f", name: "Quick Corner", hasPosMiddleware: true, usesOrdersApp: false },
  {
    id: oneWay.outletId,
    name: oneWay.name,
    hasPosMiddleware: false,
    usesOrdersApp: true,
    warehouseIds: [oneWay.warehouseId],
    warehouseName: oneWay.name,
  },
];

function loadWarehouseMap() {
  if (!existsSync(warehouseMapPath)) {
    console.warn(
      "outlet-warehouse-ids.json not found — seeding outlets with empty warehouseIds.",
    );
    console.warn("Copy outlet-warehouse-ids.template.json and fill warehouse UUIDs from Supabase.");
    return {};
  }
  return JSON.parse(readFileSync(warehouseMapPath, "utf8"));
}

async function main() {
  const warehouseMap = loadWarehouseMap();
  const batch = db.batch();

  for (const outlet of OUTLETS) {
    const mapped = warehouseMap[outlet.id] ?? {};
    const warehouseIds = Array.isArray(outlet.warehouseIds)
      ? outlet.warehouseIds
      : Array.isArray(mapped.warehouseIds)
        ? mapped.warehouseIds.filter((id) => typeof id === "string" && !id.includes("REPLACE"))
        : [];

    const outletRef = db.collection("outlets").doc(outlet.id);
    batch.set(
      outletRef,
      {
        name: outlet.name,
        hasPosMiddleware: outlet.hasPosMiddleware !== false,
        usesOrdersApp: outlet.usesOrdersApp !== false,
        warehouseIds,
        warehouseName: outlet.warehouseName ?? mapped.warehouseName ?? null,
        active: true,
        cloudBackend: "firebase",
        updatedAt: now,
      },
      { merge: true },
    );

    const heartbeatRef = db.collection("outlet_heartbeats").doc(outlet.id);
    batch.set(
      heartbeatRef,
      {
        outletId: outlet.id,
        pendingSalesCount: 0,
        lastSyncError: null,
        lastSaleUploadedAt: null,
        middlewareVersion: null,
        updatedAt: now,
      },
      { merge: true },
    );

    const counterRef = db.collection("outlet_counters").doc(outlet.id);
    batch.set(
      counterRef,
      {
        outletId: outlet.id,
        posSyncOpeningLastValue: null,
        posSyncCutoffLastValue: null,
        updatedAt: now,
      },
      { merge: true },
    );
  }

  await batch.commit();
  console.log(`Seeded ${OUTLETS.length} outlets + heartbeats + counters:`);
  for (const o of OUTLETS) {
    const mapped = warehouseMap[o.id] ?? {};
    const count = Array.isArray(mapped.warehouseIds) ? mapped.warehouseIds.length : 0;
    console.log(`  - ${o.name} (${o.id}) warehouses=${count}`);
  }
  console.log("Done. No bills copied — Supabase sales sync unchanged until middleware cutover.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
