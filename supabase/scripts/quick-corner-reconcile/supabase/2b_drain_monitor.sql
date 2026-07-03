-- Supabase monitor 2b — drain monitor (Supabase SQL Editor)

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
    ) AS orders_missing_api_lines
)
SELECT
  bills_with_api_lines,
  orders_missing_api_lines,
  CASE
    WHEN orders_missing_api_lines = 0
    THEN 'PASS'
    ELSE 'IN PROGRESS or FAIL'
  END AS verdict
FROM metrics;
