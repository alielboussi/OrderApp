-- Till 1 & Till 2: enable existing SCPGT middleware without stocktake periods.
-- No middleware rebuild required — sets the counters SCPGT already reads.
--
-- Till 1  648e949d-8648-4c43-80d4-f08feb7bdd04
-- Till 2  a655b0a1-a37a-43d6-aa55-7f97377b2660
--
-- Change v_sync_from if you only want sales from a specific date onward.

DO $$
DECLARE
  v_sync_from timestamptz := timestamptz '2020-01-01 00:00:00+00';
  v_epoch bigint := floor(extract(epoch FROM v_sync_from));
BEGIN
  INSERT INTO public.counter_values (counter_key, scope_id, last_value)
  VALUES
    ('pos_sync_opening', '648e949d-8648-4c43-80d4-f08feb7bdd04', v_epoch),
    ('pos_sync_opening', 'a655b0a1-a37a-43d6-aa55-7f97377b2660', v_epoch)
  ON CONFLICT (counter_key, scope_id)
  DO UPDATE SET
    last_value = EXCLUDED.last_value,
    updated_at = now();

  DELETE FROM public.counter_values
  WHERE counter_key = 'pos_sync_cutoff'
    AND scope_id IN (
      '648e949d-8648-4c43-80d4-f08feb7bdd04',
      'a655b0a1-a37a-43d6-aa55-7f97377b2660'
    );
END $$;

-- Supabase validation on upload: skip stocktake window for POS-only tills
CREATE OR REPLACE FUNCTION public.outlet_pos_sale_in_sync_window(
  p_outlet_id uuid,
  p_sold_at timestamp with time zone DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_opening timestamptz;
  v_cutoff timestamptz;
  v_sold timestamptz := COALESCE(p_sold_at, now());
  v_uses_app boolean := false;
BEGIN
  IF p_outlet_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(o.uses_orders_app, false)
  INTO v_uses_app
  FROM public.outlets o
  WHERE o.id = p_outlet_id;

  IF NOT v_uses_app THEN
    RETURN true;
  END IF;

  v_opening := public.get_outlet_pos_sync_opening(p_outlet_id);
  IF v_opening IS NULL THEN
    RETURN false;
  END IF;

  IF v_sold < v_opening THEN
    RETURN false;
  END IF;

  v_cutoff := public.get_outlet_pos_sync_cutoff(p_outlet_id);
  IF v_cutoff IS NOT NULL AND v_cutoff < v_opening AND v_sold > v_cutoff THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

-- Verify (expect in_sync_window = true, opening set for both tills)
SELECT
  o.name,
  o.uses_orders_app,
  to_timestamp(cv.last_value) AT TIME ZONE 'UTC' AS pos_sync_opening,
  public.outlet_pos_sale_in_sync_window(o.id, now()) AS in_sync_window
FROM public.outlets o
LEFT JOIN public.counter_values cv
  ON cv.scope_id = o.id AND cv.counter_key = 'pos_sync_opening'
WHERE o.id IN (
  '648e949d-8648-4c43-80d4-f08feb7bdd04',
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'
)
ORDER BY o.name;
