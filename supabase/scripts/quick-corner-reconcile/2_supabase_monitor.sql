-- =============================================================================
-- 2 — Supabase progress monitor (Supabase SQL Editor ONLY — not SSMS)
-- =============================================================================
-- Quick Corner outlet: a406fede-7aab-4473-8e9f-ff645267466f
--
-- Run while SCPGT is draining. Pair with: 1_mintpos_monitor.sql Query B
-- When MintPOS scpgt_queue_pending = 0 → run 3_supabase_final_verify.sql
--
-- TARGET when fully synced:
--   bills_with_api_lines = MintPOS 1_mintpos_monitor.sql Query E (bills_with_lines)
--   orders_missing_api_lines = 0
--   API sales_count = bills_with_api_lines
--
-- Run one query block at a time (highlight → Run).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Query A) Coverage summary
-- -----------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*)
   FROM public.orders o
   WHERE o.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
     AND o.source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%'
  ) AS orders_in_supabase,
  (SELECT COUNT(DISTINCT os.context->>'source_event_id')
   FROM public.outlet_sales os
   WHERE os.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
     AND os.context->>'source_event_id' IS NOT NULL
  ) AS bills_with_api_lines,
  (SELECT COUNT(*)
   FROM public.orders o
   WHERE o.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
     AND o.source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%'
     AND NOT EXISTS (
       SELECT 1 FROM public.outlet_sales os
       WHERE os.context->>'source_event_id' = o.source_event_id
     )
  ) AS orders_missing_api_lines;


-- -----------------------------------------------------------------------------
-- Query B) Drain monitor — run every ~15 min while SCPGT is running
-- -----------------------------------------------------------------------------
WITH metrics AS (
  SELECT
    (SELECT COUNT(DISTINCT os.context->>'source_event_id')
     FROM public.outlet_sales os
     WHERE os.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
       AND os.context->>'source_event_id' IS NOT NULL
    ) AS bills_with_api_lines,
    (SELECT COUNT(*)
     FROM public.orders o
     WHERE o.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
       AND o.source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%'
       AND NOT EXISTS (
         SELECT 1 FROM public.outlet_sales os
         WHERE os.context->>'source_event_id' = o.source_event_id
       )
    ) AS orders_missing_api_lines,
    (SELECT COUNT(*)
     FROM public.orders o
     WHERE o.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
       AND o.source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%'
    ) AS orders_in_supabase
)
SELECT
  bills_with_api_lines,
  orders_missing_api_lines,
  orders_in_supabase,
  CASE
    WHEN orders_missing_api_lines = 0
     AND bills_with_api_lines >= 8000
    THEN 'PASS — run 3_supabase_final_verify.sql when MintPOS queue = 0'
    WHEN orders_missing_api_lines > 0
    THEN 'FAIL — orders without outlet_sales lines'
    WHEN bills_with_api_lines < 8000
    THEN 'IN PROGRESS — SCPGT still draining'
    ELSE 'REVIEW — counts diverge'
  END AS verdict
FROM metrics;
