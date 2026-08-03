/**
 * Remove seeded / legacy orders-app catalog data for OneWay so catalog-access is the source of truth.
 *
 *   node scripts/clear-outlet-orders-catalog.cjs
 *   node scripts/clear-outlet-orders-catalog.cjs <outletId>
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const oneWay = JSON.parse(readFileSync(resolve(__dirname, "oneway-outlet.json"), "utf8"));
const outletId = process.argv[2] ?? oneWay.outletId;

const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function deleteQuery(collection, field, value) {
  const snap = await db.collection(collection).where(field, "==", value).get();
  if (snap.empty) {
    console.log(`  ${collection}: 0 docs`);
    return 0;
  }

  let deleted = 0;
  const batchSize = 400;
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = db.batch();
    snap.docs.slice(i, i + batchSize).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += Math.min(batchSize, snap.docs.length - i);
  }
  console.log(`  ${collection}: deleted ${deleted}`);
  return deleted;
}

async function main() {
  console.log(`Clearing orders-app catalog data for outlet ${outletId} (${oneWay.name})...\n`);

  const catalogDeleted = await deleteQuery("outlet_order_catalog", "outletId", outletId);
  const allowlistDeleted = await deleteQuery("outlet_catalog_allowlist", "outlet_id", outletId);

  console.log("\nDone.");
  console.log(`  outlet_order_catalog: ${catalogDeleted}`);
  console.log(`  outlet_catalog_allowlist: ${allowlistDeleted}`);
  console.log("\nAssign products from portal:");
  console.log("  Warehouse_Backoffice → Outlets → Outlet Catalog Access");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
