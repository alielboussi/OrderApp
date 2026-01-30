-- Make validate_pos_order resilient to bad payloads (avoid 500s)

CREATE OR REPLACE FUNCTION public.validate_pos_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_outlet uuid;
  v_outlet_text text := nullif(payload->>'outlet_id','');
  v_source text := nullif(payload->>'source_event_id','');
  v_item jsonb;
  v_map record;
  v_qty numeric;
  v_qty_text text;
  v_errors jsonb := '[]'::jsonb;
  v_variant_key text;
  v_route record;
  v_deduct_outlet uuid;
  v_default_wh uuid;
  v_deduct_wh uuid;
  v_requires_open boolean;
  v_has_open boolean;
  v_fatal boolean := false;
  v_has_mapped boolean := false;
BEGIN
  IF v_outlet_text IS NULL THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','missing_outlet','message','outlet_id is required'));
    v_fatal := true;
  ELSIF v_outlet_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','invalid_outlet','message','outlet_id is invalid','outlet_id', v_outlet_text));
    v_fatal := true;
  ELSE
    v_outlet := v_outlet_text::uuid;
  END IF;

  IF v_source IS NULL THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','missing_source','message','source_event_id is required'));
    v_fatal := true;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) LOOP
    v_qty_text := nullif(v_item->>'quantity','');
    IF v_qty_text IS NULL OR v_qty_text !~* '^[0-9]+(\.[0-9]+)?$' THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code','bad_quantity',
        'message','quantity must be numeric > 0',
        'pos_item_id', v_item->>'pos_item_id',
        'flavour_id', v_item->>'flavour_id'
      ));
      v_fatal := true;
      CONTINUE;
    END IF;

    v_qty := v_qty_text::numeric;
    IF v_qty <= 0 THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code','bad_quantity',
        'message','quantity must be > 0',
        'pos_item_id', v_item->>'pos_item_id',
        'flavour_id', v_item->>'flavour_id'
      ));
      v_fatal := true;
      CONTINUE;
    END IF;

    IF v_outlet IS NULL THEN
      CONTINUE;
    END IF;

    SELECT catalog_item_id, catalog_variant_key, warehouse_id
      INTO v_map
    FROM public.pos_item_map
    WHERE outlet_id = v_outlet
      AND pos_item_id = v_item->>'pos_item_id'
      AND (pos_flavour_id IS NULL OR pos_flavour_id = nullif(v_item->>'flavour_id',''))
    ORDER BY CASE WHEN pos_flavour_id IS NULL THEN 1 ELSE 0 END
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE; -- no validation errors for unmapped items
    END IF;

    v_has_mapped := true;

    v_variant_key := public.normalize_variant_key(v_map.catalog_variant_key);

    SELECT warehouse_id, target_outlet_id, coalesce(deduct_enabled, true) AS deduct_enabled
      INTO v_route
    FROM public.outlet_item_routes
    WHERE outlet_id = v_outlet
      AND item_id = v_map.catalog_item_id
      AND normalized_variant_key IN (v_variant_key, 'base')
    ORDER BY (normalized_variant_key = v_variant_key) DESC
    LIMIT 1;

    v_deduct_outlet := coalesce(v_route.target_outlet_id, v_outlet);

    SELECT w.id
      INTO v_default_wh
    FROM public.outlets o
    JOIN public.warehouses w ON w.outlet_id = o.id
    WHERE o.id = v_deduct_outlet
      AND coalesce(w.active, true)
    ORDER BY coalesce(w.name, ''), w.id
    LIMIT 1;

    v_deduct_wh := coalesce(v_map.warehouse_id, v_route.warehouse_id, v_default_wh);

    IF v_deduct_wh IS NULL THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code','missing_warehouse',
        'message','no warehouse mapping for item/variant',
        'pos_item_id', v_item->>'pos_item_id',
        'catalog_item_id', v_map.catalog_item_id::text,
        'variant_key', v_variant_key
      ));
      v_fatal := true;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.outlet_warehouses ow WHERE ow.warehouse_id = v_deduct_wh
    ) INTO v_requires_open;

    IF v_requires_open THEN
      SELECT EXISTS (
        SELECT 1 FROM public.warehouse_stock_periods wsp
        WHERE wsp.warehouse_id = v_deduct_wh
          AND wsp.status = 'open'
      ) INTO v_has_open;

      IF NOT v_has_open THEN
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code','missing_open_stock_period',
          'message','open stock period required for warehouse',
          'warehouse_id', v_deduct_wh::text,
          'pos_item_id', v_item->>'pos_item_id'
        ));
        v_fatal := true;
      END IF;
    END IF;
  END LOOP;

  IF NOT v_has_mapped THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code','no_mappable_items',
      'message','no items had a valid pos_item_map'
    ));
    v_fatal := true;
  END IF;

  RETURN jsonb_build_object(
    'ok', NOT v_fatal,
    'errors', v_errors
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok', false,
    'errors', coalesce(v_errors, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'code','validation_exception',
      'message', sqlerrm
    ))
  );
END;
$$;
