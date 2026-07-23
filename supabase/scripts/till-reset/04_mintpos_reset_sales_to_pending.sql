-- =============================================================================
-- 04 — Reset ALL exportable MintPOS sales to Pending (Till PC)
-- =============================================================================
-- WHERE: SSMS on Till PC → database MINTPOS
-- RUN:   On Till 1 PC, then again on Till 2 PC
-- AFTER: 02_supabase_verify_till_wipe.sql passed (0/0/0 twice)
-- BEFORE: Install/start SCPGT
--
-- Resets: Sale + BillType + Saledetails for every bill with product lines.
-- Skips:  orphan Sale rows (no BillType) — SCPGT cannot upload those.
--
-- PASS: still_processed_with_lines = 0
--       exportable_pending_with_lines = your bill count
-- NEXT: 05_mintpos_list_product_variant_skus.sql (SKU check)
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
