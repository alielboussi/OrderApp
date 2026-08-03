/**
 * Delete ALL bill documents (and line subcollections) for an outlet in Firestore.
 *
 * Usage:
 *   node firestore-delete-outlet-bills.cjs
 *   node firestore-delete-outlet-bills.cjs 648e949d-8648-4c43-80d4-f08feb7bdd04 --confirm
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../firebase/functions/node_modules/firebase-admin"));

const OUTLET_ID = "648e949d-8648-4c43-80d4-f08feb7bdd04";
const outletId = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : OUTLET_ID;
const confirmed = process.argv.includes("--confirm");
const keyPath = resolve(__dirname, "../secrets/afterten-firebase-adminsdk.json");

const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function deleteBillDoc(docRef, bulkWriter) {
  const linesSnap = await docRef.collection("lines").select().get();
  for (const lineDoc of linesSnap.docs) {
    bulkWriter.delete(lineDoc.ref);
  }
  bulkWriter.delete(docRef);
}

async function deleteOutletBills() {
  const col = db.collection("pos_sales").doc(outletId).collection("bills");
  const countSnap = await col.count().get();
  const total = countSnap.data().count;

  console.log("");
  console.log("=== Firestore delete outlet bills ===");
  console.log(`Outlet: ${outletId}`);
  console.log(`Bills:  ${total}`);
  console.log("");

  if (!confirmed) {
    console.log("Dry run only. Re-run with --confirm to delete.");
    return;
  }

  const bulkWriter = db.bulkWriter();
  bulkWriter.onWriteError((error) => {
    if (error.failedAttempts < 8) {
      return true;
    }
    console.error("Write failed:", error.message);
    return false;
  });

  let queued = 0;
  while (true) {
    const snap = await col.limit(200).get();
    if (snap.empty) {
      break;
    }

    await Promise.all(snap.docs.map((doc) => deleteBillDoc(doc.ref, bulkWriter)));
    queued += snap.size;
    if (queued % 500 === 0 || snap.size < 200) {
      console.log(`Queued delete for ${queued}/${total} bills...`);
    }
  }

  await bulkWriter.close();

  const failuresCol = db.collection("pos_sync_failures");
  const failuresSnap = await failuresCol.where("outletId", "==", outletId).get();
  if (!failuresSnap.empty) {
    const failureWriter = db.bulkWriter();
    failuresSnap.docs.forEach((doc) => failureWriter.delete(doc.ref));
    await failureWriter.close();
    console.log(`Deleted ${failuresSnap.size} pos_sync_failures docs for outlet.`);
  }

  const remaining = (await col.count().get()).data().count;
  console.log("");
  console.log(`Done. Remaining bills: ${remaining}`);
  console.log("");
}

deleteOutletBills().catch((err) => {
  console.error(err);
  process.exit(1);
});
