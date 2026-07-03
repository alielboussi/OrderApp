-- MintPOS monitor 1a — ground truth summary (SSMS → MINTPOS)

USE [MINTPOS];
GO

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
  ) AS exportable_pending;
