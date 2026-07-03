-- MintPOS monitor 1b — drain monitor (SSMS → MINTPOS)

USE [MINTPOS];
GO

SELECT
  (SELECT COUNT(*)
   FROM dbo.Sale s WITH (NOLOCK)
   WHERE s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending')
  ) AS scpgt_queue_pending,
  CASE
    WHEN (SELECT COUNT(*)
          FROM dbo.Sale s WITH (NOLOCK)
          WHERE s.uploadstatus IS NULL OR s.uploadstatus IN ('Pending', 'pending')
         ) = 0
    THEN 'PASS — queue drained'
    ELSE 'IN PROGRESS — SCPGT still draining'
  END AS verdict;
