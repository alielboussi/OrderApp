-- STEP 1a — MintPOS pre-check (SSMS → database MINTPOS)
-- Goal: confirm we found all 451 Jul 2 bills before re-queueing.
-- Next file: 1b_mintpos_requeue.sql

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

SELECT
    (SELECT COUNT(*) FROM @TargetBills) AS target_bills,
    COUNT(DISTINCT bt.id) AS bills_found_in_mintpos,
    COUNT(DISTINCT CASE WHEN s.uploadstatus = 'Processed' THEN bt.id END) AS bills_currently_processed,
    COUNT(DISTINCT CASE
        WHEN s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending') THEN bt.id
    END) AS bills_already_pending
FROM @TargetBills t
JOIN dbo.BillType bt WITH (NOLOCK) ON bt.id = t.BillId
JOIN dbo.Sale s WITH (NOLOCK) ON s.Id = bt.saleid
WHERE s.Date = '2026-07-02';

-- Expect: target_bills = 451 AND bills_found_in_mintpos = 451
