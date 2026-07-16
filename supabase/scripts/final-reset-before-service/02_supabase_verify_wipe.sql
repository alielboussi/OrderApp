-- =============================================================================
-- 02 — VERIFY Quick Corner Supabase wipe
-- =============================================================================
-- WHERE: Supabase SQL Editor
-- OUTLET: Quick Corner — a406fede-7aab-4473-8e9f-ff645267466f
--
-- RUN:   Twice, ~1 minute apart
-- PASS:  outlet_sales_remaining = 0
--         pos_orders_remaining = 0
--         sync_failures_remaining = 0
--         on BOTH runs (counts must NOT increase between runs)
-- FAIL:  counts rise → sync still running on Quick Corner PC; stop SCPGT and re-run 01
--
-- NEXT: 03_mintpos_reset_all_pending.sql (SSMS on Quick Corner PC)
-- =============================================================================

SELECT
  (SELECT COUNT(*) FROM public.outlet_sales
   WHERE outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f') AS outlet_sales_remaining,
  (SELECT COUNT(*) FROM public.orders
   WHERE outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
     AND source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%') AS pos_orders_remaining,
  (SELECT COUNT(*) FROM public.pos_sync_failures
   WHERE outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f') AS sync_failures_remaining;

SELECT
  hb.host_name,
  hb.last_seen_at,
  hb.pending_sales_count,
  now() - hb.last_seen_at AS seconds_since_heartbeat
FROM public.outlet_pos_heartbeats hb
WHERE hb.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f';
