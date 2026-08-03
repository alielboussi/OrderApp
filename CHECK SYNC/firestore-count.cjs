/**
 * Count bills in Firestore for Till 1 (or another outlet).
 *
 * Run from this folder:
 *   node firestore-count.cjs
 *   node firestore-count.cjs 648e949d-8648-4c43-80d4-f08feb7bdd04
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../firebase/functions/node_modules/firebase-admin"));

const OUTLET_ID = "648e949d-8648-4c43-80d4-f08feb7bdd04";
const outletId = process.argv[2] ?? OUTLET_ID;
const keyPath = resolve(__dirname, "../secrets/afterten-firebase-adminsdk.json");

const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const col = db.collection("pos_sales").doc(outletId).collection("bills");
  const snap = await col.count().get();
  const count = snap.data().count;

  console.log("");
  console.log("=== Firestore sync check ===");
  console.log(`Outlet:  ${outletId}`);
  console.log(`Bills:   ${count}`);
  console.log("");
  console.log("Compare with mintpos-sync-status.sql:");
  console.log("  SYNC COMPLETE when firestore bills = exportable_bills_with_lines");
  console.log("  and MintPOS pending_bills = 0");
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
