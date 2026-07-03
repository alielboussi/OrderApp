-- STEP 3a — Supabase shift verify (Supabase SQL Editor — NOT SSMS)
-- Run when STEP 2a shows scpgt_queue_pending = 0.
-- Next file if needed: 3b_supabase_sync_failures.sql

SELECT
  (SELECT COUNT(*)
   FROM public.orders o
   WHERE o.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
     AND o.source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%'
     AND (o.raw_payload->'shift' IS NULL OR o.raw_payload->'shift' = 'null'::jsonb)
  ) AS orders_missing_shift,
  CASE
    WHEN (SELECT COUNT(*)
          FROM public.orders o
          WHERE o.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
            AND o.source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%'
            AND (o.raw_payload->'shift' IS NULL OR o.raw_payload->'shift' = 'null'::jsonb)
         ) = 0
    THEN 'PASS — all bills have shift labels'
    ELSE 'FAIL — some bills still missing shift'
  END AS verdict;

-- Expect: orders_missing_shift = 0 (was 451 before backfill)
