-- =============================================================================
-- 01 — WIPE Quick Corner middleware sales in Supabase
-- =============================================================================
-- WHERE: Supabase SQL Editor (run entire file once)
-- OUTLET: Quick Corner — a406fede-7aab-4473-8e9f-ff645267466f
--
-- BEFORE: SCPGT stopped on Quick Corner PC. Hotfix applied:
--         supabase/migrations/20260705_pos_sync_on_conflict_hotfix.sql
--
-- NEXT: 02_supabase_verify_wipe.sql
-- =============================================================================

DO $$
DECLARE
  v_outlet uuid := 'a406fede-7aab-4473-8e9f-ff645267466f';
  v_prefix text;
BEGIN
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
END $$;

SELECT
  (SELECT COUNT(*) FROM public.outlet_sales
   WHERE outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f') AS outlet_sales_remaining,
  (SELECT COUNT(*) FROM public.orders
   WHERE outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
     AND source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%') AS pos_orders_remaining,
  (SELECT COUNT(*) FROM public.pos_sync_failures
   WHERE outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f') AS sync_failures_remaining;
