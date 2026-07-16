-- =============================================================================
-- 03 — Reset ALL exportable MintPOS sales to Pending (Quick Corner PC)
-- =============================================================================
-- WHERE: SSMS on Quick Corner PC → database MINTPOS
-- AFTER: 01 + 02 passed (Supabase 0/0/0, heartbeat stale)
-- BEFORE: Start-Service SCPGT
--
-- Resets: Sale + BillType + Saledetails for every bill with product lines.
-- Skips:  orphan Sale rows (no BillType) — SCPGT cannot upload those.
--
-- PASS: still_processed_with_lines = 0
--       exportable_pending_with_lines = your bill count
-- THEN: Start-Service SCPGT on till PC
-- =============================================================================

USE [MINTPOS];
GO

SET NOCOUNT ON;

SELECT
  (SELECT COUNT(DISTINCT bt.id)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
   WHERE EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id)
  ) AS bills_with_lines_total,

  (SELECT COUNT(DISTINCT bt.id)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
   WHERE EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id)
     AND s.uploadstatus = 'Processed'
  ) AS currently_processed_to_requeue;

GO

BEGIN TRANSACTION;

UPDATE sd
SET sd.uploadstatus = 'Pending'
FROM dbo.Saledetails sd
INNER JOIN dbo.Sale s ON s.Id = sd.saleid
INNER JOIN dbo.BillType bt ON bt.saleid = s.Id;

DECLARE @lines_requeued int = @@ROWCOUNT;

UPDATE bt
SET bt.uploadStatus = 'Pending'
FROM dbo.BillType bt
INNER JOIN dbo.Sale s ON s.Id = bt.saleid
WHERE EXISTS (SELECT 1 FROM dbo.Saledetails sd WHERE sd.saleid = s.Id);

DECLARE @bills_requeued int = @@ROWCOUNT;

UPDATE s
SET s.uploadstatus = 'Pending'
FROM dbo.Sale s
INNER JOIN dbo.BillType bt ON bt.saleid = s.Id
WHERE EXISTS (SELECT 1 FROM dbo.Saledetails sd WHERE sd.saleid = s.Id);

DECLARE @sales_requeued int = @@ROWCOUNT;

COMMIT TRANSACTION;

SELECT
  @sales_requeued AS sales_requeued,
  @bills_requeued AS bills_requeued,
  @lines_requeued AS lines_requeued,

  (SELECT COUNT(DISTINCT bt.id)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
   WHERE EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id)
     AND (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
  ) AS exportable_pending_with_lines,

  (SELECT COUNT(DISTINCT bt.id)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
   WHERE EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id)
     AND s.uploadstatus = 'Processed'
  ) AS still_processed_with_lines;

GO
