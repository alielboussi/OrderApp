-- STEP 1b — MintPOS re-queue 451 bills (SSMS → database MINTPOS)
-- Run ONLY after STEP 1a shows bills_found_in_mintpos = 451.
-- Next file: 2a_mintpos_drain_monitor.sql (repeat every ~15 min)

USE [MINTPOS];
GO

SET NOCOUNT ON;

DECLARE @TargetBills TABLE (BillId bigint NOT NULL PRIMARY KEY);

INSERT INTO @TargetBills (BillId)
SELECT n.BillId
FROM (
    SELECT TOP (395) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 + 1393901 AS BillId
    FROM sys.all_objects a
    CROSS JOIN sys.all_objects b
    UNION ALL
    SELECT TOP (44) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 + 1394296 AS BillId
    FROM sys.all_objects a
    CROSS JOIN sys.all_objects b
    UNION ALL
    SELECT TOP (24) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 + 1394340 AS BillId
    FROM sys.all_objects a
    CROSS JOIN sys.all_objects b
) n
WHERE n.BillId NOT IN (
    1394268, 1394279, 1394288,
    1394301, 1394303, 1394317, 1394325, 1394326, 1394335,
    1394347, 1394359, 1394361
);

BEGIN TRANSACTION;

UPDATE s
SET s.uploadstatus = 'Pending'
FROM dbo.Sale s
INNER JOIN dbo.BillType bt ON bt.saleid = s.Id
INNER JOIN @TargetBills t ON t.BillId = bt.id
WHERE s.Date = '2026-07-02'
  AND s.uploadstatus = 'Processed';

DECLARE @sales_requeued int = @@ROWCOUNT;

UPDATE bt
SET bt.uploadStatus = 'Pending'
FROM dbo.BillType bt
INNER JOIN @TargetBills t ON t.BillId = bt.id
INNER JOIN dbo.Sale s ON s.Id = bt.saleid
WHERE s.Date = '2026-07-02'
  AND bt.uploadStatus = 'Processed';

DECLARE @bills_requeued int = @@ROWCOUNT;

UPDATE sd
SET sd.uploadstatus = 'Pending'
FROM dbo.Saledetails sd
INNER JOIN dbo.Sale s ON s.Id = sd.saleid
INNER JOIN dbo.BillType bt ON bt.saleid = s.Id
INNER JOIN @TargetBills t ON t.BillId = bt.id
WHERE s.Date = '2026-07-02'
  AND sd.uploadstatus = 'Processed';

DECLARE @lines_requeued int = @@ROWCOUNT;

SELECT
    @sales_requeued AS sales_requeued,
    @bills_requeued AS bills_requeued,
    @lines_requeued AS lines_requeued,
    (SELECT COUNT(*)
     FROM dbo.Sale s WITH (NOLOCK)
     WHERE s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending')
    ) AS scpgt_queue_pending_total;

COMMIT TRANSACTION;

-- Expect: sales_requeued ≈ 451 and scpgt_queue_pending_total went up by ~451
