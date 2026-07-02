-- =============================================================================
-- 3 — Final 1:1 verify (Supabase SQL Editor ONLY — not SSMS)
-- =============================================================================
-- Quick Corner outlet: a406fede-7aab-4473-8e9f-ff645267466f
--
-- Run ONLY when 1_mintpos_monitor.sql Query B shows scpgt_queue_pending = 0
--
-- Also run on MintPOS: 1_mintpos_monitor.sql Query E (bills_with_lines)
-- Browser: https://aftertentransfers.app/api/outlet-middleware-sales/quick-corner
--   → sales_count must equal bills_with_api_lines below
-- =============================================================================

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
       AND (o.raw_payload->'shift' IS NULL OR o.raw_payload->'shift' = 'null'::jsonb)
    ) AS orders_missing_shift,
    (SELECT SUM(os.qty_units)
     FROM public.outlet_sales os
     WHERE os.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
    ) AS supabase_total_units
)
SELECT
  *,
  CASE
    WHEN orders_missing_api_lines = 0
     AND bills_with_api_lines >= 8000
    THEN 'PASS — must match MintPOS Query E bills_with_lines and API sales_count'
    WHEN orders_missing_api_lines > 0
    THEN 'FAIL — orders without outlet_sales lines'
    WHEN bills_with_api_lines < 8000
    THEN 'IN PROGRESS — SCPGT still uploading'
    ELSE 'REVIEW'
  END AS verdict
FROM metrics;

-- Recent sync failures (should be empty or only no_mappable_items)
SELECT
  left(source_event_id, 80) AS source_event_id,
  stage,
  left(error_message, 200) AS error_message,
  created_at
FROM public.pos_sync_failures
WHERE outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
ORDER BY created_at DESC
LIMIT 25;
