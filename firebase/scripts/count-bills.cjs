/**
 * Count bills in Firestore for an outlet.
 *
 * Run from firebase/functions:
 *   node ../scripts/count-bills.cjs
 *   node ../scripts/count-bills.cjs 648e949d-8648-4c43-80d4-f08feb7bdd04
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const outletId = process.argv[2] ?? "648e949d-8648-4c43-80d4-f08feb7bdd04";
const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const col = db.collection("pos_sales").doc(outletId).collection("bills");
  const snap = await col.count().get();
  console.log(`Outlet ${outletId}: ${snap.data().count} bills`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
