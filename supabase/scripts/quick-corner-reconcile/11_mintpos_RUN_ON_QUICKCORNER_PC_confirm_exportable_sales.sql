-- =============================================================================
-- STEP 11 — FINAL VERIFICATION (⚠️ SSMS on Quick Corner PC → database MINTPOS)
-- =============================================================================
-- READ-ONLY — no UPDATE / DELETE in this file.
--
-- After middleware deploy + 12c re-queue, SCPGT drains the backlog automatically.
-- Do NOT run 08, 10_mintpos, or 12c again unless a NEW gap appears.
--
-- "Exportable bill" = Sale row WITH a BillType (payment bill).
-- Orphan Sale rows (no BillType) are NOT real POS punches — ignore ~151k orphans.
--
-- PAIR WITH: 11_supabase_RUN_IN_SQL_EDITOR_confirm_api_coverage.sql
-- API: https://aftertentransfers.app/api/outlet-middleware-sales/quick-corner
-- =============================================================================

USE [MINTPOS];
GO

DECLARE @OutletUuid varchar(36) = 'a406fede-7aab-4473-8e9f-ff645267466f';

-- -----------------------------------------------------------------------------
-- Query A) Ground truth — compare to Supabase 11 Query A / B
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
-- Query B) PASS / FAIL verdict (single row)
-- -----------------------------------------------------------------------------
DECLARE @OutletUuid varchar(36) = 'a406fede-7aab-4473-8e9f-ff645267466f';

SELECT
  (SELECT COUNT(*)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
  ) AS exportable_bills_total,
  (SELECT COUNT(*)
   FROM dbo.BillType bt WITH (NOLOCK)
   JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
   WHERE (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
     AND (bt.uploadStatus IS NULL OR bt.uploadStatus IN ('Pending', 'pending'))
  ) AS exportable_pending,
  CASE
    WHEN (SELECT COUNT(*)
          FROM dbo.BillType bt WITH (NOLOCK)
          JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
          WHERE (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
            AND (bt.uploadStatus IS NULL OR bt.uploadStatus IN ('Pending', 'pending'))
         ) = 0
     AND (SELECT COUNT(*)
          FROM dbo.BillType bt WITH (NOLOCK)
          JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
         ) >= 7000
    THEN 'PASS — queue drained; compare exportable_bills_total to Supabase bills_with_api_lines'
    WHEN (SELECT COUNT(*)
          FROM dbo.BillType bt WITH (NOLOCK)
          JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
          WHERE (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
            AND (bt.uploadStatus IS NULL OR bt.uploadStatus IN ('Pending', 'pending'))
         ) > 0
    THEN 'IN PROGRESS — SCPGT draining; watch C:\ProgramData\SCPGT\log.txt'
    ELSE 'REVIEW — unexpected counts; check SCPGT service is running'
  END AS verdict;
GO

-- -----------------------------------------------------------------------------
-- Query C) Latest 10 exportable punches (line counts vs Supabase Query D)
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
-- Query D) Oldest bills still pending (should be 0 rows when drain complete)
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
