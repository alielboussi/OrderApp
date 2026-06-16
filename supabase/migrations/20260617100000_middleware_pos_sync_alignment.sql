-- Align POS middleware RPCs with Android orders flow + outlet stocktake sync windows.
-- Apply after 20260617000000_android_orders_flow.sql

-- ---------------------------------------------------------------------------
-- 1. POS sync window helper (counter_values per outlet)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_outlet_pos_sync_opening(p_outlet_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT to_timestamp(cv.last_value)
  FROM public.counter_values cv
  WHERE cv.counter_key = 'pos_sync_opening'
    AND cv.scope_id = p_outlet_id
  ORDER BY cv.updated_at DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_outlet_pos_sync_cutoff(p_outlet_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT to_timestamp(cv.last_value)
  FROM public.counter_values cv
  WHERE cv.counter_key = 'pos_sync_cutoff'
    AND cv.scope_id = p_outlet_id
  ORDER BY cv.updated_at DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.outlet_pos_sale_in_sync_window(
  p_outlet_id uuid,
  p_sold_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_opening timestamptz;
  v_cutoff timestamptz;
  v_sold timestamptz := COALESCE(p_sold_at, now());
BEGIN
  IF p_outlet_id IS NULL THEN
    RETURN false;
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
$$;

-- ---------------------------------------------------------------------------
-- 2. Deductions only for Afterten Orders app outlets
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_pos_sale_deduction_rules(
  p_outlet_id uuid,
  p_sold_item_id uuid,
  p_sold_variant_key text,
  p_sale_qty numeric,
  p_sold_at timestamptz DEFAULT now(),
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_rule record;
  v_deduct_qty numeric;
  v_variant_sold text := public.normalize_variant_key(COALESCE(p_sold_variant_key, 'base'));
  v_uses_app boolean := false;
BEGIN
  IF p_outlet_id IS NULL OR p_sold_item_id IS NULL OR p_sale_qty IS NULL OR p_sale_qty <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(o.uses_orders_app, false)
  INTO v_uses_app
  FROM public.outlets o
  WHERE o.id = p_outlet_id;

  IF NOT v_uses_app THEN
    RETURN;
  END IF;

  IF NOT public.outlet_pos_sale_in_sync_window(p_outlet_id, p_sold_at) THEN
    RETURN;
  END IF;

  FOR v_rule IN
    SELECT *
    FROM public.outlet_pos_deduction_rules r
    WHERE r.outlet_id = p_outlet_id
      AND r.sold_item_id = p_sold_item_id
      AND public.normalize_variant_key(r.sold_variant_key) = v_variant_sold
      AND r.active
      AND EXISTS (
        SELECT 1 FROM public.outlet_warehouses ow
        WHERE ow.outlet_id = p_outlet_id AND ow.warehouse_id = r.warehouse_id
      )
  LOOP
    v_deduct_qty := v_rule.deduct_qty_per_sale * p_sale_qty;

    INSERT INTO public.stock_ledger(
      warehouse_id, item_id, variant_key, delta_units, reason,
      location_type, occurred_at, context
    )
    VALUES (
      v_rule.warehouse_id,
      v_rule.deduct_item_id,
      public.normalize_variant_key(v_rule.deduct_variant_key),
      -v_deduct_qty,
      'outlet_sale',
      'warehouse',
      COALESCE(p_sold_at, now()),
      p_context || jsonb_build_object(
        'deduction_rule_id', v_rule.id,
        'sold_item_id', p_sold_item_id,
        'sold_variant_key', v_variant_sold
      )
    );

    UPDATE public.outlet_stock_balances osb
    SET
      consumed_units = osb.consumed_units + v_deduct_qty,
      on_hand_units = GREATEST(osb.sent_units - (osb.consumed_units + v_deduct_qty), 0),
      updated_at = now()
    WHERE osb.outlet_id = p_outlet_id
      AND osb.item_id = v_rule.deduct_item_id
      AND osb.variant_key = public.normalize_variant_key(v_rule.deduct_variant_key);

    IF NOT FOUND THEN
      INSERT INTO public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units, on_hand_units)
      VALUES (
        p_outlet_id,
        v_rule.deduct_item_id,
        public.normalize_variant_key(v_rule.deduct_variant_key),
        0,
        v_deduct_qty,
        0
      )
      ON CONFLICT (outlet_id, item_id, variant_key) DO UPDATE SET
        consumed_units = public.outlet_stock_balances.consumed_units + EXCLUDED.consumed_units,
        on_hand_units = GREATEST(public.outlet_stock_balances.sent_units - (public.outlet_stock_balances.consumed_units + EXCLUDED.consumed_units), 0),
        updated_at = now();
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. validate_pos_order — middleware + sync window guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_pos_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_outlet uuid := nullif(payload->>'outlet_id', '')::uuid;
  v_source text := nullif(payload->>'source_event_id', '');
  v_item jsonb;
  v_resolved record;
  v_qty numeric;
  v_qty_text text;
  v_errors jsonb := '[]'::jsonb;
  v_has_mapped boolean := false;
  v_item_sku text;
  v_variant_sku text;
  v_sold_at timestamptz;
  v_has_middleware boolean := false;
BEGIN
  IF v_outlet IS NULL THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','missing_outlet','message','outlet_id is required'));
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  IF v_source IS NULL THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','missing_source','message','source_event_id is required'));
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  SELECT COALESCE(o.has_pos_middleware, false)
  INTO v_has_middleware
  FROM public.outlets o
  WHERE o.id = v_outlet;

  IF NOT v_has_middleware THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'middleware_disabled',
      'message', 'POS middleware is not enabled for this outlet'
    ));
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders WHERE source_event_id = v_source) THEN
    RETURN jsonb_build_object('ok', true, 'errors', '[]'::jsonb, 'duplicate', true);
  END IF;

  v_sold_at := COALESCE(nullif(payload->>'occurred_at', '')::timestamptz, now());
  IF NOT public.outlet_pos_sale_in_sync_window(v_outlet, v_sold_at) THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'outside_sync_window',
      'message', 'Sale is outside the current POS sync window — open a stocktake period in the Afterten Orders app'
    ));
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'items', '[]'::jsonb))
  LOOP
    v_item_sku := nullif(trim(COALESCE(v_item->>'item_sku', v_item->>'catalog_item_sku', '')), '');
    v_variant_sku := nullif(trim(COALESCE(v_item->>'variant_sku', v_item->>'flavour_sku', '')), '');

    IF v_item_sku IS NULL THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'missing_item_sku',
        'message', format('Line "%s" has no item SKU — set MenuItem.Code to catalog SKU on POS', COALESCE(v_item->>'name', v_item->>'pos_item_id'))
      ));
      CONTINUE;
    END IF;

    SELECT * INTO v_resolved FROM public.resolve_catalog_by_sku(v_item_sku, v_variant_sku) LIMIT 1;
    IF NOT FOUND THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'unknown_sku',
        'message', format('No catalog match for SKU %s%s', v_item_sku, CASE WHEN v_variant_sku IS NOT NULL THEN ' / ' || v_variant_sku ELSE '' END)
      ));
      CONTINUE;
    END IF;

    v_qty_text := nullif(v_item->>'quantity', '');
    v_qty := COALESCE(v_qty_text::numeric, 0);
    IF v_qty <= 0 THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','invalid_qty','message','quantity must be > 0'));
      CONTINUE;
    END IF;

    v_has_mapped := true;
  END LOOP;

  IF NOT v_has_mapped AND jsonb_array_length(COALESCE(payload->'items', '[]'::jsonb)) > 0 THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','no_mappable_items','message','No line items matched catalog SKUs'));
  END IF;

  RETURN jsonb_build_object('ok', jsonb_array_length(v_errors) = 0 OR v_has_mapped, 'errors', v_errors);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Fulfillment trigger must never run for POS-sync orders
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_order_locked_and_allocated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.source_event_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('accepted', 'ordered', 'offloaded', 'delivered', 'completed')
     AND NOT COALESCE(NEW.locked, false) THEN
    PERFORM public.record_order_fulfillment(NEW.id);
    UPDATE public.orders
    SET locked = true,
        updated_at = now()
    WHERE id = NEW.id
      AND locked = false;
  END IF;
  RETURN NEW;
END;
$$;
