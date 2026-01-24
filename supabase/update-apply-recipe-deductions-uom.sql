-- Unit conversion table for recipe deductions
CREATE TABLE IF NOT EXISTS public.uom_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_uom text NOT NULL,
  to_uom text NOT NULL,
  multiplier numeric NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_uom, to_uom)
);

CREATE OR REPLACE FUNCTION public.set_uom_conversion_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_uom_conversions_updated_at ON public.uom_conversions;
CREATE TRIGGER trg_uom_conversions_updated_at
BEFORE UPDATE ON public.uom_conversions
FOR EACH ROW EXECUTE FUNCTION public.set_uom_conversion_updated_at();

-- Base mass + volume conversions
INSERT INTO public.uom_conversions (from_uom, to_uom, multiplier)
VALUES
  ('g','g',1),('kg','kg',1),('mg','mg',1),
  ('ml','ml',1),('l','l',1),
  ('each','each',1),
  ('kg','g',1000),('g','kg',0.001),
  ('kg','mg',1000000),('mg','kg',0.000001),
  ('g','mg',1000),('mg','g',0.001),
  ('l','ml',1000),('ml','l',0.001)
ON CONFLICT (from_uom, to_uom) DO UPDATE
SET multiplier = EXCLUDED.multiplier,
    active = true;

CREATE OR REPLACE FUNCTION public.convert_uom_qty(
  p_qty numeric,
  p_from text,
  p_to text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from text := lower(trim(coalesce(p_from, '')));
  v_to text := lower(trim(coalesce(p_to, '')));
  v_multiplier numeric := 1;
BEGIN
  IF p_qty IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_from = '' OR v_to = '' OR v_from = v_to THEN
    RETURN p_qty;
  END IF;

  SELECT uc.multiplier
    INTO v_multiplier
  FROM public.uom_conversions uc
  WHERE uc.active
    AND lower(uc.from_uom) = v_from
    AND lower(uc.to_uom) = v_to
  LIMIT 1;

  RETURN p_qty * COALESCE(v_multiplier, 1);
END;
$function$;

-- Convert recipe qty_unit into ingredient consumption_unit before deductions
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
  v_effective_qty numeric;
  v_variant_key text := public.normalize_variant_key(p_variant_key);
  v_item_kind item_kind;
  v_comp_qty numeric;
BEGIN
  if p_item_id is null or p_qty_units is null or p_qty_units <= 0 then
    raise exception 'item + qty required for recipe deductions';
  end if;

  if p_warehouse_id is null then
    raise exception 'warehouse required for recipe deductions';
  end if;

  if p_depth > 8 or p_item_id = any(p_seen) then
    raise exception 'recipe recursion detected for item %', p_item_id;
  end if;

  select ci.item_kind
  into v_item_kind
  from public.catalog_items ci
  where ci.id = p_item_id;

  if v_item_kind is null then
    raise exception 'catalog item % not found for recipe deductions', p_item_id;
  end if;

  select true, coalesce(min(r.yield_qty_units), 1)
  into v_has_recipe, v_yield
  from public.recipes r
  where r.active
    and r.finished_item_id = p_item_id
    and r.recipe_for_kind = v_item_kind
    and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = v_variant_key;

  if not v_has_recipe then
    if v_item_kind in ('ingredient', 'raw') then
      insert into public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
      ) values (
        'warehouse', p_warehouse_id, p_item_id, v_variant_key,
        -1 * p_qty_units, 'recipe_consumption',
        jsonb_build_object('recipe_leaf', true, 'qty_units', p_qty_units) || coalesce(p_context, '{}')
      );
    end if;
    return;
  end if;

  -- 1) Ingredients first (recursively resolves to raw when ingredient has its own recipe)
  for comp in
    select r.ingredient_item_id as item_id,
           r.qty_per_unit as qty_units,
           r.qty_unit::text as qty_unit,
           ci.item_kind as component_kind,
           ci.consumption_unit as consumption_unit
    from public.recipes r
    join public.catalog_items ci on ci.id = r.ingredient_item_id
    where r.active
      and r.finished_item_id = p_item_id
      and r.recipe_for_kind = v_item_kind
      and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = v_variant_key
      and ci.item_kind = 'ingredient'
  loop
    v_comp_qty := public.convert_uom_qty(comp.qty_units, comp.qty_unit, comp.consumption_unit);
    v_effective_qty := (p_qty_units / v_yield) * v_comp_qty;

    -- deduct ingredient stock directly so balances reflect remaining ingredients
    insert into public.stock_ledger(
      location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
    ) values (
      'warehouse', p_warehouse_id, comp.item_id, 'base',
      -1 * v_effective_qty, 'recipe_consumption',
      jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', v_comp_qty, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit, 'component_kind', comp.component_kind) || coalesce(p_context, '{}')
    );

    perform public.apply_recipe_deductions(
      comp.item_id,
      v_effective_qty,
      p_warehouse_id,
      'base',
      coalesce(p_context, '{}') || jsonb_build_object('via', p_item_id, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit),
      p_depth + 1,
      array_append(p_seen, p_item_id)
    );
  end loop;

  -- 2) Raw (or non-ingredient) components last
  for comp in
    select r.ingredient_item_id as item_id,
           r.qty_per_unit as qty_units,
           r.qty_unit::text as qty_unit,
           ci.item_kind as component_kind,
           ci.consumption_unit as consumption_unit
    from public.recipes r
    join public.catalog_items ci on ci.id = r.ingredient_item_id
    where r.active
      and r.finished_item_id = p_item_id
      and r.recipe_for_kind = v_item_kind
      and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = v_variant_key
      and ci.item_kind <> 'ingredient'
  loop
    v_comp_qty := public.convert_uom_qty(comp.qty_units, comp.qty_unit, comp.consumption_unit);
    v_effective_qty := (p_qty_units / v_yield) * v_comp_qty;

    insert into public.stock_ledger(
      location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
    ) values (
      'warehouse', p_warehouse_id, comp.item_id, 'base',
      -1 * v_effective_qty, 'recipe_consumption',
      jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', v_comp_qty, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit) || coalesce(p_context, '{}')
    );
  end loop;
end;
$function$;
