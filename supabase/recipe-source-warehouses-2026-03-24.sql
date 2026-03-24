-- Update recipe deductions to support multi-warehouse component sources.
-- Applies selected warehouses from item_warehouse_handling_policies (recipe_source = true).

create or replace function public.apply_recipe_deductions(
  p_item_id uuid,
  p_qty_units numeric,
  p_warehouse_id uuid,
  p_variant_key text default 'base'::text,
  p_context jsonb default '{}'::jsonb,
  p_depth integer default 0,
  p_seen uuid[] default '{}'::uuid[]
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  comp record;
  v_yield numeric := 1;
  v_has_recipe boolean := false;
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
begin
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
      select array_agg(distinct iwhp.warehouse_id)
      into v_candidate_ids
      from public.item_warehouse_handling_policies iwhp
      where iwhp.item_id = p_item_id
        and coalesce(iwhp.recipe_source, false);

      if v_candidate_ids is null or array_length(v_candidate_ids, 1) is null then
        v_candidate_ids := array[p_warehouse_id];
      end if;

      v_remaining := p_qty_units;
      v_fallback := v_candidate_ids[1];

      foreach v_candidate in array v_candidate_ids loop
        exit when v_remaining <= 0;

        select coalesce(wsi.net_units, 0)
        into v_available
        from public.warehouse_stock_items wsi
        where wsi.warehouse_id = v_candidate
          and wsi.item_id = p_item_id
          and wsi.variant_key = 'base'
        limit 1;

        v_deduct_qty := least(v_remaining, greatest(v_available, 0));
        if v_deduct_qty <= 0 then
          continue;
        end if;

        insert into public.stock_ledger(
          location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
        ) values (
          'warehouse', v_candidate, p_item_id, v_variant_key,
          -1 * v_deduct_qty, 'recipe_consumption',
          jsonb_build_object('recipe_leaf', true, 'qty_units', v_deduct_qty) || coalesce(p_context, '{}')
        );

        v_remaining := v_remaining - v_deduct_qty;
      end loop;

      if v_remaining > 0 then
        insert into public.stock_ledger(
          location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
        ) values (
          'warehouse', coalesce(v_fallback, p_warehouse_id), p_item_id, v_variant_key,
          -1 * v_remaining, 'recipe_consumption',
          jsonb_build_object('recipe_leaf', true, 'qty_units', v_remaining) || coalesce(p_context, '{}')
        );
      end if;
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

    select array_agg(distinct iwhp.warehouse_id)
    into v_candidate_ids
    from public.item_warehouse_handling_policies iwhp
    where iwhp.item_id = comp.item_id
      and coalesce(iwhp.recipe_source, false);

    if v_candidate_ids is null or array_length(v_candidate_ids, 1) is null then
      v_candidate_ids := array[p_warehouse_id];
    end if;

    v_remaining := v_effective_qty;
    v_fallback := v_candidate_ids[1];

    foreach v_candidate in array v_candidate_ids loop
      exit when v_remaining <= 0;

      select coalesce(wsi.net_units, 0)
      into v_available
      from public.warehouse_stock_items wsi
      where wsi.warehouse_id = v_candidate
        and wsi.item_id = comp.item_id
        and wsi.variant_key = 'base'
      limit 1;

      v_deduct_qty := least(v_remaining, greatest(v_available, 0));
      if v_deduct_qty <= 0 then
        continue;
      end if;

      insert into public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
      ) values (
        'warehouse', v_candidate, comp.item_id, 'base',
        -1 * v_deduct_qty, 'recipe_consumption',
        jsonb_build_object(
          'recipe_for', p_item_id,
          'qty_units', p_qty_units,
          'component_qty', v_comp_qty,
          'qty_unit', comp.qty_unit,
          'consumption_unit', comp.consumption_unit,
          'component_kind', comp.component_kind
        ) || coalesce(p_context, '{}')
      );

      perform public.apply_recipe_deductions(
        comp.item_id,
        v_deduct_qty,
        v_candidate,
        'base',
        coalesce(p_context, '{}') || jsonb_build_object('via', p_item_id, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit),
        p_depth + 1,
        array_append(p_seen, p_item_id)
      );

      v_remaining := v_remaining - v_deduct_qty;
    end loop;

    if v_remaining > 0 then
      insert into public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
      ) values (
        'warehouse', coalesce(v_fallback, p_warehouse_id), comp.item_id, 'base',
        -1 * v_remaining, 'recipe_consumption',
        jsonb_build_object(
          'recipe_for', p_item_id,
          'qty_units', p_qty_units,
          'component_qty', v_comp_qty,
          'qty_unit', comp.qty_unit,
          'consumption_unit', comp.consumption_unit,
          'component_kind', comp.component_kind
        ) || coalesce(p_context, '{}')
      );

      perform public.apply_recipe_deductions(
        comp.item_id,
        v_remaining,
        coalesce(v_fallback, p_warehouse_id),
        'base',
        coalesce(p_context, '{}') || jsonb_build_object('via', p_item_id, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit),
        p_depth + 1,
        array_append(p_seen, p_item_id)
      );
    end if;
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

    select array_agg(distinct iwhp.warehouse_id)
    into v_candidate_ids
    from public.item_warehouse_handling_policies iwhp
    where iwhp.item_id = comp.item_id
      and coalesce(iwhp.recipe_source, false);

    if v_candidate_ids is null or array_length(v_candidate_ids, 1) is null then
      v_candidate_ids := array[p_warehouse_id];
    end if;

    v_remaining := v_effective_qty;
    v_fallback := v_candidate_ids[1];

    foreach v_candidate in array v_candidate_ids loop
      exit when v_remaining <= 0;

      select coalesce(wsi.net_units, 0)
      into v_available
      from public.warehouse_stock_items wsi
      where wsi.warehouse_id = v_candidate
        and wsi.item_id = comp.item_id
        and wsi.variant_key = 'base'
      limit 1;

      v_deduct_qty := least(v_remaining, greatest(v_available, 0));
      if v_deduct_qty <= 0 then
        continue;
      end if;

      insert into public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
      ) values (
        'warehouse', v_candidate, comp.item_id, 'base',
        -1 * v_deduct_qty, 'recipe_consumption',
        jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', v_comp_qty, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit) || coalesce(p_context, '{}')
      );

      v_remaining := v_remaining - v_deduct_qty;
    end loop;

    if v_remaining > 0 then
      insert into public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
      ) values (
        'warehouse', coalesce(v_fallback, p_warehouse_id), comp.item_id, 'base',
        -1 * v_remaining, 'recipe_consumption',
        jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', v_comp_qty, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit) || coalesce(p_context, '{}')
      );
    end if;
  end loop;
end;
$function$;
