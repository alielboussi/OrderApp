-- Ensure recipe deduction order: item variant first (handled in record_outlet_sale), then ingredients, then raws

create or replace function public.apply_recipe_deductions(
  p_item_id uuid,
  p_qty_units numeric,
  p_warehouse_id uuid,
  p_variant_key text default 'base'::text,
  p_context jsonb default '{}'::jsonb,
  p_depth integer default 0,
  p_seen uuid[] default '{}'::uuid[]
)
returns void
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
    return;
  end if;

  -- 1) Ingredients first (recursively resolves to raw when ingredient has its own recipe)
  for comp in
    select r.ingredient_item_id as item_id,
           r.qty_per_unit as qty_units,
           ci.item_kind as component_kind
    from public.recipes r
    join public.catalog_items ci on ci.id = r.ingredient_item_id
    where r.active
      and r.finished_item_id = p_item_id
      and r.recipe_for_kind = v_item_kind
      and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = v_variant_key
      and ci.item_kind = 'ingredient'
  loop
    v_effective_qty := (p_qty_units / v_yield) * comp.qty_units;

    perform public.apply_recipe_deductions(
      comp.item_id,
      v_effective_qty,
      p_warehouse_id,
      'base',
      coalesce(p_context, '{}') || jsonb_build_object('via', p_item_id),
      p_depth + 1,
      array_append(p_seen, p_item_id)
    );
  end loop;

  -- 2) Raw (or non-ingredient) components last
  for comp in
    select r.ingredient_item_id as item_id,
           r.qty_per_unit as qty_units,
           ci.item_kind as component_kind
    from public.recipes r
    join public.catalog_items ci on ci.id = r.ingredient_item_id
    where r.active
      and r.finished_item_id = p_item_id
      and r.recipe_for_kind = v_item_kind
      and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = v_variant_key
      and ci.item_kind <> 'ingredient'
  loop
    v_effective_qty := (p_qty_units / v_yield) * comp.qty_units;

    insert into public.stock_ledger(
      location_type, warehouse_id, item_id, variant_key, delta_units, reason, context
    ) values (
      'warehouse', p_warehouse_id, comp.item_id, 'base',
      -1 * v_effective_qty, 'recipe_consumption',
      jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', comp.qty_units) || coalesce(p_context, '{}')
    );
  end loop;
end;
$function$;
