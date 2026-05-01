update public.outlets
set default_receiving_warehouse_id = default_sales_warehouse_id
where default_sales_warehouse_id is not null
  and (default_receiving_warehouse_id is null
       or default_receiving_warehouse_id <> default_sales_warehouse_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outlets_default_wh_match'
      and conrelid = 'public.outlets'::regclass
  ) then
    alter table public.outlets
      add constraint outlets_default_wh_match
      check (
        default_sales_warehouse_id is null
        or default_receiving_warehouse_id is null
        or default_sales_warehouse_id = default_receiving_warehouse_id
      );
  end if;
end $$;

create or replace function public.enforce_outlet_single_warehouse()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.default_sales_warehouse_id is not null then
    new.default_receiving_warehouse_id := new.default_sales_warehouse_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_enforce_outlet_single_warehouse on public.outlets;
create trigger trg_enforce_outlet_single_warehouse
before insert or update of default_sales_warehouse_id on public.outlets
for each row execute function public.enforce_outlet_single_warehouse();

-- Orders always use the outlet default sales warehouse
create or replace function public.place_order(
  p_outlet_id uuid,
  p_items jsonb,
  p_employee_name text,
  p_signature_path text default null,
  p_pdf_path text default null
)
returns table(order_id uuid, order_number text, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz := now();
  v_order public.orders%rowtype;
  v_item jsonb;
  v_qty numeric;
  v_qty_cases numeric;
  v_receiving_contains numeric;
  v_default_sales_wh uuid;
  v_variant_key text;
  v_route_wh uuid;
begin
  if p_outlet_id is null then
    raise exception 'outlet id required';
  end if;

  if not (
    public.is_admin(v_uid)
    or p_outlet_id = any(coalesce(public.member_outlet_ids(v_uid), array[]::uuid[]))
  ) then
    raise exception 'not authorized for outlet %', p_outlet_id;
  end if;

  select default_sales_warehouse_id
    into v_default_sales_wh
  from public.outlet_default_warehouses(p_outlet_id);

  insert into public.orders(
    outlet_id,
    order_number,
    status,
    locked,
    created_by,
    tz,
    pdf_path,
    employee_signed_name,
    employee_signature_path,
    employee_signed_at,
    updated_at,
    created_at
  ) values (
    p_outlet_id,
    public.next_order_number(p_outlet_id),
    'placed',
    false,
    v_uid,
    coalesce(current_setting('TIMEZONE', true), 'UTC'),
    p_pdf_path,
    coalesce(nullif(p_employee_name, ''), p_employee_name),
    nullif(p_signature_path, ''),
    v_now,
    v_now,
    v_now
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if (v_item ->> 'product_id') is null then
      raise exception 'product_id is required for each line item';
    end if;

    v_receiving_contains := nullif(v_item ->> 'receiving_contains', '')::numeric;
    v_qty := coalesce((v_item ->> 'qty')::numeric, 0);
    v_qty_cases := coalesce((v_item ->> 'qty_cases')::numeric, null);
    if v_qty_cases is null and v_receiving_contains is not null and v_receiving_contains > 0 then
      v_qty_cases := v_qty / v_receiving_contains;
    end if;

    v_variant_key := public.normalize_variant_key(
      coalesce(nullif(v_item ->> 'variation_key', ''), nullif(v_item ->> 'variation_id', ''), 'base')
    );

    v_route_wh := v_default_sales_wh;

    insert into public.order_items(
      order_id,
      product_id,
      variation_id,
      variation_key,
      warehouse_id,
      name,
      receiving_uom,
      consumption_uom,
      cost,
      qty,
      qty_cases,
      receiving_contains,
      amount
    ) values (
      v_order.id,
      (v_item ->> 'product_id')::uuid,
      nullif(v_item ->> 'variation_id', '')::uuid,
      v_variant_key,
      v_route_wh,
      coalesce(nullif(v_item ->> 'name', ''), 'Item'),
      coalesce(nullif(v_item ->> 'receiving_uom', ''), 'each'),
      coalesce(nullif(v_item ->> 'consumption_uom', ''), 'each'),
      coalesce((v_item ->> 'cost')::numeric, 0),
      v_qty,
      v_qty_cases,
      v_receiving_contains,
      coalesce((v_item ->> 'cost')::numeric, 0) * v_qty
    );
  end loop;

  order_id := v_order.id;
  order_number := v_order.order_number;
  created_at := v_order.created_at;
  return next;
end;
$function$;

-- Fulfillment transfers from product default warehouse -> outlet default warehouse
create or replace function public.record_order_fulfillment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_recv_wh uuid;
  v_sources uuid[];
  v_source uuid;
  v_items jsonb;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  select default_receiving_warehouse_id
    into v_recv_wh
  from public.outlet_default_warehouses(v_order.outlet_id);

  if v_recv_wh is null then
    raise exception 'receiving warehouse not set for outlet %', v_order.outlet_id;
  end if;

  create temporary table tmp_item_routes on commit drop as
  with base_items as (
    select
      oi.id as order_item_id,
      oi.product_id,
      public.normalize_variant_key(coalesce(oi.variation_key, 'base')) as variant_key,
      oi.qty
    from public.order_items oi
    where oi.order_id = p_order_id
  ),
  sources as (
    select
      bi.order_item_id,
      bi.product_id,
      bi.variant_key,
      bi.qty,
      coalesce(cv.default_warehouse_id, ci.default_warehouse_id) as source_warehouse_id
    from base_items bi
    join public.catalog_items ci on ci.id = bi.product_id
    left join public.catalog_variants cv
      on cv.item_id = bi.product_id
     and cv.id::text = bi.variant_key
  )
  select * from sources;

  if exists (select 1 from tmp_item_routes where source_warehouse_id is null) then
    raise exception 'default warehouse missing for one or more items in order %', p_order_id;
  end if;

  select array_agg(distinct source_warehouse_id)
    into v_sources
  from tmp_item_routes;

  if v_sources is null or array_length(v_sources, 1) = 0 then
    return;
  end if;

  foreach v_source in array v_sources loop
    select jsonb_agg(
      jsonb_build_object('product_id', product_id, 'variant_key', variant_key, 'qty', qty)
    )
    into v_items
    from tmp_item_routes
    where source_warehouse_id = v_source
      and qty is not null
      and qty <> 0;

    if v_items is null or jsonb_array_length(v_items) = 0 then
      continue;
    end if;

    perform public.transfer_units_between_warehouses(
      v_source,
      v_recv_wh,
      v_items,
      'Auto-transfer on approval for order ' || coalesce(v_order.order_number, p_order_id::text)
    );
  end loop;
end;
$function$;

-- Outlet sales always deduct from the outlet default sales warehouse
create or replace function public.record_outlet_sale(
  p_outlet_id uuid,
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_key text default 'base',
  p_is_production boolean default false,
  p_warehouse_id uuid default null,
  p_sold_at timestamptz default now(),
  p_sale_price numeric default null,
  p_vat_exc_price numeric default null,
  p_flavour_price numeric default null,
  p_flavour_id text default null,
  p_context jsonb default '{}'::jsonb
)
returns outlet_sales
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  v_sale public.outlet_sales%rowtype;
  v_deduct_wh uuid;
  v_deduct_enabled boolean;
  v_variant_key text := public.normalize_variant_key(p_variant_key);
  v_consumption_per_base numeric := 1;
  v_consumption_unit text;
  v_effective_qty numeric;
  v_flow_batch_id uuid;
begin
  if p_outlet_id is null or p_item_id is null or p_qty_units is null or p_qty_units <= 0 then
    raise exception 'outlet, item, qty required';
  end if;

  select coalesce(deduct_on_pos_sale, true)
    into v_deduct_enabled
  from public.outlets where id = p_outlet_id;

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

  select default_sales_warehouse_id
    into v_deduct_wh
  from public.outlet_default_warehouses(p_outlet_id);

  if v_deduct_wh is null then
    raise exception 'default sales warehouse missing for outlet %', p_outlet_id;
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
      'deduct_outlet_id',p_outlet_id,
      'warehouse_id',v_deduct_wh,
      'sale_id',v_sale.id,
      'flow_batch_id', v_flow_batch_id
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
  p_variant_key text default 'base',
  p_is_production boolean default false,
  p_warehouse_id uuid default null,
  p_sold_at timestamptz default now(),
  p_context jsonb default '{}'::jsonb
)
returns outlet_sales
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
declare
  v_sale public.outlet_sales%rowtype;
  v_deduct_wh uuid;
  v_deduct_enabled boolean;
  v_variant_key text := public.normalize_variant_key(p_variant_key);
  v_consumption_per_base numeric := 1;
  v_consumption_unit text;
  v_effective_qty numeric;
  v_flow_batch_id uuid;
begin
  if p_outlet_id is null or p_item_id is null or p_qty_units is null or p_qty_units <= 0 then
    raise exception 'outlet, item, qty required';
  end if;

  select coalesce(deduct_on_pos_sale, true)
    into v_deduct_enabled
  from public.outlets where id = p_outlet_id;

  if v_deduct_enabled = false then
    insert into public.outlet_sales(
      outlet_id, item_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context
    ) values (
      p_outlet_id, p_item_id, v_variant_key, p_qty_units, coalesce(p_is_production, false),
      p_warehouse_id, p_sold_at, auth.uid(), p_context
    ) returning * into v_sale;
    return v_sale;
  end if;

  select default_sales_warehouse_id
    into v_deduct_wh
  from public.outlet_default_warehouses(p_outlet_id);

  if v_deduct_wh is null then
    raise exception 'default sales warehouse missing for outlet %', p_outlet_id;
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
  do update set consumed_units = public.outlet_stock_balances.consumed_units + excluded.consumed_units,
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
      'deduct_outlet_id',p_outlet_id,
      'warehouse_id',v_deduct_wh,
      'sale_id',v_sale.id,
      'flow_batch_id', v_flow_batch_id
    ) || coalesce(p_context,'{}'),
    0,
    array[]::uuid[]
  );

  return v_sale;
end;
$function$;
