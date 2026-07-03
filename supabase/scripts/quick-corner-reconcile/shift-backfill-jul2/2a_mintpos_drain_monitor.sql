-- STEP 2a — MintPOS drain monitor (SSMS → database MINTPOS)
-- Repeat every ~15 min until scpgt_queue_pending = 0.
-- Next file when 0: 3a_supabase_shift_verify.sql

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
    THEN 'DONE — open 3a_supabase_shift_verify.sql'
    ELSE 'WAIT — SCPGT still working; check again in 15 min'
  END AS verdict;
