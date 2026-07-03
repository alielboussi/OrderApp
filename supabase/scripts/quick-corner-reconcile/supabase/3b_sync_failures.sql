-- Supabase monitor 3b — recent sync failures (Supabase SQL Editor)

SELECT
  left(source_event_id, 80) AS source_event_id,
  stage,
  left(error_message, 200) AS error_message,
  created_at
FROM public.pos_sync_failures
WHERE outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
ORDER BY created_at DESC
LIMIT 25;
