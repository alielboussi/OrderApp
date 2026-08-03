/**
 * Export Firestore bill IDs for an outlet and generate SQL to re-queue
 * MintPOS Processed bills that are missing from Firestore.
 *
 * Run from firebase/functions:
 *   node ../scripts/generate-requeue-missing-sql.cjs
 *   node ../scripts/generate-requeue-missing-sql.cjs --out ../scripts/till1-requeue-missing.sql
 */
const { readFileSync, writeFileSync } = require("fs");
const { resolve } = require("path");
const admin = require(resolve(__dirname, "../functions/node_modules/firebase-admin"));

const OUTLET_ID = "648e949d-8648-4c43-80d4-f08feb7bdd04";
const OUTLET_PREFIX = `${OUTLET_ID}-`;

const outArgIdx = process.argv.indexOf("--out");
const outPath = outArgIdx >= 0
  ? resolve(process.cwd(), process.argv[outArgIdx + 1])
  : resolve(__dirname, "till1-requeue-missing.sql");

const keyPath = resolve(__dirname, "../../secrets/afterten-firebase-adminsdk.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function fetchFirestoreBillIds(outletId) {
  const col = db.collection("pos_sales").doc(outletId).collection("bills");
  const billIds = new Set();
  let lastDoc = null;
  const pageSize = 1000;

  while (true) {
    let q = col.orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (lastDoc) {
      q = q.startAfter(lastDoc);
    }

    const snap = await q.get();
    if (snap.empty) {
      break;
    }

    for (const doc of snap.docs) {
      const id = doc.id;
      if (id.startsWith(OUTLET_PREFIX)) {
        billIds.add(id.slice(OUTLET_PREFIX.length));
      } else {
        billIds.add(id);
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) {
      break;
    }
  }

  return billIds;
}

function buildSql(outletId, billIds) {
  const json = JSON.stringify([...billIds].sort((a, b) => Number(a) - Number(b)));
  const escapedJson = json.replace(/'/g, "''");

  return `-- Re-queue MintPOS Processed bills missing from Firestore (Till 1)
-- Generated ${new Date().toISOString()}
-- Firestore bills present: ${billIds.size}
-- Outlet: ${outletId}
--
-- BEFORE: Stop SCPGT service on Till 1
-- AFTER:  Start SCPGT — missing bills upload to Firebase (existing bills merge safely)

USE [MINTPOS];
GO

SET NOCOUNT ON;

DECLARE @firestore_bills_json NVARCHAR(MAX) = N'${escapedJson}';

IF OBJECT_ID('tempdb..#firestore_bills') IS NOT NULL DROP TABLE #firestore_bills;
CREATE TABLE #firestore_bills (bill_id NVARCHAR(64) NOT NULL PRIMARY KEY);

INSERT INTO #firestore_bills (bill_id)
SELECT LTRIM(RTRIM(value))
FROM OPENJSON(@firestore_bills_json)
WHERE LTRIM(RTRIM(value)) <> '';

SELECT
  (SELECT COUNT(DISTINCT s.Id)
   FROM dbo.Sale s WITH (NOLOCK)
   INNER JOIN dbo.BillType bt WITH (NOLOCK) ON bt.saleid = s.Id
   WHERE s.uploadstatus = 'Processed'
     AND EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id)
  ) AS processed_in_mintpos,

  (SELECT COUNT(*) FROM #firestore_bills) AS present_in_firestore,

  (SELECT COUNT(DISTINCT bt.id)
   FROM dbo.Sale s WITH (NOLOCK)
   INNER JOIN dbo.BillType bt WITH (NOLOCK) ON bt.saleid = s.Id
   WHERE s.uploadstatus = 'Processed'
     AND EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id)
     AND CAST(bt.id AS NVARCHAR(64)) NOT IN (SELECT bill_id FROM #firestore_bills)
  ) AS to_requeue;

BEGIN TRANSACTION;

UPDATE sd
SET sd.uploadstatus = 'Pending'
FROM dbo.Saledetails sd
INNER JOIN dbo.Sale s ON s.Id = sd.saleid
INNER JOIN dbo.BillType bt ON bt.saleid = s.Id
WHERE s.uploadstatus = 'Processed'
  AND CAST(bt.id AS NVARCHAR(64)) NOT IN (SELECT bill_id FROM #firestore_bills);

DECLARE @lines_requeued INT = @@ROWCOUNT;

UPDATE bt
SET bt.uploadStatus = 'Pending'
FROM dbo.BillType bt
INNER JOIN dbo.Sale s ON s.Id = bt.saleid
WHERE s.uploadstatus = 'Processed'
  AND CAST(bt.id AS NVARCHAR(64)) NOT IN (SELECT bill_id FROM #firestore_bills)
  AND EXISTS (SELECT 1 FROM dbo.Saledetails sd WHERE sd.saleid = s.Id);

DECLARE @bills_requeued INT = @@ROWCOUNT;

UPDATE s
SET s.uploadstatus = 'Pending'
FROM dbo.Sale s
INNER JOIN dbo.BillType bt ON bt.saleid = s.Id
WHERE s.uploadstatus = 'Processed'
  AND CAST(bt.id AS NVARCHAR(64)) NOT IN (SELECT bill_id FROM #firestore_bills)
  AND EXISTS (SELECT 1 FROM dbo.Saledetails sd WHERE sd.saleid = s.Id);

DECLARE @sales_requeued INT = @@ROWCOUNT;

COMMIT TRANSACTION;

SELECT
  @sales_requeued AS sales_requeued,
  @bills_requeued AS bills_requeued,
  @lines_requeued AS lines_requeued,

  (SELECT COUNT(DISTINCT s.Id)
   FROM dbo.Sale s WITH (NOLOCK)
   INNER JOIN dbo.BillType bt WITH (NOLOCK) ON bt.saleid = s.Id
   WHERE (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
     AND EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id)
  ) AS pending_after_requeue;

GO
`;
}

async function main() {
  console.log(`Fetching Firestore bills for outlet ${OUTLET_ID}...`);
  const billIds = await fetchFirestoreBillIds(OUTLET_ID);
  console.log(`Found ${billIds.size} bills in Firestore.`);

  const sql = buildSql(OUTLET_ID, billIds);
  writeFileSync(outPath, sql, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log("Next: stop SCPGT on Till 1, run this SQL in SSMS, then start SCPGT.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
