-- Flow batch grouping + strict trace idempotency

CREATE TABLE IF NOT EXISTS public.stock_flow_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid NULL,
  outlet_id uuid NULL,
  warehouse_id uuid NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_flow_batches_source
  ON public.stock_flow_batches (source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_stock_flow_batches_outlet
  ON public.stock_flow_batches (outlet_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_flow_batches_warehouse
  ON public.stock_flow_batches (warehouse_id, occurred_at DESC);

ALTER TABLE public.stock_ledger
  ADD COLUMN IF NOT EXISTS flow_batch_id uuid NULL REFERENCES public.stock_flow_batches(id) ON DELETE SET NULL;

ALTER TABLE public.flow_traces
  ADD COLUMN IF NOT EXISTS flow_batch_id uuid NULL REFERENCES public.stock_flow_batches(id) ON DELETE SET NULL;

ALTER TABLE public.flow_trace_steps
  ADD COLUMN IF NOT EXISTS flow_batch_id uuid NULL REFERENCES public.stock_flow_batches(id) ON DELETE SET NULL;

ALTER TABLE public.flow_trace_steps
  ADD COLUMN IF NOT EXISTS ledger_id uuid NULL REFERENCES public.stock_ledger(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_flow_trace_steps_ledger
  ON public.flow_trace_steps (ledger_id)
  WHERE ledger_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_flow_traces_batch_level_item_wh
  ON public.flow_traces (flow_batch_id, level, item_id, warehouse_id, variant_key)
  WHERE flow_batch_id IS NOT NULL;

ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS auto_open_stock_period boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.ensure_open_stock_period(p_warehouse_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_warehouse_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.warehouse_stock_periods wsp
    WHERE wsp.warehouse_id = p_warehouse_id
      AND wsp.status = 'open'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.warehouses w
    WHERE w.id = p_warehouse_id
      AND COALESCE(w.auto_open_stock_period, false)
  ) THEN
    PERFORM public.start_stock_period(p_warehouse_id, 'Auto-open for stock flow');
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stock_ledger_flow_trace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_id uuid := nullif(new.context->>'sale_id', '')::uuid;
  v_order_id uuid := nullif(new.context->>'order_id', '')::uuid;
  v_outlet_id uuid := nullif(new.context->>'outlet_id', '')::uuid;
  v_component_kind text := lower(coalesce(new.context->>'component_kind', ''));
  v_flow_batch_id uuid := coalesce(new.flow_batch_id, nullif(new.context->>'flow_batch_id', '')::uuid);
  v_level text;
  v_trace_id uuid;
  v_available numeric := null;
  v_negative boolean := false;
BEGIN
  IF new.reason NOT IN ('outlet_sale', 'recipe_consumption') THEN
    RETURN new;
  END IF;

  IF new.reason = 'outlet_sale' THEN
    v_level := 'finished';
  ELSIF v_component_kind = 'ingredient' THEN
    v_level := 'ingredient';
  ELSE
    v_level := 'raw';
  END IF;

  IF new.warehouse_id IS NOT NULL THEN
    SELECT wsi.net_units
      INTO v_available
    FROM public.warehouse_stock_items wsi
    WHERE wsi.warehouse_id = new.warehouse_id
      AND wsi.item_id = new.item_id
      AND wsi.variant_key = public.normalize_variant_key(coalesce(new.variant_key, 'base'))
    LIMIT 1;
  END IF;

  IF v_available IS NOT NULL AND v_available < 0 THEN
    v_negative := true;
  END IF;

  IF v_flow_batch_id IS NOT NULL THEN
    INSERT INTO public.flow_traces (
      sale_id,
      order_id,
      outlet_id,
      level,
      item_id,
      variant_key,
      warehouse_id,
      flow_batch_id,
      context
    ) VALUES (
      v_sale_id,
      v_order_id,
      v_outlet_id,
      v_level,
      new.item_id,
      public.normalize_variant_key(coalesce(new.variant_key, 'base')),
      new.warehouse_id,
      v_flow_batch_id,
      new.context
    )
    ON CONFLICT ON CONSTRAINT ux_flow_traces_batch_level_item_wh
    DO UPDATE SET
      context = excluded.context
    RETURNING id INTO v_trace_id;
  ELSE
    INSERT INTO public.flow_traces (
      sale_id,
      order_id,
      outlet_id,
      level,
      item_id,
      variant_key,
      warehouse_id,
      context
    ) VALUES (
      v_sale_id,
      v_order_id,
      v_outlet_id,
      v_level,
      new.item_id,
      public.normalize_variant_key(coalesce(new.variant_key, 'base')),
      new.warehouse_id,
      new.context
    )
    ON CONFLICT ON CONSTRAINT ux_flow_traces_sale_level_item_wh
    DO UPDATE SET
      context = excluded.context
    RETURNING id INTO v_trace_id;
  END IF;

  INSERT INTO public.flow_trace_steps (
    trace_id,
    occurred_at,
    delta_units,
    available_units,
    reason,
    negative,
    context,
    flow_batch_id,
    ledger_id
  ) VALUES (
    v_trace_id,
    new.occurred_at,
    new.delta_units,
    v_available,
    new.reason,
    v_negative,
    new.context,
    v_flow_batch_id,
    new.id
  )
  ON CONFLICT (ledger_id)
  DO NOTHING;

  RETURN new;
END;
$function$;

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
  v_outlet_id uuid := nullif(p_context->>'outlet_id', '')::uuid;
  v_flow_batch_id uuid := nullif(p_context->>'flow_batch_id', '')::uuid;
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
          location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, flow_batch_id
        ) VALUES (
          'warehouse', v_candidate, p_item_id, v_variant_key,
          -1 * v_deduct_qty, 'recipe_consumption',
          jsonb_build_object('recipe_leaf', true, 'qty_units', v_deduct_qty) || COALESCE(p_context, '{}'),
          v_flow_batch_id
        );

        v_remaining := v_remaining - v_deduct_qty;
      END LOOP;

      IF v_remaining > 0 THEN
        INSERT INTO public.stock_ledger(
          location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, flow_batch_id
        ) VALUES (
          'warehouse', COALESCE(v_fallback, p_warehouse_id), p_item_id, v_variant_key,
          -1 * v_remaining, 'recipe_consumption',
          jsonb_build_object('recipe_leaf', true, 'qty_units', v_remaining) || COALESCE(p_context, '{}'),
          v_flow_batch_id
        );

        INSERT INTO public.warehouse_backoffice_logs(
          user_id,
          user_email,
          action,
          page,
          method,
          status,
          details
        ) VALUES (
          auth.uid(),
          current_setting('request.jwt.claim.email', true),
          'recipe_negative_balance',
          '/Warehouse_Backoffice',
          'rpc',
          200,
          jsonb_build_object(
            'outlet_id', v_outlet_id,
            'recipe_for', p_item_id,
            'component_id', p_item_id,
            'warehouse_id', COALESCE(v_fallback, p_warehouse_id),
            'requested_qty', p_qty_units,
            'remaining_qty', v_remaining
          )
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
           ci.purchase_unit_mass_uom AS purchase_unit_mass_uom,
           r.source_warehouse_id AS source_warehouse_id
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

    IF comp.source_warehouse_id IS NOT NULL THEN
      v_candidate_ids := array[comp.source_warehouse_id];
    ELSE
      SELECT array_agg(DISTINCT iwhp.warehouse_id)
      INTO v_candidate_ids
      FROM public.item_warehouse_handling_policies iwhp
      WHERE iwhp.item_id = comp.item_id
        AND COALESCE(iwhp.recipe_source, false);

      IF v_candidate_ids IS NULL OR array_length(v_candidate_ids, 1) IS NULL THEN
        v_candidate_ids := array[p_warehouse_id];
      END IF;
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
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, flow_batch_id
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
        ) || COALESCE(p_context, '{}'),
        v_flow_batch_id
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
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, flow_batch_id
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
        ) || COALESCE(p_context, '{}'),
        v_flow_batch_id
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

      INSERT INTO public.warehouse_backoffice_logs(
        user_id,
        user_email,
        action,
        page,
        method,
        status,
        details
      ) VALUES (
        auth.uid(),
        current_setting('request.jwt.claim.email', true),
        'recipe_negative_balance',
        '/Warehouse_Backoffice',
        'rpc',
        200,
        jsonb_build_object(
          'outlet_id', v_outlet_id,
          'recipe_for', p_item_id,
          'component_id', comp.item_id,
          'warehouse_id', COALESCE(v_fallback, p_warehouse_id),
          'requested_qty', v_effective_qty,
          'remaining_qty', v_remaining
        )
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
           ci.purchase_unit_mass_uom AS purchase_unit_mass_uom,
           r.source_warehouse_id AS source_warehouse_id
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

    IF comp.source_warehouse_id IS NOT NULL THEN
      v_candidate_ids := array[comp.source_warehouse_id];
    ELSE
      SELECT array_agg(DISTINCT iwhp.warehouse_id)
      INTO v_candidate_ids
      FROM public.item_warehouse_handling_policies iwhp
      WHERE iwhp.item_id = comp.item_id
        AND COALESCE(iwhp.recipe_source, false);

      IF v_candidate_ids IS NULL OR array_length(v_candidate_ids, 1) IS NULL THEN
        v_candidate_ids := array[p_warehouse_id];
      END IF;
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
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, flow_batch_id
      ) VALUES (
        'warehouse', v_candidate, comp.item_id, 'base',
        -1 * v_deduct_qty, 'recipe_consumption',
        jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', v_comp_qty, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit) || COALESCE(p_context, '{}'),
        v_flow_batch_id
      );

      v_remaining := v_remaining - v_deduct_qty;
    END LOOP;

    IF v_remaining > 0 THEN
      INSERT INTO public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, flow_batch_id
      ) VALUES (
        'warehouse', COALESCE(v_fallback, p_warehouse_id), comp.item_id, 'base',
        -1 * v_remaining, 'recipe_consumption',
        jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', v_comp_qty, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit) || COALESCE(p_context, '{}'),
        v_flow_batch_id
      );

      INSERT INTO public.warehouse_backoffice_logs(
        user_id,
        user_email,
        action,
        page,
        method,
        status,
        details
      ) VALUES (
        auth.uid(),
        current_setting('request.jwt.claim.email', true),
        'recipe_negative_balance',
        '/Warehouse_Backoffice',
        'rpc',
        200,
        jsonb_build_object(
          'outlet_id', v_outlet_id,
          'recipe_for', p_item_id,
          'component_id', comp.item_id,
          'warehouse_id', COALESCE(v_fallback, p_warehouse_id),
          'requested_qty', v_effective_qty,
          'remaining_qty', v_remaining
        )
      );
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_outlet_sale(
  p_outlet_id uuid,
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_key text DEFAULT 'base'::text,
  p_is_production boolean DEFAULT false,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_sold_at timestamp with time zone DEFAULT now(),
  p_sale_price numeric DEFAULT NULL::numeric,
  p_vat_exc_price numeric DEFAULT NULL::numeric,
  p_flavour_price numeric DEFAULT NULL::numeric,
  p_flavour_id text DEFAULT NULL::text,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS outlet_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
DECLARE
  v_sale public.outlet_sales%rowtype;
  v_route record;
  v_deduct_outlet uuid;
  v_deduct_wh uuid;
  v_default_wh uuid;
  v_deduct_enabled boolean;
  v_variant_key text := public.normalize_variant_key(p_variant_key);
  v_consumption_per_base numeric := 1;
  v_consumption_unit text;
  v_effective_qty numeric;
  v_flow_batch_id uuid;
BEGIN
  if p_outlet_id is null or p_item_id is null or p_qty_units is null or p_qty_units <= 0 then
    raise exception 'outlet, item, qty required';
  end if;

  select coalesce(deduct_on_pos_sale, true) into v_deduct_enabled
  from public.outlets where id = p_outlet_id;

  select warehouse_id, target_outlet_id, coalesce(deduct_enabled, true) as deduct_enabled
  into v_route
  from public.outlet_item_routes
  where outlet_id = p_outlet_id
    and item_id = p_item_id
    and normalized_variant_key in (v_variant_key, 'base')
  order by (normalized_variant_key = v_variant_key) desc
  limit 1;

  v_deduct_enabled := coalesce(v_route.deduct_enabled, v_deduct_enabled, true);

  if v_deduct_enabled = false then
    insert into public.outlet_sales(
      outlet_id, item_id, variant_key, qty_units, sale_price, vat_exc_price, flavour_price,
      is_production, flavour_id, warehouse_id, sold_at, created_by, context
    ) values (
      p_outlet_id, p_item_id, v_variant_key, p_qty_units, p_sale_price, p_vat_exc_price,
      coalesce(p_flavour_price, p_vat_exc_price), coalesce(p_is_production, false),
      p_flavour_id, p_warehouse_id, p_sold_at, auth.uid(), p_context
    ) returning * into v_sale;
    return v_sale;
  end if;

  v_deduct_outlet := coalesce(v_route.target_outlet_id, p_outlet_id);

  select w.id
  into v_default_wh
  from public.outlets o
  join public.warehouses w on w.id = o.default_sales_warehouse_id
  where o.id = v_deduct_outlet
    and coalesce(w.active, true)
  limit 1;

  if v_default_wh is null then
    select w.id
    into v_default_wh
    from public.warehouses w
    where w.outlet_id = v_deduct_outlet
      and coalesce(w.active, true)
    order by coalesce(w.name, ''), w.id
    limit 1;
  end if;

  v_deduct_wh := coalesce(p_warehouse_id, v_route.warehouse_id, v_default_wh);

  if v_deduct_wh is null then
    raise exception 'no warehouse mapping for outlet %, item %, variant_key %', p_outlet_id, p_item_id, v_variant_key;
  end if;

  perform public.ensure_open_stock_period(v_deduct_wh);
  perform public.require_open_stock_period_for_outlet_warehouse(v_deduct_wh);

  select coalesce(ci.consumption_qty_per_base, 1), ci.consumption_unit
  into v_consumption_per_base, v_consumption_unit
  from public.catalog_items ci
  where ci.id = p_item_id;

  v_effective_qty := p_qty_units * coalesce(v_consumption_per_base, 1);

  insert into public.outlet_sales(
    outlet_id, item_id, variant_key, qty_units, sale_price, vat_exc_price, flavour_price,
    is_production, flavour_id, warehouse_id, sold_at, created_by, context
  ) values (
    p_outlet_id, p_item_id, v_variant_key, p_qty_units, p_sale_price, p_vat_exc_price,
    coalesce(p_flavour_price, p_vat_exc_price), coalesce(p_is_production, false),
    p_flavour_id, v_deduct_wh, p_sold_at, auth.uid(), p_context
  ) returning * into v_sale;

  insert into public.stock_flow_batches(
    source_type,
    source_id,
    outlet_id,
    warehouse_id,
    occurred_at,
    status,
    context
  ) values (
    'outlet_sale',
    v_sale.id,
    p_outlet_id,
    v_deduct_wh,
    p_sold_at,
    'open',
    coalesce(p_context, '{}')
  ) returning id into v_flow_batch_id;

  insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)
  values (p_outlet_id, p_item_id, v_variant_key, 0, v_effective_qty)
  on conflict (outlet_id, item_id, variant_key)
  do update set consumed_units = public.outlet_stock_balances.consumed_units + excluded.consumed_units,
                updated_at = now();

  insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at, flow_batch_id)
  values (
    'warehouse',
    v_deduct_wh,
    p_item_id,
    v_variant_key,
    -1 * v_effective_qty,
    'outlet_sale',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'outlet_id', p_outlet_id,
      'sale_price', p_sale_price,
      'vat_exc_price', p_vat_exc_price,
      'flavour_id', p_flavour_id,
      'uom_used', coalesce(v_consumption_unit, 'each'),
      'consumption_qty_per_base', coalesce(v_consumption_per_base, 1),
      'source_qty_units', p_qty_units,
      'sold_at', p_sold_at,
      'flow_batch_id', v_flow_batch_id
    ) || coalesce(p_context, '{}'),
    p_sold_at,
    v_flow_batch_id
  );

  perform public.apply_recipe_deductions(
    p_item_id,
    p_qty_units,
    v_deduct_wh,
    v_variant_key,
    jsonb_build_object(
      'source','outlet_sale',
      'outlet_id',p_outlet_id,
      'deduct_outlet_id',v_deduct_outlet,
      'warehouse_id',v_deduct_wh,
      'sale_id',v_sale.id,
      'flow_batch_id', v_flow_batch_id
    ) || coalesce(p_context,'{}'),
    0,
    array[]::uuid[]
  );

  return v_sale;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_outlet_sale(
  p_outlet_id uuid,
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_key text DEFAULT 'base'::text,
  p_is_production boolean DEFAULT false,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_sold_at timestamp with time zone DEFAULT now(),
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS outlet_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
DECLARE
  v_sale public.outlet_sales%rowtype;
  v_route record;
  v_deduct_outlet uuid;
  v_deduct_wh uuid;
  v_default_wh uuid;
  v_deduct_enabled boolean;
  v_variant_key text := public.normalize_variant_key(p_variant_key);
  v_consumption_per_base numeric := 1;
  v_consumption_unit text;
  v_effective_qty numeric;
  v_flow_batch_id uuid;
BEGIN
  if p_outlet_id is null or p_item_id is null or p_qty_units is null or p_qty_units <= 0 then
    raise exception 'outlet, item, qty required';
  end if;

  select coalesce(deduct_on_pos_sale, true) into v_deduct_enabled
  from public.outlets where id = p_outlet_id;

  select warehouse_id, target_outlet_id, coalesce(deduct_enabled, true) as deduct_enabled
  into v_route
  from public.outlet_item_routes
  where outlet_id = p_outlet_id
    and item_id = p_item_id
    and normalized_variant_key in (v_variant_key, 'base')
  order by (normalized_variant_key = v_variant_key) desc
  limit 1;

  v_deduct_enabled := coalesce(v_route.deduct_enabled, v_deduct_enabled, true);

  if v_deduct_enabled = false then
    insert into public.outlet_sales(
      outlet_id, item_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context
    ) values (
      p_outlet_id, p_item_id, v_variant_key, p_qty_units, coalesce(p_is_production, false),
      p_warehouse_id, p_sold_at, auth.uid(), p_context
    ) returning * into v_sale;
    return v_sale;
  end if;

  v_deduct_outlet := coalesce(v_route.target_outlet_id, p_outlet_id);

  select w.id
  into v_default_wh
  from public.outlets o
  join public.warehouses w on w.id = o.default_sales_warehouse_id
  where o.id = v_deduct_outlet
    and coalesce(w.active, true)
  limit 1;

  if v_default_wh is null then
    select w.id
    into v_default_wh
    from public.warehouses w
    where w.outlet_id = v_deduct_outlet
      and coalesce(w.active, true)
    order by coalesce(w.name, ''), w.id
    limit 1;
  end if;

  v_deduct_wh := coalesce(p_warehouse_id, v_route.warehouse_id, v_default_wh);

  if v_deduct_wh is null then
    raise exception 'no warehouse mapping for outlet %, item %, variant_key %', p_outlet_id, p_item_id, v_variant_key;
  end if;

  perform public.ensure_open_stock_period(v_deduct_wh);
  perform public.require_open_stock_period_for_outlet_warehouse(v_deduct_wh);

  select coalesce(ci.consumption_qty_per_base, 1), ci.consumption_unit
  into v_consumption_per_base, v_consumption_unit
  from public.catalog_items ci
  where ci.id = p_item_id;

  v_effective_qty := p_qty_units * coalesce(v_consumption_per_base, 1);

  insert into public.outlet_sales(
    outlet_id, item_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context
  ) values (
    p_outlet_id, p_item_id, v_variant_key, p_qty_units, coalesce(p_is_production, false),
    v_deduct_wh, p_sold_at, auth.uid(), p_context
  ) returning * into v_sale;

  insert into public.stock_flow_batches(
    source_type,
    source_id,
    outlet_id,
    warehouse_id,
    occurred_at,
    status,
    context
  ) values (
    'outlet_sale',
    v_sale.id,
    p_outlet_id,
    v_deduct_wh,
    p_sold_at,
    'open',
    coalesce(p_context, '{}')
  ) returning id into v_flow_batch_id;

  insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)
  values (p_outlet_id, p_item_id, v_variant_key, 0, v_effective_qty)
  on conflict (outlet_id, item_id, variant_key)
  do update set
    consumed_units = public.outlet_stock_balances.consumed_units + excluded.consumed_units,
    updated_at = now();

  insert into public.stock_ledger(
    location_type,
    warehouse_id,
    item_id,
    variant_key,
    delta_units,
    reason,
    context,
    occurred_at,
    flow_batch_id
  ) values (
    'warehouse',
    v_deduct_wh,
    p_item_id,
    v_variant_key,
    -1 * v_effective_qty,
    'outlet_sale',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'outlet_id', p_outlet_id,
      'uom_used', coalesce(v_consumption_unit, 'each'),
      'consumption_qty_per_base', coalesce(v_consumption_per_base, 1),
      'source_qty_units', p_qty_units,
      'sold_at', p_sold_at,
      'flow_batch_id', v_flow_batch_id
    ) || coalesce(p_context, '{}'),
    p_sold_at,
    v_flow_batch_id
  );

  perform public.apply_recipe_deductions(
    p_item_id,
    p_qty_units,
    v_deduct_wh,
    v_variant_key,
    jsonb_build_object(
      'source','outlet_sale',
      'outlet_id',p_outlet_id,
      'deduct_outlet_id',v_deduct_outlet,
      'warehouse_id',v_deduct_wh,
      'sale_id',v_sale.id,
      'flow_batch_id', v_flow_batch_id
    ) || coalesce(p_context,'{}'),
    0,
    array[]::uuid[]
  );

  return v_sale;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_production_entry(
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_key text DEFAULT 'base'::text,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_note text DEFAULT NULL::text
)
RETURNS production_entries
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
  v_flow_batch_id uuid;
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

  insert into public.stock_flow_batches(
    source_type,
    source_id,
    outlet_id,
    warehouse_id,
    occurred_at,
    status,
    context
  ) values (
    'production_entry',
    v_row.id,
    null,
    p_warehouse_id,
    now(),
    'open',
    jsonb_build_object('note', p_note)
  ) returning id into v_flow_batch_id;

  INSERT INTO public.stock_ledger(
    location_type,
    warehouse_id,
    item_id,
    variant_key,
    delta_units,
    reason,
    context,
    flow_batch_id
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
      'source', 'production_entry',
      'flow_batch_id', v_flow_batch_id
    ),
    v_flow_batch_id
  );

  PERFORM public.apply_recipe_deductions(
    p_item_id,
    p_qty_units,
    p_warehouse_id,
    v_variant,
    jsonb_build_object(
      'source', 'production_entry',
      'production_entry_id', v_row.id::text,
      'period_id', v_period_id::text,
      'flow_batch_id', v_flow_batch_id
    ),
    0,
    array[]::uuid[]
  );

  RETURN v_row;
END;
$function$;
