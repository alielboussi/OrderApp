/**
 * Sample bills from Firestore for an outlet — shows occurredAt + sourceEventId.
 *
 *   node ../scripts/sample-bills.cjs <outletId> [limit]
 */
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const outletId = process.argv[2] ?? "a655b0a1-a37a-43d6-aa55-7f97377b2660";
const limit = Number(process.argv[3] ?? 5);
const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const col = db.collection("pos_sales").doc(outletId).collection("bills");
  const snap = await col.orderBy("occurredAt", "desc").limit(limit).get();
  console.log(`Outlet ${outletId}: showing ${snap.size} most recent bills\n`);
  for (const doc of snap.docs) {
    const d = doc.data();
    const occurredAt = d.occurredAt?.toDate?.() ?? d.occurredAt;
    console.log({
      docId: doc.id,
      sourceEventId: d.sourceEventId,
      occurredAt: occurredAt instanceof Date ? occurredAt.toISOString() : occurredAt,
      shiftId: d.shiftId,
    });
  }

  const oldest = await col.orderBy("occurredAt", "asc").limit(3).get();
  console.log("\nOldest bills:");
  for (const doc of oldest.docs) {
    const d = doc.data();
    const occurredAt = d.occurredAt?.toDate?.() ?? d.occurredAt;
    console.log({
      docId: doc.id,
      sourceEventId: d.sourceEventId,
      occurredAt: occurredAt instanceof Date ? occurredAt.toISOString() : occurredAt,
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
