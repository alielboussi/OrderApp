-- Unify warehouse stock to a single source of truth (stock_ledger)
-- - Replace warehouse_live_items to read directly from ledger
-- - Update functions to use warehouse_live_items instead of warehouse_stock_items
-- - Auto-assign opening/closing counts
-- - Auto-zero missing closing counts on close
-- - Drop legacy warehouse_stock_items view

create or replace view public.warehouse_live_items as
with storage_keys as (
  select distinct
    ish.storage_warehouse_id as warehouse_id,
    ish.item_id,
    ish.normalized_variant_key as variant_key
  from public.item_storage_homes ish
  union all
  select
    w.id as warehouse_id,
    ish.item_id,
    ish.normalized_variant_key as variant_key
  from public.item_storage_homes ish
  join public.warehouses w on w.parent_warehouse_id = ish.storage_warehouse_id
  where coalesce(w.active, true)
),
ledger_net as (
  select
    sl.warehouse_id,
    sl.item_id,
    public.normalize_variant_key(sl.variant_key) as variant_key,
    sum(sl.delta_units) as net_units
  from public.stock_ledger sl
  where sl.location_type = 'warehouse'
  group by sl.warehouse_id, sl.item_id, public.normalize_variant_key(sl.variant_key)
),
base_items as (
  select
    sk.warehouse_id,
    ci.id as item_id,
    ci.name as item_name,
    'base'::text as variant_key,
    coalesce(ci.cost, 0)::numeric as unit_cost,
    ci.item_kind as base_item_kind,
    ci.image_url,
    null::item_kind as variant_item_kind
  from storage_keys sk
  join public.catalog_items ci on ci.id = sk.item_id
  where sk.variant_key = 'base'
),
variant_items as (
  select
    sk.warehouse_id,
    cv.item_id,
    ci.name as item_name,
    public.normalize_variant_key(cv.id) as variant_key,
    coalesce(ci.cost, 0)::numeric as unit_cost,
    ci.item_kind as base_item_kind,
    coalesce(cv.image_url, ci.image_url) as image_url,
    cv.item_kind as variant_item_kind
  from storage_keys sk
  join public.catalog_variants cv
    on cv.item_id = sk.item_id
   and public.normalize_variant_key(cv.id) = sk.variant_key
  join public.catalog_items ci on ci.id = cv.item_id
  where sk.variant_key <> 'base'
    and coalesce(cv.active, true)
),
available_items as (
  select * from base_items
  union all
  select * from variant_items
),
with_meta as (
  select
    ai.warehouse_id,
    ai.item_id,
    ai.item_name,
    ai.variant_key,
    0::numeric as net_units,
    ai.unit_cost,
    case
      when ai.variant_item_kind in ('finished', 'ingredient', 'raw') then ai.variant_item_kind
      else ai.base_item_kind
    end as item_kind,
    ai.image_url,
    exists (
      select 1
      from public.recipes r
      where r.active
        and r.finished_item_id = ai.item_id
        and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = ai.variant_key
    ) as has_recipe
  from available_items ai
),
merged as (
  select
    wm.warehouse_id,
    wm.item_id,
    wm.item_name,
    wm.variant_key,
    coalesce(ln.net_units, wm.net_units) as net_units,
    wm.unit_cost,
    wm.item_kind,
    wm.image_url,
    wm.has_recipe
  from with_meta wm
  left join ledger_net ln
    on ln.warehouse_id = wm.warehouse_id
   and ln.item_id = wm.item_id
   and public.normalize_variant_key(ln.variant_key) = public.normalize_variant_key(wm.variant_key)
),
ledger_only as (
  select
    ln.warehouse_id,
    ci.id as item_id,
    ci.name as item_name,
    ln.variant_key,
    ln.net_units,
    coalesce(ci.cost, 0)::numeric as unit_cost,
    case
      when cv.item_kind in ('finished', 'ingredient', 'raw') then cv.item_kind
      else ci.item_kind
    end as item_kind,
    coalesce(cv.image_url, ci.image_url) as image_url,
    exists (
      select 1
      from public.recipes r
      where r.active
        and r.finished_item_id = ci.id
        and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = public.normalize_variant_key(ln.variant_key)
    ) as has_recipe
  from ledger_net ln
  join public.catalog_items ci on ci.id = ln.item_id
  left join public.catalog_variants cv
    on cv.item_id = ci.id
   and public.normalize_variant_key(cv.id) = public.normalize_variant_key(ln.variant_key)
   and coalesce(cv.active, true)
  where not exists (
    select 1
    from merged m
    where m.warehouse_id = ln.warehouse_id
      and m.item_id = ln.item_id
      and public.normalize_variant_key(m.variant_key) = public.normalize_variant_key(ln.variant_key)
  )
)
select * from merged
union all
select * from ledger_only;

create or replace function public.apply_recipe_deductions(
  p_item_id uuid,
  p_qty_units numeric,
  p_warehouse_id uuid,
  p_variant_key text default 'base',
  p_context jsonb default '{}',
  p_depth integer default 0,
  p_seen uuid[] default '{}'
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
    select true, coalesce(min(r.yield_qty_units), 1)
    into v_has_recipe, v_yield
    from public.recipes r
    where r.active
      and r.finished_item_id = p_item_id
      and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = v_variant_key;

    if v_has_recipe then
      v_use_kind_filter := false;
    end if;
  end if;

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

        select coalesce(wli.net_units, 0)
        into v_available
        from public.warehouse_live_items wli
        where wli.warehouse_id = v_candidate
          and wli.item_id = p_item_id
          and public.normalize_variant_key(wli.variant_key) = 'base'
        limit 1;

        v_deduct_qty := least(v_remaining, greatest(v_available, 0));
        if v_deduct_qty <= 0 then
          continue;
        end if;

        insert into public.stock_ledger(
          location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, flow_batch_id
        ) values (
          'warehouse', v_candidate, p_item_id, v_variant_key,
          -1 * v_deduct_qty, 'recipe_consumption',
          jsonb_build_object('recipe_leaf', true, 'qty_units', v_deduct_qty) || coalesce(p_context, '{}'),
          v_flow_batch_id
        );

        v_remaining := v_remaining - v_deduct_qty;
      end loop;

      if v_remaining > 0 then
        insert into public.stock_ledger(
          location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, flow_batch_id
        ) values (
          'warehouse', coalesce(v_fallback, p_warehouse_id), p_item_id, v_variant_key,
          -1 * v_remaining, 'recipe_consumption',
          jsonb_build_object('recipe_leaf', true, 'qty_units', v_remaining) || coalesce(p_context, '{}'),
          v_flow_batch_id
        );

        insert into public.warehouse_backoffice_logs(
          user_id,
          user_email,
          action,
          page,
          method,
          status,
          details
        ) values (
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
            'warehouse_id', coalesce(v_fallback, p_warehouse_id),
            'requested_qty', p_qty_units,
            'remaining_qty', v_remaining
          )
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
           ci.consumption_unit as consumption_unit,
           ci.purchase_unit_mass as purchase_unit_mass,
           ci.purchase_unit_mass_uom as purchase_unit_mass_uom,
           r.source_warehouse_id as source_warehouse_id
    from public.recipes r
    join public.catalog_items ci on ci.id = r.ingredient_item_id
    where r.active
      and r.finished_item_id = p_item_id
      and (not v_use_kind_filter or r.recipe_for_kind = v_item_kind)
      and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = v_variant_key
      and ci.item_kind = 'ingredient'
  loop
    v_comp_qty := public.convert_uom_qty(comp.qty_units, comp.qty_unit, comp.consumption_unit);

    if comp.purchase_unit_mass is not null
      and comp.purchase_unit_mass > 0
      and comp.purchase_unit_mass_uom is not null
      and (comp.consumption_unit is null or lower(comp.consumption_unit) in ('each', 'pc', 'piece', 'pieces')) then
      v_comp_qty := public.convert_uom_qty(comp.qty_units, comp.qty_unit, comp.purchase_unit_mass_uom);
      v_comp_qty := v_comp_qty / comp.purchase_unit_mass;
    end if;

    v_effective_qty := (p_qty_units / v_yield) * v_comp_qty;

    if comp.source_warehouse_id is not null then
      v_candidate_ids := array[comp.source_warehouse_id];
    else
      select array_agg(distinct iwhp.warehouse_id)
      into v_candidate_ids
      from public.item_warehouse_handling_policies iwhp
      where iwhp.item_id = comp.item_id
        and coalesce(iwhp.recipe_source, false);

      if v_candidate_ids is null or array_length(v_candidate_ids, 1) is null then
        v_candidate_ids := array[p_warehouse_id];
      end if;
    end if;

    v_remaining := v_effective_qty;
    v_fallback := v_candidate_ids[1];

    foreach v_candidate in array v_candidate_ids loop
      exit when v_remaining <= 0;

      select coalesce(wli.net_units, 0)
      into v_available
      from public.warehouse_live_items wli
      where wli.warehouse_id = v_candidate
        and wli.item_id = comp.item_id
        and public.normalize_variant_key(wli.variant_key) = 'base'
      limit 1;

      v_deduct_qty := least(v_remaining, greatest(v_available, 0));
      if v_deduct_qty <= 0 then
        continue;
      end if;

      insert into public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, flow_batch_id
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
        ) || coalesce(p_context, '{}'),
        v_flow_batch_id
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
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, flow_batch_id
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
        ) || coalesce(p_context, '{}'),
        v_flow_batch_id
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

      insert into public.warehouse_backoffice_logs(
        user_id,
        user_email,
        action,
        page,
        method,
        status,
        details
      ) values (
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
          'warehouse_id', coalesce(v_fallback, p_warehouse_id),
          'requested_qty', v_effective_qty,
          'remaining_qty', v_remaining
        )
      );
    end if;
  end loop;

  -- 2) Raw (or non-ingredient) components last
  for comp in
    select r.ingredient_item_id as item_id,
           r.qty_per_unit as qty_units,
           r.qty_unit::text as qty_unit,
           ci.item_kind as component_kind,
           ci.consumption_unit as consumption_unit,
           ci.purchase_unit_mass as purchase_unit_mass,
           ci.purchase_unit_mass_uom as purchase_unit_mass_uom,
           r.source_warehouse_id as source_warehouse_id
    from public.recipes r
    join public.catalog_items ci on ci.id = r.ingredient_item_id
    where r.active
      and r.finished_item_id = p_item_id
      and (not v_use_kind_filter or r.recipe_for_kind = v_item_kind)
      and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = v_variant_key
      and ci.item_kind <> 'ingredient'
  loop
    v_comp_qty := public.convert_uom_qty(comp.qty_units, comp.qty_unit, comp.consumption_unit);

    if comp.purchase_unit_mass is not null
      and comp.purchase_unit_mass > 0
      and comp.purchase_unit_mass_uom is not null
      and (comp.consumption_unit is null or lower(comp.consumption_unit) in ('each', 'pc', 'piece', 'pieces')) then
      v_comp_qty := public.convert_uom_qty(comp.qty_units, comp.qty_unit, comp.purchase_unit_mass_uom);
      v_comp_qty := v_comp_qty / comp.purchase_unit_mass;
    end if;

    v_effective_qty := (p_qty_units / v_yield) * v_comp_qty;

    if comp.source_warehouse_id is not null then
      v_candidate_ids := array[comp.source_warehouse_id];
    else
      select array_agg(distinct iwhp.warehouse_id)
      into v_candidate_ids
      from public.item_warehouse_handling_policies iwhp
      where iwhp.item_id = comp.item_id
        and coalesce(iwhp.recipe_source, false);

      if v_candidate_ids is null or array_length(v_candidate_ids, 1) is null then
        v_candidate_ids := array[p_warehouse_id];
      end if;
    end if;

    v_remaining := v_effective_qty;
    v_fallback := v_candidate_ids[1];

    foreach v_candidate in array v_candidate_ids loop
      exit when v_remaining <= 0;

      select coalesce(wli.net_units, 0)
      into v_available
      from public.warehouse_live_items wli
      where wli.warehouse_id = v_candidate
        and wli.item_id = comp.item_id
        and public.normalize_variant_key(wli.variant_key) = 'base'
      limit 1;

      v_deduct_qty := least(v_remaining, greatest(v_available, 0));
      if v_deduct_qty <= 0 then
        continue;
      end if;

      insert into public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, flow_batch_id
      ) values (
        'warehouse', v_candidate, comp.item_id, 'base',
        -1 * v_deduct_qty, 'recipe_consumption',
        jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', v_comp_qty, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit) || coalesce(p_context, '{}'),
        v_flow_batch_id
      );

      v_remaining := v_remaining - v_deduct_qty;
    end loop;

    if v_remaining > 0 then
      insert into public.stock_ledger(
        location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, flow_batch_id
      ) values (
        'warehouse', coalesce(v_fallback, p_warehouse_id), comp.item_id, 'base',
        -1 * v_remaining, 'recipe_consumption',
        jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units, 'component_qty', v_comp_qty, 'qty_unit', comp.qty_unit, 'consumption_unit', comp.consumption_unit) || coalesce(p_context, '{}'),
        v_flow_batch_id
      );

      insert into public.warehouse_backoffice_logs(
        user_id,
        user_email,
        action,
        page,
        method,
        status,
        details
      ) values (
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
          'warehouse_id', coalesce(v_fallback, p_warehouse_id),
          'requested_qty', v_effective_qty,
          'remaining_qty', v_remaining
        )
      );
    end if;
  end loop;
end;
$function$;

create or replace function public.stock_ledger_flow_trace()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sale_id uuid := nullif(new.context->>'sale_id', '')::uuid;
  v_order_id uuid := nullif(new.context->>'order_id', '')::uuid;
  v_outlet_id uuid := nullif(new.context->>'outlet_id', '')::uuid;
  v_component_kind text := lower(coalesce(new.context->>'component_kind', ''));
  v_flow_batch_id uuid := coalesce(new.flow_batch_id, nullif(new.context->>'flow_batch_id', '')::uuid);
  v_level text;
  v_trace_id uuid;
  v_available numeric := null;
  v_negative boolean := false;
begin
  if new.reason not in ('outlet_sale', 'recipe_consumption') then
    return new;
  end if;

  if new.reason = 'outlet_sale' then
    v_level := 'finished';
  elsif v_component_kind = 'ingredient' then
    v_level := 'ingredient';
  else
    v_level := 'raw';
  end if;

  if new.warehouse_id is not null then
    select wli.net_units
      into v_available
    from public.warehouse_live_items wli
    where wli.warehouse_id = new.warehouse_id
      and wli.item_id = new.item_id
      and public.normalize_variant_key(wli.variant_key) = public.normalize_variant_key(coalesce(new.variant_key, 'base'))
    limit 1;
  end if;

  if v_available is not null and v_available < 0 then
    v_negative := true;
  end if;

  if v_flow_batch_id is not null then
    insert into public.flow_traces (
      sale_id,
      order_id,
      outlet_id,
      level,
      item_id,
      variant_key,
      warehouse_id,
      flow_batch_id,
      context
    ) values (
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
    on conflict on constraint ux_flow_traces_batch_level_item_wh
    do update set
      context = excluded.context
    returning id into v_trace_id;
  else
    insert into public.flow_traces (
      sale_id,
      order_id,
      outlet_id,
      level,
      item_id,
      variant_key,
      warehouse_id,
      context
    ) values (
      v_sale_id,
      v_order_id,
      v_outlet_id,
      v_level,
      new.item_id,
      public.normalize_variant_key(coalesce(new.variant_key, 'base')),
      new.warehouse_id,
      new.context
    )
    on conflict on constraint ux_flow_traces_sale_level_item_wh
    do update set
      context = excluded.context
    returning id into v_trace_id;
  end if;

  insert into public.flow_trace_steps (
    trace_id,
    occurred_at,
    delta_units,
    available_units,
    reason,
    negative,
    context,
    flow_batch_id,
    ledger_id
  ) values (
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
  on conflict (ledger_id)
  do nothing;

  return new;
end;
$function$;

create or replace function public.record_stock_count(
  p_period_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_variant_key text default 'base',
  p_kind text default null,
  p_context jsonb default '{}'
)
returns public.warehouse_stock_counts
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_period public.warehouse_stock_periods%rowtype;
  v_row public.warehouse_stock_counts%rowtype;
  v_item_kind item_kind;
  v_has_recipe boolean := false;
  v_variant text := public.normalize_variant_key(p_variant_key);
  v_has_opening boolean := false;
  v_kind text := lower(coalesce(p_kind, ''));
begin
  if not public.is_stocktake_user(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_qty is null or p_qty < 0 then
    raise exception 'qty must be >= 0';
  end if;

  select ci.item_kind,
         exists (
           select 1 from public.recipes r
           where r.active and r.finished_item_id = p_item_id
         )
  into v_item_kind, v_has_recipe
  from public.catalog_items ci
  where ci.id = p_item_id;

  if v_item_kind is null then
    raise exception 'catalog item % not found for stock count', p_item_id;
  end if;

  if v_item_kind <> 'ingredient' and v_has_recipe then
    raise exception 'stock counts are restricted to ingredient items or non-recipe items';
  end if;

  select * into v_period from public.warehouse_stock_periods where id = p_period_id;
  if not found then
    raise exception 'stock period not found';
  end if;
  if v_period.status <> 'open' then
    raise exception 'stock period is not open';
  end if;

  select exists (
    select 1 from public.warehouse_stock_counts wsc
    where wsc.period_id = p_period_id
      and wsc.item_id = p_item_id
      and public.normalize_variant_key(wsc.variant_key) = v_variant
      and wsc.kind = 'opening'
  ) into v_has_opening;

  if v_kind not in ('opening', 'closing') then
    v_kind := 'auto';
  end if;

  if v_kind = 'closing' and not v_has_opening then
    v_kind := 'opening';
  end if;

  if v_kind = 'auto' then
    v_kind := case when v_has_opening then 'closing' else 'opening' end;
  end if;

  if v_kind = 'opening' then
    insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
    values (p_period_id, p_item_id, v_variant, p_qty, 'opening', auth.uid(), coalesce(p_context, '{}'))
    on conflict (period_id, item_id, variant_key, kind)
    do update set
      counted_qty = excluded.counted_qty,
      counted_by = excluded.counted_by,
      counted_at = now(),
      context = excluded.context
    returning * into v_row;

    insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)
    select
      ow.outlet_id,
      p_item_id,
      v_variant,
      p_qty + coalesce(osb.consumed_units, 0),
      coalesce(osb.consumed_units, 0)
    from public.outlet_warehouses ow
    left join public.outlet_stock_balances osb
      on osb.outlet_id = ow.outlet_id
     and osb.item_id = p_item_id
     and osb.variant_key = v_variant
    where ow.warehouse_id = v_period.warehouse_id
      and coalesce(ow.show_in_stocktake, true)
    on conflict (outlet_id, item_id, variant_key)
    do update set
      sent_units = excluded.sent_units,
      updated_at = now();

    return v_row;
  end if;

  insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
  values (p_period_id, p_item_id, v_variant, p_qty, v_kind, auth.uid(), coalesce(p_context, '{}'))
  on conflict (period_id, item_id, variant_key, kind)
  do update set
    counted_qty = excluded.counted_qty,
    counted_by = excluded.counted_by,
    counted_at = now(),
    context = excluded.context
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.close_stock_period(p_period_id uuid)
returns public.warehouse_stock_periods
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.warehouse_stock_periods%rowtype;
  v_prev_id uuid;
  v_snapshot jsonb;
  v_has_closing boolean := false;
begin
  if not public.is_stocktake_user(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select * into v_row from public.warehouse_stock_periods where id = p_period_id for update;
  if not found then
    raise exception 'period not found or already closed';
  end if;
  if v_row.status <> 'open' then
    raise exception 'period not found or already closed';
  end if;

  select exists (
    select 1 from public.warehouse_stock_counts wsc
    where wsc.period_id = p_period_id
      and wsc.kind = 'closing'
  ) into v_has_closing;

  if not v_has_closing then
    raise exception 'closing counts required before closing period';
  end if;

  select wsp.id
  into v_prev_id
  from public.warehouse_stock_periods wsp
  where wsp.warehouse_id = v_row.warehouse_id
    and wsp.status = 'closed'
    and wsp.id <> p_period_id
  order by wsp.closed_at desc nulls last, wsp.opened_at desc nulls last
  limit 1;

  -- Ensure every warehouse item has a closing count; missing items become zero.
  with keys as (
    select distinct
      wli.item_id,
      public.normalize_variant_key(wli.variant_key) as variant_key
    from public.warehouse_live_items wli
    where wli.warehouse_id = v_row.warehouse_id
    union
    select wsc.item_id, public.normalize_variant_key(wsc.variant_key)
    from public.warehouse_stock_counts wsc
    where wsc.period_id = p_period_id
      and wsc.kind in ('opening', 'closing')
    union
    select wsc.item_id, public.normalize_variant_key(wsc.variant_key)
    from public.warehouse_stock_counts wsc
    where wsc.period_id = v_prev_id
      and wsc.kind = 'closing'
  )
  insert into public.warehouse_stock_counts(
    period_id, item_id, variant_key, counted_qty, kind, counted_by, context
  )
  select
    p_period_id,
    k.item_id,
    k.variant_key,
    0,
    'closing',
    auth.uid(),
    jsonb_build_object('auto_zero', true, 'reason', 'close_period')
  from keys k
  left join public.warehouse_stock_counts c
    on c.period_id = p_period_id
   and c.kind = 'closing'
   and c.item_id = k.item_id
   and public.normalize_variant_key(c.variant_key) = k.variant_key
  where c.id is null;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_snapshot
  from (
    select wsc.item_id,
           wsc.variant_key,
           wsc.counted_qty as closing_qty
    from public.warehouse_stock_counts wsc
    where wsc.period_id = p_period_id
      and wsc.kind = 'closing'
    order by wsc.item_id, wsc.variant_key
  ) t;

  if coalesce(jsonb_array_length(v_snapshot), 0) = 0 then
    raise exception 'closing counts required before closing period';
  end if;

  update public.warehouse_stock_periods
  set status = 'closed',
      closed_at = now(),
      closed_by = auth.uid(),
      closing_snapshot = v_snapshot
  where id = p_period_id and status = 'open'
  returning * into v_row;

  if not found then
    raise exception 'period not found or already closed';
  end if;

  perform public.start_stock_period(v_row.warehouse_id, 'Auto-open after close');

  return v_row;
end;
$function$;

drop view if exists public.warehouse_stock_items;
