BEGIN;

CREATE OR REPLACE FUNCTION public.apply_recipe_deductions(
  p_item_id uuid,
  p_qty_units numeric,
  p_warehouse_id uuid,
  p_variant_key text DEFAULT 'base'::text,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_depth integer DEFAULT 0,
  p_seen uuid[] DEFAULT '{}'::uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  comp record;
  v_yield numeric := 1;
  v_has_recipe boolean := false;
  v_use_kind_filter boolean := true;
  v_effective_qty numeric;
  v_variant_key text := public.normalize_variant_key(p_variant_key);
  v_item_kind item_kind;
  v_comp_qty numeric;
  v_candidate_ids uuid[];
  v_candidate uuid;
  v_remaining numeric;
  v_deduct_qty numeric;
  v_available numeric;
  v_fallback uuid;
BEGIN
  IF p_item_id IS NULL OR p_qty_units IS NULL OR p_qty_units <= 0 THEN
    RAISE EXCEPTION 'item + qty required for recipe deductions';
  END IF;

  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'warehouse required for recipe deductions';
  END IF;

  IF p_depth > 8 OR p_item_id = ANY(p_seen) THEN
    RAISE EXCEPTION 'recipe recursion detected for item %', p_item_id;
  END IF;

  SELECT ci.item_kind
  INTO v_item_kind
  FROM public.catalog_items ci
  WHERE ci.id = p_item_id;

  IF v_item_kind IS NULL THEN
    RAISE EXCEPTION 'catalog item % not found for recipe deductions', p_item_id;
  END IF;

  SELECT true, COALESCE(MIN(r.yield_qty_units), 1)
  INTO v_has_recipe, v_yield
  FROM public.recipes r
  WHERE r.active
    AND r.finished_item_id = p_item_id
    AND r.recipe_for_kind = v_item_kind
    AND public.normalize_variant_key(COALESCE(r.finished_variant_key, 'base')) = v_variant_key;

  IF NOT v_has_recipe THEN
    SELECT true, COALESCE(MIN(r.yield_qty_units), 1)
    INTO v_has_recipe, v_yield
    FROM public.recipes r
    WHERE r.active
      AND r.finished_item_id = p_item_id
      AND public.normalize_variant_key(COALESCE(r.finished_variant_key, 'base')) = v_variant_key;

    IF v_has_recipe THEN
      v_use_kind_filter := false;
    END IF;
  END IF;

  IF NOT v_has_recipe THEN
    IF v_item_kind IN ('ingredient', 'raw') THEN
      SELECT array_agg(DISTINCT iwhp.warehouse_id)
      INTO v_candidate_ids
      FROM public.item_warehouse_handling_policies iwhp
      WHERE iwhp.item_id = p_item_id
        AND COALESCE(iwhp.recipe_source, false);

      IF v_candidate_ids IS NULL OR array_length(v_candidate_ids, 1) IS NULL THEN
        v_candidate_ids := array[p_warehouse_id];
      END IF;

      v_remaining := p_qty_units;
      v_fallback := v_candidate_ids[1];

      FOREACH v_candidate IN ARRAY v_candidate_ids LOOP
        EXIT WHEN v_remaining <= 0;

        SELECT COALESCE(wsi.net_units, 0)
        INTO v_available
        FROM public.warehouse_stock_items wsi
        WHERE wsi.warehouse_id = v_candidate
          AND wsi.item_id = p_item_id
          AND wsi.variant_key = 'base'
        LIMIT 1;

        v_deduct_qty := LEAST(v_remaining, GREATEST(v_available, 0));
        IF v_deduct_qty <= 0 THEN
          CONTINUE;
        END IF;

        INSERT INTO public.stock_ledger(
          location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
        ) VALUES (
          'warehouse', v_candidate, p_item_id, v_variant_key,
          -1 * v_deduct_qty, 'recipe_consumption',
          jsonb_build_object('recipe_leaf', true, 'qty_units', v_deduct_qty) || COALESCE(p_context, '{}')
        );

        v_remaining := v_remaining - v_deduct_qty;
      END LOOP;

      IF v_remaining > 0 THEN
        INSERT INTO public.stock_ledger(
          location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
        ) VALUES (
          'warehouse', COALESCE(v_fallback, p_warehouse_id), p_item_id, v_variant_key,
          -1 * v_remaining, 'recipe_consumption',
          jsonb_build_object('recipe_leaf', true, 'qty_units', v_remaining) || COALESCE(p_context, '{}')
        );
      END IF;
    END IF;
    RETURN;
  END IF;

  -- 1) Ingredients first (recursively resolves to raw when ingredient has its own recipe)
  FOR comp IN
    SELECT r.ingredient_item_id AS item_id,
           r.qty_per_unit AS qty_units,
           r.qty_unit::text AS qty_unit,
           ci.item_kind AS component_kind,
           ci.consumption_unit AS consumption_unit,
           ci.purchase_unit_mass AS purchase_unit_mass,
           ci.purchase_unit_mass_uom AS purchase_unit_mass_uom
    FROM public.recipes r
    JOIN public.catalog_items ci ON ci.id = r.ingredient_item_id
    WHERE r.active
      AND r.finished_item_id = p_item_id
      AND (NOT v_use_kind_filter OR r.recipe_for_kind = v_item_kind)
      AND public.normalize_variant_key(COALESCE(r.finished_variant_key, 'base')) = v_variant_key
      AND ci.item_kind = 'ingredient'
  LOOP
    v_comp_qty := public.convert_uom_qty(comp.qty_units, comp.qty_unit, comp.consumption_unit);

    IF comp.purchase_unit_mass IS NOT NULL
      AND comp.purchase_unit_mass > 0
      AND comp.purchase_unit_mass_uom IS NOT NULL
      AND (comp.consumption_unit IS NULL OR lower(comp.consumption_unit) IN ('each', 'pc', 'piece', 'pieces')) THEN
      v_comp_qty := public.convert_uom_qty(comp.qty_units, comp.qty_unit, comp.purchase_unit_mass_uom);
      v_comp_qty := v_comp_qty / comp.purchase_unit_mass;
    END IF;

    v_effective_qty := (p_qty_units / v_yield) * v_comp_qty;

    SELECT array_agg(DISTINCT iwhp.warehouse_id)
    INTO v_candidate_ids
    FROM public.item_warehouse_handling_policies iwhp
    WHERE iwhp.item_id = comp.item_id
      AND COALESCE(iwhp.recipe_source, false);

    IF v_candidate_ids IS NULL OR array_length(v_candidate_ids, 1) IS NULL THEN
      v_candidate_ids := array[p_warehouse_id];
    END IF;

    v_remaining := v_effective_qty;
    v_fallback := v_candidate_ids[1];

    FOREACH v_candidate IN ARRAY v_candidate_ids LOOP
      EXIT WHEN v_remaining <= 0;

      SELECT COALESCE(wsi.net_units, 0)
      INTO v_available
      FROM public.warehouse_stock_items wsi
      WHERE wsi.warehouse_id = v_candidate
        AND wsi.item_id = comp.item_id
        AND wsi.variant_key = 'base'
      LIMIT 1;

      v_deduct_qty := LEAST(v_remaining, GREATEST(v_available, 0));
      IF v_deduct_qty <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
      ) VALUES (
        'warehouse', v_candidate, comp.item_id, 'base',
        -1 * v_deduct_qty, 'recipe_consumption',
        jsonb_build_object(
          'recipe_for', p_item_id,
          'qty_units', p_qty_units,
          'component_qty', v_comp_qty,
          'qty_unit', comp.qty_unit,
          'consumption_unit', comp.consumption_unit,
          'component_kind', comp.component_kind
        ) || COALESCE(p_context, '{}')
      );

      PERFORM public.apply_recipe_deductions(
        comp.item_id,
        v_deduct_qty,
        v_candidate,
        'base',
        COALESCE(p_context, '{}') || jsonb_build_object('via', p_item_id, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit),
        p_depth + 1,
        array_append(p_seen, p_item_id)
      );

      v_remaining := v_remaining - v_deduct_qty;
    END LOOP;

    IF v_remaining > 0 THEN
      INSERT INTO public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
      ) VALUES (
        'warehouse', COALESCE(v_fallback, p_warehouse_id), comp.item_id, 'base',
        -1 * v_remaining, 'recipe_consumption',
        jsonb_build_object(
          'recipe_for', p_item_id,
          'qty_units', p_qty_units,
          'component_qty', v_comp_qty,
          'qty_unit', comp.qty_unit,
          'consumption_unit', comp.consumption_unit,
          'component_kind', comp.component_kind
        ) || COALESCE(p_context, '{}')
      );

      PERFORM public.apply_recipe_deductions(
        comp.item_id,
        v_remaining,
        COALESCE(v_fallback, p_warehouse_id),
        'base',
        COALESCE(p_context, '{}') || jsonb_build_object('via', p_item_id, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit),
        p_depth + 1,
        array_append(p_seen, p_item_id)
      );
    END IF;
  END LOOP;

  -- 2) Raw (or non-ingredient) components last
  FOR comp IN
    SELECT r.ingredient_item_id AS item_id,
           r.qty_per_unit AS qty_units,
           r.qty_unit::text AS qty_unit,
           ci.item_kind AS component_kind,
           ci.consumption_unit AS consumption_unit,
           ci.purchase_unit_mass AS purchase_unit_mass,
           ci.purchase_unit_mass_uom AS purchase_unit_mass_uom
    FROM public.recipes r
    JOIN public.catalog_items ci ON ci.id = r.ingredient_item_id
    WHERE r.active
      AND r.finished_item_id = p_item_id
      AND (NOT v_use_kind_filter OR r.recipe_for_kind = v_item_kind)
      AND public.normalize_variant_key(COALESCE(r.finished_variant_key, 'base')) = v_variant_key
      AND ci.item_kind <> 'ingredient'
  LOOP
    v_comp_qty := public.convert_uom_qty(comp.qty_units, comp.qty_unit, comp.consumption_unit);

    IF comp.purchase_unit_mass IS NOT NULL
      AND comp.purchase_unit_mass > 0
      AND comp.purchase_unit_mass_uom IS NOT NULL
      AND (comp.consumption_unit IS NULL OR lower(comp.consumption_unit) IN ('each', 'pc', 'piece', 'pieces')) THEN
      v_comp_qty := public.convert_uom_qty(comp.qty_units, comp.qty_unit, comp.purchase_unit_mass_uom);
      v_comp_qty := v_comp_qty / comp.purchase_unit_mass;
    END IF;

    v_effective_qty := (p_qty_units / v_yield) * v_comp_qty;

    SELECT array_agg(DISTINCT iwhp.warehouse_id)
    INTO v_candidate_ids
    FROM public.item_warehouse_handling_policies iwhp
    WHERE iwhp.item_id = comp.item_id
      AND COALESCE(iwhp.recipe_source, false);

    IF v_candidate_ids IS NULL OR array_length(v_candidate_ids, 1) IS NULL THEN
      v_candidate_ids := array[p_warehouse_id];
    END IF;

    v_remaining := v_effective_qty;
    v_fallback := v_candidate_ids[1];

    FOREACH v_candidate IN ARRAY v_candidate_ids LOOP
      EXIT WHEN v_remaining <= 0;

      SELECT COALESCE(wsi.net_units, 0)
      INTO v_available
      FROM public.warehouse_stock_items wsi
      WHERE wsi.warehouse_id = v_candidate
        AND wsi.item_id = comp.item_id
        AND wsi.variant_key = 'base'
      LIMIT 1;

      v_deduct_qty := LEAST(v_remaining, GREATEST(v_available, 0));
      IF v_deduct_qty <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
      ) VALUES (
        'warehouse', v_candidate, comp.item_id, 'base',
        -1 * v_deduct_qty, 'recipe_consumption',
        jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', v_comp_qty, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit) || COALESCE(p_context, '{}')
      );

      v_remaining := v_remaining - v_deduct_qty;
    END LOOP;

    IF v_remaining > 0 THEN
      INSERT INTO public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
      ) VALUES (
        'warehouse', COALESCE(v_fallback, p_warehouse_id), comp.item_id, 'base',
        -1 * v_remaining, 'recipe_consumption',
        jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', v_comp_qty, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit) || COALESCE(p_context, '{}')
      );
    END IF;
  END LOOP;
END;
$function$;

COMMIT;
