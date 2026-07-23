-- =============================================================================
-- 01 — WIPE Till 1 + Till 2 middleware sales in Supabase
-- =============================================================================
-- WHERE: Supabase SQL Editor (run entire file once)
-- OUTLETS:
--   Till 1: 648e949d-8648-4c43-80d4-f08feb7bdd04
--   Till 2: a655b0a1-a37a-43d6-aa55-7f97377b2660
--
-- BEFORE: Stop SCPGT on BOTH till PCs (Till 1 and Till 2)
-- NEXT:  02_supabase_verify_till_wipe.sql
-- =============================================================================

DO $$
DECLARE
  v_outlet uuid;
  v_prefix text;
BEGIN
  FOREACH v_outlet IN ARRAY ARRAY[
    '648e949d-8648-4c43-80d4-f08feb7bdd04'::uuid,
    'a655b0a1-a37a-43d6-aa55-7f97377b2660'::uuid
  ]
  LOOP
    v_prefix := v_outlet::text || '-%';

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
  END LOOP;
END $$;

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
