BEGIN;

CREATE OR REPLACE FUNCTION public.record_production_entry(
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_key text DEFAULT 'base',
  p_warehouse_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.production_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_variant text := public.normalize_variant_key(p_variant_key);
  v_period_id uuid;
  v_row public.production_entries%rowtype;
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT (public.is_stocktake_user(v_uid)
          OR public.is_admin(v_uid)
          OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = v_uid
              AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid
          ))
  INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_item_id IS NULL OR p_qty_units IS NULL OR p_qty_units <= 0 THEN
    RAISE EXCEPTION 'item + qty required for production entry';
  END IF;

  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'warehouse required for production entry';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.production_item_assignments pia
    WHERE pia.finished_item_id = p_item_id
      AND pia.warehouse_id = p_warehouse_id
      AND public.normalize_variant_key(pia.variant_key) = v_variant
      AND pia.active
  ) THEN
    RAISE EXCEPTION 'production assignment missing for item %', p_item_id;
  END IF;

  SELECT wsp.id
  INTO v_period_id
  FROM public.warehouse_stock_periods wsp
  WHERE wsp.warehouse_id = p_warehouse_id
    AND wsp.status = 'open'
  ORDER BY wsp.opened_at DESC NULLS LAST
  LIMIT 1;

  INSERT INTO public.production_entries(
    warehouse_id,
    item_id,
    variant_key,
    qty_units,
    period_id,
    note,
    created_by
  ) VALUES (
    p_warehouse_id,
    p_item_id,
    v_variant,
    p_qty_units,
    v_period_id,
    p_note,
    v_uid
  ) RETURNING * INTO v_row;

  INSERT INTO public.stock_ledger(
    location_type,
    warehouse_id,
    item_id,
    variant_key,
    delta_units,
    reason,
    context
  ) VALUES (
    'warehouse',
    p_warehouse_id,
    p_item_id,
    v_variant,
    p_qty_units,
    'production_entry',
    jsonb_build_object(
      'production_entry_id', v_row.id::text,
      'note', p_note,
      'period_id', v_period_id::text,
      'source', 'production_entry'
    )
  );

  PERFORM public.apply_recipe_deductions(
    p_item_id,
    p_qty_units,
    p_warehouse_id,
    v_variant,
    jsonb_build_object(
      'source', 'production_entry',
      'production_entry_id', v_row.id::text,
      'period_id', v_period_id::text
    ),
    0,
    array[]::uuid[]
  );

  RETURN v_row;
END;
$function$;

COMMIT;
