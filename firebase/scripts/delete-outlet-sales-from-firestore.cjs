/**
 * Delete all pos_sales bills (+ lines subcollections) for one outlet in Firestore.
 *
 * Run from firebase folder:
 *   DRY_RUN=1 node scripts/delete-outlet-sales-from-firestore.cjs 648e949d-8648-4c43-80d4-f08feb7bdd04
 *   node scripts/delete-outlet-sales-from-firestore.cjs 648e949d-8648-4c43-80d4-f08feb7bdd04
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const outletId = process.argv[2] ?? "648e949d-8648-4c43-80d4-f08feb7bdd04";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const billsRef = db.collection("pos_sales").doc(outletId).collection("bills");
  const before = await billsRef.count().get();
  const countBefore = before.data().count;

  console.log(DRY_RUN ? "DRY RUN" : "Deleting sales from Firestore...");
  console.log(`Outlet: ${outletId}`);
  console.log(`Bills before: ${countBefore}\n`);

  if (DRY_RUN) {
    console.log(`Would delete ${countBefore} bills (+ line subcollections).`);
    console.log("\nRun without DRY_RUN=1 to execute.");
    return;
  }

  if (countBefore === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // recursiveDelete removes all documents in bills subcollection and nested lines.
  const outletSalesRef = db.collection("pos_sales").doc(outletId);
  console.log("Running recursiveDelete on pos_sales/{outletId}/bills ...");
  console.log("(This may take several minutes for large backlogs.)\n");

  const billsCollectionRef = outletSalesRef.collection("bills");
  await db.recursiveDelete(billsCollectionRef);

  const after = await billsRef.count().get();
  console.log(`Bills after: ${after.data().count}`);

  // Clean sync failures for this outlet
  const failuresSnap = await db.collection("pos_sync_failures").where("outletId", "==", outletId).get();
  if (!failuresSnap.empty) {
    const batch = db.batch();
    failuresSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`Sync failures deleted: ${failuresSnap.size}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
