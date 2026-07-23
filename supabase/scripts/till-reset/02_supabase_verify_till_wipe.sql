-- =============================================================================
-- 02 — VERIFY Till 1 + Till 2 Supabase wipe
-- =============================================================================
-- WHERE: Supabase SQL Editor
-- RUN:   Twice, ~1 minute apart
-- PASS:  All counts = 0 for BOTH tills on BOTH runs (counts must NOT increase)
-- FAIL:  counts rise → SCPGT still running on a till PC; stop service and re-run 01
-- NEXT: 03_mintpos_reset_all_pending.sql on EACH till PC (SSMS → MINTPOS)
-- =============================================================================

SELECT
  o.name,
  (SELECT COUNT(*) FROM public.outlet_sales os WHERE os.outlet_id = o.id) AS outlet_sales_remaining,
  (SELECT COUNT(*) FROM public.orders ord
   WHERE ord.outlet_id = o.id
     AND ord.source_event_id LIKE o.id::text || '-%') AS pos_orders_remaining,
  (SELECT COUNT(*) FROM public.pos_sync_failures psf WHERE psf.outlet_id = o.id) AS sync_failures_remaining
FROM public.outlets o
WHERE o.id IN (
  '648e949d-8648-4c43-80d4-f08feb7bdd04',
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'
)
ORDER BY o.name;

SELECT
  o.name AS outlet_name,
  hb.host_name,
  hb.last_seen_at,
  hb.pending_sales_count,
  now() - hb.last_seen_at AS seconds_since_heartbeat
FROM public.outlets o
LEFT JOIN public.outlet_pos_heartbeats hb ON hb.outlet_id = o.id
WHERE o.id IN (
  '648e949d-8648-4c43-80d4-f08feb7bdd04',
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'
)
ORDER BY o.name;
