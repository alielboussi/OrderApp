-- =============================================================================
-- 1 — MintPOS monitor (SSMS on Quick Corner PC → database MINTPOS)
-- =============================================================================
-- READ-ONLY. Pair with: 2_supabase_monitor.sql (while draining)
-- Final check: Query E + Query B here, then 3_supabase_final_verify.sql
--
-- Quick Corner outlet: a406fede-7aab-4473-8e9f-ff645267466f
-- API: https://aftertentransfers.app/api/outlet-middleware-sales/quick-corner
--
-- Run one query block at a time (highlight → Run).
-- =============================================================================

USE [MINTPOS];
GO

DECLARE @OutletUuid varchar(36) = 'a406fede-7aab-4473-8e9f-ff645267466f';

-- -----------------------------------------------------------------------------
-- Query A) Ground truth summary
-- -----------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
  ) AS exportable_bills_total,
  (SELECT COUNT(*)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
   WHERE s.uploadstatus = 'Processed'
     AND bt.uploadStatus = 'Processed'
  ) AS exportable_processed,
  (SELECT COUNT(*)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
   WHERE (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
     AND (bt.uploadStatus IS NULL OR bt.uploadStatus IN ('Pending', 'pending'))
  ) AS exportable_pending,
  (SELECT MIN(bt.id)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
  ) AS min_pos_bill_id,
  (SELECT MAX(bt.id)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
  ) AS max_pos_bill_id,
  (SELECT COUNT(*)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
   WHERE s.uploadstatus = 'Processed'
     AND (bt.uploadStatus IS NULL OR bt.uploadStatus IN ('Pending', 'pending'))
  ) AS flag_mismatch_sale_processed_bill_pending,
  (SELECT COUNT(*)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
   WHERE (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
     AND bt.uploadStatus = 'Processed'
  ) AS flag_mismatch_sale_pending_bill_processed;
GO

-- -----------------------------------------------------------------------------
-- Query B) Drain monitor — run every ~15 min while SCPGT is running
-- scpgt_queue_pending = what SCPGT drains (Sale.uploadstatus only)
-- -----------------------------------------------------------------------------
DECLARE @OutletUuid varchar(36) = 'a406fede-7aab-4473-8e9f-ff645267466f';

SELECT
  (SELECT COUNT(*)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
  ) AS exportable_bills_total,
  (SELECT COUNT(*)
   FROM dbo.Sale s WITH (NOLOCK)
   WHERE s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending')
  ) AS scpgt_queue_pending,
  (SELECT COUNT(*)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
   WHERE (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
     AND (bt.uploadStatus IS NULL OR bt.uploadStatus IN ('Pending', 'pending'))
  ) AS strict_both_pending,
  CASE
    WHEN (SELECT COUNT(*)
          FROM dbo.Sale s WITH (NOLOCK)
          WHERE s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending')
         ) = 0
     AND (SELECT COUNT(DISTINCT bt.id)
          FROM dbo.BillType bt WITH (NOLOCK)
          JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
          WHERE EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id)
         ) >= 8000
    THEN 'PASS — queue drained; run Query E then 3_supabase_final_verify.sql'
    WHEN (SELECT COUNT(*)
          FROM dbo.Sale s WITH (NOLOCK)
          WHERE s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending')
         ) > 0
    THEN 'IN PROGRESS — SCPGT draining; watch C:\ProgramData\SCPGT\log.txt'
    ELSE 'REVIEW — unexpected counts; check SCPGT service is running'
  END AS verdict;
GO

-- -----------------------------------------------------------------------------
-- Query C) Latest 10 bills
-- -----------------------------------------------------------------------------
DECLARE @OutletUuid varchar(36) = 'a406fede-7aab-4473-8e9f-ff645267466f';

SELECT TOP 10
  bt.id AS pos_bill_id,
  @OutletUuid + '-' + CAST(bt.id AS varchar(20)) AS source_event_id,
  s.Date AS sale_date,
  s.time AS sale_time,
  s.uploadstatus AS sale_uploadstatus,
  bt.uploadStatus AS bill_uploadstatus,
  (SELECT COUNT(*) FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id) AS mintpos_line_count
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
ORDER BY bt.id DESC;
GO

-- -----------------------------------------------------------------------------
-- Query D) Oldest bills still pending (if drain stalls)
-- -----------------------------------------------------------------------------
DECLARE @OutletUuid varchar(36) = 'a406fede-7aab-4473-8e9f-ff645267466f';

SELECT TOP 20
  bt.id AS pos_bill_id,
  @OutletUuid + '-' + CAST(bt.id AS varchar(20)) AS source_event_id,
  s.uploadstatus,
  bt.uploadStatus,
  s.Date AS sale_date
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
WHERE (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
   OR (bt.uploadStatus IS NULL OR bt.uploadStatus IN ('Pending', 'pending'))
ORDER BY bt.id ASC;
GO

-- -----------------------------------------------------------------------------
-- Query E) Final 1:1 target — bills WITH product lines (must match Supabase + API)
-- -----------------------------------------------------------------------------
SELECT COUNT(DISTINCT bt.id) AS bills_with_lines
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
WHERE EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id);
GO
