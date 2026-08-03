-- Quick Corner MintPOS sync status (read-only)
-- Run in SSMS on the Quick Corner PC against database MINTPOS.
--
-- Compare with:
--   node firestore-count.cjs a406fede-7aab-4473-8e9f-ff645267466f

USE [MINTPOS];
GO

SET NOCOUNT ON;

DECLARE @exportable INT;
DECLARE @processed INT;
DECLARE @pending INT;

SELECT
  @exportable = COUNT(DISTINCT bt.id),
  @processed = COUNT(DISTINCT CASE WHEN s.uploadstatus = 'Processed' THEN bt.id END),
  @pending = COUNT(DISTINCT CASE
    WHEN s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending') THEN bt.id
  END)
FROM dbo.BillType bt WITH (NOLOCK)
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
WHERE EXISTS (
  SELECT 1
  FROM dbo.Saledetails sd WITH (NOLOCK)
  WHERE sd.saleid = s.Id
);

SELECT
  @exportable AS exportable_bills_with_lines,
  @processed AS processed_bills,
  @pending AS pending_bills,
  @exportable - @processed - @pending AS other_status_bills,
  CASE
    WHEN @pending = 0 AND @processed = @exportable THEN 'SYNC COMPLETE (MintPOS side)'
    WHEN @pending > 0 THEN 'IN PROGRESS — ' + CAST(@pending AS VARCHAR(20)) + ' bills still pending upload'
    ELSE 'CHECK NEEDED — processed + pending does not match exportable total'
  END AS mintpos_status,
  CAST(ROUND(100.0 * @processed / NULLIF(@exportable, 0), 1) AS DECIMAL(6, 1)) AS pct_marked_processed;

IF @pending > 0
BEGIN
  SELECT TOP 20
    CAST(bt.id AS NVARCHAR(64)) AS bill_id,
    s.Id AS sale_id,
    s.Date AS sale_date,
    s.time AS sale_time,
    s.uploadstatus,
    CONCAT('a406fede-7aab-4473-8e9f-ff645267466f-', bt.id) AS expected_firestore_doc_id
  FROM dbo.Sale s WITH (NOLOCK)
  JOIN dbo.BillType bt WITH (NOLOCK) ON bt.saleid = s.Id
  WHERE (s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending'))
    AND EXISTS (SELECT 1 FROM dbo.Saledetails sd WITH (NOLOCK) WHERE sd.saleid = s.Id)
  ORDER BY bt.id;
END
ELSE
BEGIN
  SELECT 'No pending bills — MintPOS queue is empty.' AS message;
END

GO
