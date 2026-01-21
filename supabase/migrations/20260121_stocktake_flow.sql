-- Stocktake flow alignment: opening -> movements -> closing -> variance
-- Ensures closing counts become next opening, and opening is required before closing.

create or replace function public.record_stock_count(
  p_period_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_variant_key text default 'base'::text,
  p_kind text default 'closing'::text,
  p_context jsonb default '{}'::jsonb
)
returns warehouse_stock_counts
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

  if lower(coalesce(p_kind, '')) = 'opening' then
    insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
    values (p_period_id, p_item_id, v_variant, p_qty, 'opening', auth.uid(), coalesce(p_context, '{}'))
    on conflict (period_id, item_id, variant_key, kind)
    do update set
      counted_qty = excluded.counted_qty,
      counted_by = excluded.counted_by,
      counted_at = now(),
      context = excluded.context
    returning * into v_row;
    return v_row;
  end if;

  select exists (
    select 1 from public.warehouse_stock_counts wsc
    where wsc.period_id = p_period_id
      and wsc.item_id = p_item_id
      and wsc.variant_key = v_variant
      and wsc.kind = 'opening'
  ) into v_has_opening;

  if not v_has_opening then
    raise exception 'opening count required before closing';
  end if;

  insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
  values (p_period_id, p_item_id, v_variant, p_qty, p_kind, auth.uid(), coalesce(p_context, '{}'))
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

create or replace function public.require_open_stock_period_for_outlet_warehouse(p_warehouse_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_warehouse_id is null then
    return;
  end if;

  if exists (
    select 1 from public.outlet_warehouses ow
    where ow.warehouse_id = p_warehouse_id
  ) then
    if not exists (
      select 1 from public.warehouse_stock_periods wsp
      where wsp.warehouse_id = p_warehouse_id
        and wsp.status = 'open'
    ) then
      raise exception 'open stock period required for warehouse %', p_warehouse_id;
    end if;
  end if;
end;
$function$;

create or replace function public.record_damage(p_warehouse_id uuid, p_items jsonb, p_note text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rec record;
  v_damage_id uuid;
  v_variant_key text;
begin
  if p_warehouse_id is null then
    raise exception 'warehouse_id is required';
  end if;

  perform public.require_open_stock_period_for_outlet_warehouse(p_warehouse_id);

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one damage line is required';
  end if;

  insert into public.warehouse_damages(warehouse_id, note, context, created_by)
  values (p_warehouse_id, p_note, coalesce(p_items, '[]'::jsonb), auth.uid())
  returning id into v_damage_id;

  for rec in
    select
      (elem->>'product_id')::uuid as item_id,
      coalesce(nullif(elem->>'variant_key', ''), nullif(elem->>'variation_id', ''), 'base') as variant_key,
      (elem->>'qty')::numeric as qty_units,
      nullif(elem->>'note', '') as line_note
    from jsonb_array_elements(p_items) elem
  loop
    if rec.item_id is null or rec.qty_units is null or rec.qty_units <= 0 then
      raise exception 'each damage line needs product_id and qty > 0';
    end if;

    v_variant_key := public.normalize_variant_key(rec.variant_key);

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context)
    values (
      'warehouse',
      p_warehouse_id,
      rec.item_id,
      v_variant_key,
      -1 * rec.qty_units,
      'damage',
      jsonb_build_object('damage_id', v_damage_id, 'note', coalesce(rec.line_note, p_note))
    );
  end loop;

  return v_damage_id;
end;
$function$;

create or replace function public.transfer_units_between_warehouses(p_source uuid, p_destination uuid, p_items jsonb, p_note text default null::text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rec record;
  v_reference text;
  v_transfer_id uuid;
  v_variant_key text;
  v_occurred_at timestamptz;
begin
  if p_source is null or p_destination is null then
    raise exception 'source and destination required';
  end if;

  perform public.require_open_stock_period_for_outlet_warehouse(p_destination);

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one transfer line is required';
  end if;

  v_reference := public.next_transfer_reference();

  insert into public.warehouse_transfers(
    reference_code,
    source_warehouse_id,
    destination_warehouse_id,
    note,
    context,
    created_by
  ) values (
    v_reference,
    p_source,
    p_destination,
    p_note,
    coalesce(p_items, '[]'::jsonb),
    auth.uid()
  ) returning id, created_at into v_transfer_id, v_occurred_at;

  v_occurred_at := coalesce(v_occurred_at, now());

  for rec in
    select
      (elem->>'product_id')::uuid as item_id,
      coalesce(nullif(elem->>'variant_key', ''), nullif(elem->>'variation_id', ''), 'base') as variant_key,
      (elem->>'qty')::numeric as qty_units
    from jsonb_array_elements(p_items) elem
  loop
    if rec.item_id is null or rec.qty_units is null or rec.qty_units <= 0 then
      raise exception 'each line needs product_id and qty > 0';
    end if;

    v_variant_key := public.normalize_variant_key(rec.variant_key);

    insert into public.warehouse_transfer_items(transfer_id, item_id, variant_key, qty_units)
    values (v_transfer_id, rec.item_id, v_variant_key, rec.qty_units);

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)
    values (
      'warehouse',
      p_source,
      rec.item_id,
      v_variant_key,
      -1 * rec.qty_units,
      'warehouse_transfer',
      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'out', 'transfer_created_at', v_occurred_at),
      v_occurred_at
    );

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)
    values (
      'warehouse',
      p_destination,
      rec.item_id,
      v_variant_key,
      rec.qty_units,
      'warehouse_transfer',
      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'in', 'transfer_created_at', v_occurred_at),
      v_occurred_at
    );
  end loop;

  return v_reference;
end;
$function$;

create or replace function public.record_outlet_sale(
  p_outlet_id uuid,
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_key text default 'base'::text,
  p_is_production boolean default false,
  p_warehouse_id uuid default null::uuid,
  p_sold_at timestamp with time zone default now(),
  p_sale_price numeric default null::numeric,
  p_vat_exc_price numeric default null::numeric,
  p_flavour_price numeric default null::numeric,
  p_flavour_id text default null::text,
  p_context jsonb default '{}'::jsonb
)
returns outlet_sales
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sale public.outlet_sales%rowtype;
  v_route record;
  v_deduct_outlet uuid;
  v_deduct_wh uuid;
  v_default_wh uuid;
  v_deduct_enabled boolean;
  v_variant_key text := public.normalize_variant_key(p_variant_key);
  v_consumption_per_base numeric := 1;
  v_consumption_unit text;
  v_base_unit text;
  v_effective_qty numeric;
begin
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
    and normalized_variant_key = v_variant_key
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

  select ow.warehouse_id
  into v_default_wh
  from public.outlet_warehouses ow
  join public.warehouses w on w.id = ow.warehouse_id
  where ow.outlet_id = v_deduct_outlet
    and coalesce(w.active, true)
  order by coalesce(w.name, ''), ow.warehouse_id
  limit 1;

  v_deduct_wh := coalesce(p_warehouse_id, v_route.warehouse_id, v_default_wh);

  if v_deduct_wh is null then
    raise exception 'no warehouse mapping for outlet %, item %, variant_key %', p_outlet_id, p_item_id, v_variant_key;
  end if;

  perform public.require_open_stock_period_for_outlet_warehouse(v_deduct_wh);

  select coalesce(ci.consumption_qty_per_base, 1), ci.consumption_unit, ci.base_unit
  into v_consumption_per_base, v_consumption_unit, v_base_unit
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

  insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)
  values (p_outlet_id, p_item_id, v_variant_key, 0, v_effective_qty)
  on conflict (outlet_id, item_id, variant_key)
  do update set consumed_units = public.outlet_stock_balances.consumed_units + excluded.consumed_units,
                updated_at = now();

  insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)
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
      'uom_used', coalesce(v_consumption_unit, v_base_unit, 'each'),
      'consumption_qty_per_base', coalesce(v_consumption_per_base, 1),
      'source_qty_units', p_qty_units,
      'sold_at', p_sold_at
    ) || coalesce(p_context, '{}'),
    p_sold_at
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
      'sale_id',v_sale.id
    ) || coalesce(p_context,'{}'),
    0,
    array[]::uuid[]
  );

  return v_sale;
end;
$function$;

create or replace function public.record_outlet_sale(
  p_outlet_id uuid,
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_key text default 'base'::text,
  p_is_production boolean default false,
  p_warehouse_id uuid default null::uuid,
  p_sold_at timestamp with time zone default now(),
  p_context jsonb default '{}'::jsonb
)
returns outlet_sales
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sale public.outlet_sales%rowtype;
  v_route record;
  v_deduct_outlet uuid;
  v_deduct_wh uuid;
  v_default_wh uuid;
  v_deduct_enabled boolean;
  v_variant_key text := public.normalize_variant_key(p_variant_key);
  v_consumption_per_base numeric := 1;
  v_consumption_unit text;
  v_base_unit text;
  v_effective_qty numeric;
begin
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
    and normalized_variant_key = v_variant_key
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

  select ow.warehouse_id
  into v_default_wh
  from public.outlet_warehouses ow
  join public.warehouses w on w.id = ow.warehouse_id
  where ow.outlet_id = v_deduct_outlet
    and coalesce(w.active, true)
  order by coalesce(w.name, ''), ow.warehouse_id
  limit 1;

  v_deduct_wh := coalesce(p_warehouse_id, v_route.warehouse_id, v_default_wh);

  if v_deduct_wh is null then
    raise exception 'no warehouse mapping for outlet %, item %, variant_key %', p_outlet_id, p_item_id, v_variant_key;
  end if;

  perform public.require_open_stock_period_for_outlet_warehouse(v_deduct_wh);

  select coalesce(ci.consumption_qty_per_base, 1), ci.consumption_unit, ci.base_unit
  into v_consumption_per_base, v_consumption_unit, v_base_unit
  from public.catalog_items ci
  where ci.id = p_item_id;

  v_effective_qty := p_qty_units * coalesce(v_consumption_per_base, 1);

  insert into public.outlet_sales(
    outlet_id, item_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context
  ) values (
    p_outlet_id, p_item_id, v_variant_key, p_qty_units, coalesce(p_is_production, false),
    v_deduct_wh, p_sold_at, auth.uid(), p_context
  ) returning * into v_sale;

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
    occurred_at
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
      'uom_used', coalesce(v_consumption_unit, v_base_unit, 'each'),
      'consumption_qty_per_base', coalesce(v_consumption_per_base, 1),
      'source_qty_units', p_qty_units,
      'sold_at', p_sold_at
    ) || coalesce(p_context, '{}'),
    p_sold_at
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
      'sale_id',v_sale.id
    ) || coalesce(p_context,'{}'),
    0,
    array[]::uuid[]
  );

  return v_sale;
end;
$function$;

create or replace view public.warehouse_stock_variances as
with opening as (
  select warehouse_stock_counts.period_id,
         warehouse_stock_counts.item_id,
         normalize_variant_key(warehouse_stock_counts.variant_key) as variant_key,
         max(warehouse_stock_counts.counted_qty) as opening_qty
  from warehouse_stock_counts
  where warehouse_stock_counts.kind = 'opening'
  group by warehouse_stock_counts.period_id, warehouse_stock_counts.item_id, normalize_variant_key(warehouse_stock_counts.variant_key)
), closing as (
  select warehouse_stock_counts.period_id,
         warehouse_stock_counts.item_id,
         normalize_variant_key(warehouse_stock_counts.variant_key) as variant_key,
         max(warehouse_stock_counts.counted_qty) as closing_qty
  from warehouse_stock_counts
  where warehouse_stock_counts.kind = 'closing'
  group by warehouse_stock_counts.period_id, warehouse_stock_counts.item_id, normalize_variant_key(warehouse_stock_counts.variant_key)
), movement as (
  select wsp_1.id as period_id,
         sl.item_id,
         normalize_variant_key(sl.variant_key) as variant_key,
         sum(sl.delta_units) as movement_qty
  from warehouse_stock_periods wsp_1
  left join stock_ledger sl on sl.warehouse_id = wsp_1.warehouse_id
    and sl.location_type = 'warehouse'
    and sl.item_id is not null
    and sl.occurred_at >= wsp_1.opened_at
    and (wsp_1.closed_at is null or sl.occurred_at <= coalesce(wsp_1.closed_at, now()))
    and sl.reason in ('warehouse_transfer', 'outlet_sale', 'damage')
  group by wsp_1.id, sl.item_id, normalize_variant_key(sl.variant_key)
), keys as (
  select opening.period_id,
         opening.item_id,
         opening.variant_key
  from opening
  union
  select closing.period_id,
         closing.item_id,
         closing.variant_key
  from closing
  union
  select movement.period_id,
         movement.item_id,
         movement.variant_key
  from movement
)
select k.period_id,
       wsp.warehouse_id,
       wsp.outlet_id,
       k.item_id,
       k.variant_key,
       coalesce(o.opening_qty, 0::numeric) as opening_qty,
       coalesce(m.movement_qty, 0::numeric) as movement_qty,
       coalesce(c.closing_qty, 0::numeric) as closing_qty,
       coalesce(o.opening_qty, 0::numeric) + coalesce(m.movement_qty, 0::numeric) as expected_qty,
       coalesce(c.closing_qty, 0::numeric) - (coalesce(o.opening_qty, 0::numeric) + coalesce(m.movement_qty, 0::numeric)) as variance_qty,
       ci.name as item_name,
       coalesce(ci.cost, 0::numeric) as unit_cost,
       (coalesce(c.closing_qty, 0::numeric) - (coalesce(o.opening_qty, 0::numeric) + coalesce(m.movement_qty, 0::numeric))) * coalesce(ci.cost, 0::numeric) as variance_cost
from keys k
join warehouse_stock_periods wsp on wsp.id = k.period_id
left join opening o on o.period_id = k.period_id and o.item_id = k.item_id and o.variant_key = k.variant_key
left join closing c on c.period_id = k.period_id and c.item_id = k.item_id and c.variant_key = k.variant_key
left join movement m on m.period_id = k.period_id and m.item_id = k.item_id and m.variant_key = k.variant_key
left join catalog_items ci on ci.id = k.item_id;

create or replace function public.close_stock_period(p_period_id uuid)
returns warehouse_stock_periods
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.warehouse_stock_periods%rowtype;
  v_snapshot jsonb;
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

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_snapshot
  from (
    select wsc.item_id, wsc.variant_key, wsc.counted_qty as closing_qty
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

  return v_row;
end;
$function$;

create or replace function public.start_stock_period(p_warehouse_id uuid, p_note text default null::text)
returns warehouse_stock_periods
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.warehouse_stock_periods%rowtype;
  v_prev public.warehouse_stock_periods%rowtype;
  v_outlet uuid;
  v_opening_snapshot jsonb := '[]'::jsonb;
begin
  if not public.is_stocktake_user(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_warehouse_id is null then
    raise exception 'warehouse required';
  end if;

  if exists (
    select 1 from public.warehouse_stock_periods wsp
    where wsp.warehouse_id = p_warehouse_id and wsp.status = 'open'
  ) then
    raise exception 'open stock period already exists for this warehouse';
  end if;

  select ow.outlet_id
  into v_outlet
  from public.outlet_warehouses ow
  join public.outlets o on o.id = ow.outlet_id
  where ow.warehouse_id = p_warehouse_id
    and coalesce(o.active, true)
  order by coalesce(o.name, ''), ow.outlet_id
  limit 1;

  if v_outlet is null then
    raise exception 'warehouse has no outlet mapping';
  end if;

  select * into v_prev
  from public.warehouse_stock_periods wsp
  where wsp.warehouse_id = p_warehouse_id
    and wsp.status = 'closed'
  order by wsp.closed_at desc nulls last, wsp.created_at desc
  limit 1;

  if v_prev.id is not null then
    v_opening_snapshot := coalesce(
      v_prev.closing_snapshot,
      (
        select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
        from (
          select wsc.item_id, wsc.variant_key, wsc.counted_qty as closing_qty
          from public.warehouse_stock_counts wsc
          where wsc.period_id = v_prev.id
            and wsc.kind = 'closing'
          order by wsc.item_id, wsc.variant_key
        ) t
      )
    );
  end if;

  insert into public.warehouse_stock_periods(
    warehouse_id, outlet_id, status, opened_by, note, opening_snapshot, stocktake_number
  )
  values (
    p_warehouse_id,
    v_outlet,
    'open',
    auth.uid(),
    p_note,
    v_opening_snapshot,
    public.next_stocktake_number()
  )
  returning * into v_row;

  if coalesce(jsonb_array_length(v_row.opening_snapshot), 0) > 0 then
    insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
    select v_row.id, s.item_id, s.variant_key, s.closing_qty, 'opening', auth.uid(), jsonb_build_object('snapshot', true, 'seeded_from', 'previous_closing')
    from jsonb_to_recordset(coalesce(v_row.opening_snapshot, '[]'::jsonb))
      as s(item_id uuid, variant_key text, closing_qty numeric);
  end if;

  return v_row;
end;
$function$;
