-- Re-queue MintPOS sales from a start date through today back to Pending.
-- SCPGT will upload them to Supabase on the next sync cycle.
--
-- Run in SSMS on the till PC against database MINTPOS.
-- BEFORE: Stop SCPGT service.
-- AFTER:  Start SCPGT with Cloud:Backend = Portal.
--
-- Edit @FromDate below if needed (sale date = dbo.Sale.Date).

USE [MINTPOS];
GO

SET NOCOUNT ON;

DECLARE @FromDate date = '2026-08-01';

SELECT
  @FromDate AS from_sale_date,
  COUNT(DISTINCT bt.id) AS bills_in_range_with_lines,
  COUNT(DISTINCT CASE WHEN s.uploadstatus = 'Processed' THEN bt.id END) AS processed_in_range,
  COUNT(DISTINCT CASE
    WHEN s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending') THEN bt.id
  END) AS already_pending_in_range
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
WHERE CAST(s.Date AS date) >= @FromDate
  AND EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id);

BEGIN TRANSACTION;

UPDATE sd
SET sd.uploadstatus = 'Pending'
FROM dbo.Saledetails sd
INNER JOIN dbo.Sale s ON s.Id = sd.saleid
INNER JOIN dbo.BillType bt ON bt.saleid = s.Id
WHERE CAST(s.Date AS date) >= @FromDate
  AND EXISTS (SELECT 1 FROM dbo.Saledetails x WHERE x.saleid = s.Id);

DECLARE @lines_requeued int = @@ROWCOUNT;

UPDATE bt
SET bt.uploadStatus = 'Pending'
FROM dbo.BillType bt
INNER JOIN dbo.Sale s ON s.Id = bt.saleid
WHERE CAST(s.Date AS date) >= @FromDate
  AND EXISTS (SELECT 1 FROM dbo.Saledetails sd WHERE sd.saleid = s.Id);

DECLARE @bills_requeued int = @@ROWCOUNT;

UPDATE s
SET s.uploadstatus = 'Pending'
FROM dbo.Sale s
INNER JOIN dbo.BillType bt ON bt.saleid = s.Id
WHERE CAST(s.Date AS date) >= @FromDate
  AND EXISTS (SELECT 1 FROM dbo.Saledetails sd WHERE sd.saleid = s.Id);

DECLARE @sales_requeued int = @@ROWCOUNT;

COMMIT TRANSACTION;

SELECT
  @FromDate AS from_sale_date,
  @sales_requeued AS sales_requeued,
  @bills_requeued AS bills_requeued,
  @lines_requeued AS lines_requeued,
  (SELECT COUNT(DISTINCT bt.id)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
   WHERE CAST(s.Date AS date) >= @FromDate
     AND EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id)
     AND (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
  ) AS pending_in_range_after;

GO
