-- =============================================================================
-- 01b — WIPE Till 2 middleware sales in Supabase ONLY
-- =============================================================================
-- WHERE: Supabase SQL Editor (run entire file once)
-- OUTLET: Till 2 → a655b0a1-a37a-43d6-aa55-7f97377b2660
--
-- BEFORE: Stop SCPGT on Till 2 PC only (Till 1 can keep running)
-- NEXT:  02b_supabase_verify_till2_wipe.sql
-- =============================================================================

DO $$
DECLARE
  v_outlet uuid := 'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid;
  v_prefix text := 'a655b0a1-a37a-43d6-aa55-7f97377b2660-%';
BEGIN
  DELETE FROM public.outlet_sales
  WHERE outlet_id = v_outlet;

  DELETE FROM public.pos_inventory_consumed
  WHERE outlet_id = v_outlet;

  DELETE FROM public.order_items
  WHERE order_id IN (
    SELECT id FROM public.orders
    WHERE outlet_id = v_outlet
      AND source_event_id LIKE v_prefix
  );

  DELETE FROM public.orders
  WHERE outlet_id = v_outlet
    AND source_event_id LIKE v_prefix;

  DELETE FROM public.pos_sync_failures
  WHERE outlet_id = v_outlet;
END $$;

SELECT
  o.name,
  (SELECT COUNT(*) FROM public.outlet_sales os WHERE os.outlet_id = o.id) AS outlet_sales_remaining,
  (SELECT COUNT(*) FROM public.orders ord
   WHERE ord.outlet_id = o.id
     AND ord.source_event_id LIKE o.id::text || '-%') AS pos_orders_remaining,
  (SELECT COUNT(*) FROM public.pos_sync_failures psf WHERE psf.outlet_id = o.id) AS sync_failures_remaining
FROM public.outlets o
WHERE o.id = 'a655b0a1-a37a-43d6-aa55-7f97377b2660';
