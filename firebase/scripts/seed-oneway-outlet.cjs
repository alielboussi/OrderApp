/**
 * Seed OneWay outlet + warehouse in Firestore and re-link the orders app user.
 *
 * Run from firebase folder:
 *   node scripts/seed-oneway-outlet.cjs
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const oneWay = JSON.parse(readFileSync(resolve(__dirname, "oneway-outlet.json"), "utf8"));
const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const now = new Date().toISOString();

async function seedFirestoreOutlet() {
  const batch = db.batch();
  const outletRef = db.collection("outlets").doc(oneWay.outletId);

  batch.set(
    outletRef,
    {
      name: oneWay.name,
      code: oneWay.code,
      hasPosMiddleware: false,
      usesOrdersApp: true,
      warehouseIds: [oneWay.warehouseId],
      warehouseName: oneWay.name,
      active: true,
      cloudBackend: "firebase",
      updatedAt: now,
    },
    { merge: true },
  );

  batch.set(
    db.collection("outlet_heartbeats").doc(oneWay.outletId),
    {
      outletId: oneWay.outletId,
      pendingSalesCount: 0,
      lastSyncError: null,
      lastSaleUploadedAt: null,
      middlewareVersion: null,
      updatedAt: now,
    },
    { merge: true },
  );

  batch.set(
    db.collection("outlet_counters").doc(oneWay.outletId),
    {
      outletId: oneWay.outletId,
      posSyncOpeningLastValue: null,
      posSyncCutoffLastValue: null,
      updatedAt: now,
    },
    { merge: true },
  );

  await batch.commit();
}

async function main() {
  await seedFirestoreOutlet();
  console.log(`Seeded Firestore outlet: ${oneWay.name}`);
  console.log(`  Outlet ID:    ${oneWay.outletId}`);
  console.log(`  Warehouse ID: ${oneWay.warehouseId}`);
  console.log("");
  console.log("Next:");
  console.log("  1) Run supabase/scripts/add-oneway-outlet.sql in Supabase SQL Editor");
  console.log("  2) node scripts/seed-orders-app.cjs  (links oneway@gmail.com to OneWay)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
