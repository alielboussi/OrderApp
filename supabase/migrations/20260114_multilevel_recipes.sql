-- Multilevel recipes: introduce recipe header + components and recursive deduction
BEGIN;

CREATE TABLE IF NOT EXISTS public.item_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_item_id uuid NOT NULL REFERENCES public.catalog_items(id),
  finished_variant_id uuid REFERENCES public.catalog_variants(id),
  name text,
  active boolean NOT NULL DEFAULT true,
  yield_qty_units numeric NOT NULL DEFAULT 1 CHECK (yield_qty_units > 0),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.item_recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.item_recipes(id) ON DELETE CASCADE,
  ingredient_item_id uuid NOT NULL REFERENCES public.catalog_items(id),
  ingredient_variant_id uuid REFERENCES public.catalog_variants(id),
  qty_units numeric NOT NULL CHECK (qty_units > 0),
  is_leaf boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_recipes_finished ON public.item_recipes(finished_item_id, finished_variant_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_item_recipe_ingredients_recipe ON public.item_recipe_ingredients(recipe_id);

-- Optional bootstrap: import existing flat recipes as one-level parents
INSERT INTO public.item_recipes (id, finished_item_id, finished_variant_id, name, active)
SELECT gen_random_uuid(), iir.finished_item_id, iir.finished_variant_id, 'Imported v1 recipe', iir.active
FROM public.item_ingredient_recipes iir
GROUP BY iir.finished_item_id, iir.finished_variant_id, iir.active
ON CONFLICT DO NOTHING;

INSERT INTO public.item_recipe_ingredients (recipe_id, ingredient_item_id, ingredient_variant_id, qty_units, is_leaf)
SELECT ir.id, iir.ingredient_item_id, NULL, iir.qty_per_unit, true
FROM public.item_ingredient_recipes iir
JOIN public.item_recipes ir
  ON ir.finished_item_id = iir.finished_item_id
 AND coalesce(ir.finished_variant_id, '00000000-0000-0000-0000-000000000000') = coalesce(iir.finished_variant_id, '00000000-0000-0000-0000-000000000000')
WHERE ir.active
ON CONFLICT DO NOTHING;

-- Recursive recipe deductions: walks recipe tree until leaf ingredients
CREATE OR REPLACE FUNCTION public.apply_recipe_deductions(
  p_item_id uuid,
  p_qty_units numeric,
  p_warehouse_id uuid,
  p_variant_id uuid DEFAULT NULL::uuid,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_depth integer DEFAULT 0,
  p_seen uuid[] DEFAULT '{}'::uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  comp record;
  v_recipe record;
  v_effective_qty numeric;
  v_yield numeric;
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

  SELECT r.id, r.yield_qty_units
  INTO v_recipe
  FROM public.item_recipes r
  WHERE r.active
    AND r.finished_item_id = p_item_id
    AND (r.finished_variant_id IS NULL OR r.finished_variant_id = p_variant_id)
  ORDER BY r.finished_variant_id DESC NULLS LAST
  LIMIT 1;

  IF v_recipe.id IS NULL THEN
    INSERT INTO public.stock_ledger(
      location_type,
      warehouse_id,
      item_id,
      variant_id,
      delta_units,
      reason,
      context
    ) VALUES (
      'warehouse',
      p_warehouse_id,
      p_item_id,
      p_variant_id,
      -1 * p_qty_units,
      'recipe_consumption',
      jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units) || coalesce(p_context, '{}')
    );
    RETURN;
  END IF;

  v_yield := coalesce(nullif(v_recipe.yield_qty_units, 0), 1);

  FOR comp IN
    (
      SELECT iri.ingredient_item_id AS item_id,
             iri.ingredient_variant_id AS variant_id,
             iri.qty_units,
             iri.is_leaf AS force_leaf
      FROM public.item_recipe_ingredients iri
      WHERE iri.recipe_id = v_recipe.id
    )
    UNION ALL
    (
      SELECT iir.ingredient_item_id AS item_id,
             NULL AS variant_id,
             iir.qty_per_unit AS qty_units,
             true AS force_leaf
      FROM public.item_ingredient_recipes iir
      WHERE iir.finished_item_id = p_item_id
        AND (iir.finished_variant_id IS NULL OR iir.finished_variant_id = p_variant_id)
        AND iir.active
    )
  LOOP
    v_effective_qty := (p_qty_units / v_yield) * comp.qty_units;

    IF comp.force_leaf THEN
      INSERT INTO public.stock_ledger(
        location_type,
        warehouse_id,
        item_id,
        variant_id,
        delta_units,
        reason,
        context
      ) VALUES (
        'warehouse',
        p_warehouse_id,
        comp.item_id,
        comp.variant_id,
        -1 * v_effective_qty,
        'recipe_consumption',
        jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', comp.qty_units) || coalesce(p_context, '{}')
      );
    ELSE
      PERFORM public.apply_recipe_deductions(
        comp.item_id,
        v_effective_qty,
        p_warehouse_id,
        comp.variant_id,
        coalesce(p_context, '{}') || jsonb_build_object('via', p_item_id),
        p_depth + 1,
        array_append(p_seen, p_item_id)
      );
    END IF;
  END LOOP;
END;
$$;

-- Deduct finished item and cascade to raw ingredients on outlet sales
CREATE OR REPLACE FUNCTION public.record_outlet_sale(
  p_outlet_id uuid,
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_id uuid DEFAULT NULL::uuid,
  p_is_production boolean DEFAULT false,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_sold_at timestamptz DEFAULT now(),
  p_context jsonb DEFAULT '{}'::jsonb
) RETURNS outlet_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale public.outlet_sales%ROWTYPE;
  v_route record;
  v_deduct_outlet uuid;
  v_deduct_wh uuid;
  v_deduct_enabled boolean;
BEGIN
  IF p_outlet_id IS NULL OR p_item_id IS NULL OR p_qty_units IS NULL OR p_qty_units <= 0 THEN
    RAISE EXCEPTION 'outlet, item, qty required';
  END IF;

  SELECT coalesce(deduct_on_pos_sale, true) INTO v_deduct_enabled
  FROM public.outlets WHERE id = p_outlet_id;

  IF v_deduct_enabled = false THEN
    INSERT INTO public.outlet_sales(
      outlet_id, item_id, variant_id, qty_units, is_production, warehouse_id, sold_at, created_by, context
    ) VALUES (
      p_outlet_id, p_item_id, p_variant_id, p_qty_units, coalesce(p_is_production, false), p_warehouse_id, p_sold_at, auth.uid(), p_context
    ) RETURNING * INTO v_sale;
    RETURN v_sale;
  END IF;

  SELECT warehouse_id, target_outlet_id
  INTO v_route
  FROM public.outlet_item_warehouse_map
  WHERE outlet_id = p_outlet_id
    AND item_id = p_item_id
    AND (variant_id IS NULL OR variant_id = p_variant_id)
  ORDER BY variant_id DESC NULLS LAST
  LIMIT 1;

  v_deduct_outlet := coalesce(v_route.target_outlet_id, p_outlet_id);
  v_deduct_wh := coalesce(
    p_warehouse_id,
    v_route.warehouse_id,
    (
      SELECT wd.warehouse_id
      FROM public.warehouse_defaults wd
      WHERE wd.item_id = p_item_id
        AND (wd.variant_id IS NULL OR wd.variant_id = p_variant_id)
      ORDER BY wd.variant_id DESC NULLS LAST
      LIMIT 1
    )
  );

  IF v_deduct_wh IS NULL THEN
    RAISE EXCEPTION 'no warehouse mapping for outlet %, item %, variant %', p_outlet_id, p_item_id, p_variant_id;
  END IF;

  INSERT INTO public.outlet_sales(
    outlet_id, item_id, variant_id, qty_units, is_production, warehouse_id, sold_at, created_by, context
  ) VALUES (
    p_outlet_id, p_item_id, p_variant_id, p_qty_units, coalesce(p_is_production, false), v_deduct_wh, p_sold_at, auth.uid(), p_context
  ) RETURNING * INTO v_sale;

  INSERT INTO public.outlet_stock_balances(outlet_id, item_id, variant_id, sent_units, consumed_units)
  VALUES (p_outlet_id, p_item_id, p_variant_id, 0, p_qty_units)
  ON CONFLICT (outlet_id, item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET
    consumed_units = public.outlet_stock_balances.consumed_units + EXCLUDED.consumed_units,
    updated_at = now();

  INSERT INTO public.stock_ledger(
    location_type,
    warehouse_id,
    item_id,
    variant_id,
    delta_units,
    reason,
    context
  ) VALUES (
    'warehouse',
    v_deduct_wh,
    p_item_id,
    p_variant_id,
    -1 * p_qty_units,
    'outlet_sale',
    jsonb_build_object('sale_id', v_sale.id, 'outlet_id', p_outlet_id) || coalesce(p_context, '{}')
  );

  PERFORM public.apply_recipe_deductions(
    p_item_id,
    p_qty_units,
    v_deduct_wh,
    p_variant_id,
    jsonb_build_object(
      'source','outlet_sale',
      'outlet_id',p_outlet_id,
      'deduct_outlet_id',v_deduct_outlet,
      'warehouse_id',v_deduct_wh,
      'sale_id',v_sale.id
    ) || coalesce(p_context,'{}'),
    0,
    array[]::uuid[]
  );

  RETURN v_sale;
END;
$$;

COMMIT;
