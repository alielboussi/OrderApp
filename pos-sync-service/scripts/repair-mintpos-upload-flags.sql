-- One-time / optional: align MintPOS upload flags after middleware repair deploy.
-- Safe to re-run. Does NOT re-upload sales; only fixes local Pending flags when Sale is already Processed.
--
-- Run on outlet MINTPOS database (Till 1 / Till 2 / Quick Corner) in SSMS.

USE [MINTPOS];
GO

BEGIN TRANSACTION;

UPDATE sd
SET sd.uploadstatus = 'Processed'
FROM dbo.Saledetails sd
INNER JOIN dbo.Sale s ON s.Id = sd.saleid
WHERE s.uploadstatus = 'Processed'
  AND (sd.uploadstatus IS NULL OR sd.uploadstatus IN ('Pending', 'pending'));

DECLARE @lines_repaired int = @@ROWCOUNT;

UPDATE bt
SET bt.uploadStatus = 'Processed'
FROM dbo.BillType bt
INNER JOIN dbo.Sale s ON s.Id = bt.saleid
WHERE s.uploadstatus = 'Processed'
  AND (bt.uploadStatus IS NULL OR bt.uploadStatus IN ('Pending', 'pending'));

DECLARE @bills_repaired int = @@ROWCOUNT;

SELECT
    @lines_repaired AS saledetails_rows_repaired,
    @bills_repaired AS billtype_rows_repaired,
    (SELECT COUNT(*) FROM dbo.Sale WHERE uploadstatus IS NULL OR uploadstatus IN ('Pending', 'pending')) AS sales_still_unsynced;

COMMIT;
