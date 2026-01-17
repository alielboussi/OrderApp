-- Align stock deductions with consumption/storage model

create or replace function public.record_order_fulfillment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  oi record;
  v_order public.orders%rowtype;
  v_wh uuid;
  v_key text;
  v_delta numeric;
  v_storage_unit text;
  v_base_unit text;
  v_storage_weight numeric;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  for oi in
    select oi.id,
           oi.order_id,
           oi.product_id as item_id,
           oi.variation_key as variant_key,
           oi.qty,
           oi.warehouse_id
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.qty > 0
  loop
    v_key := public.normalize_variant_key(oi.variant_key);

    v_wh := coalesce(
      oi.warehouse_id,
      (
        select r.warehouse_id
        from public.outlet_item_routes r
        where r.item_id = oi.item_id
          and r.normalized_variant_key = v_key
          and (r.outlet_id = v_order.outlet_id or r.outlet_id is null)
        order by case when r.outlet_id = v_order.outlet_id then 0 else 1 end, r.updated_at desc nulls last
        limit 1
      )
    );

    if v_wh is null then
      raise exception 'no warehouse mapping for item % (order %)', oi.item_id, p_order_id;
    end if;

    select ci.storage_unit, ci.base_unit, ci.storage_weight
    into v_storage_unit, v_base_unit, v_storage_weight
    from public.catalog_items ci
    where ci.id = oi.item_id;

    v_delta := oi.qty;
    if v_storage_weight is not null and v_storage_weight > 0 then
      v_delta := oi.qty * v_storage_weight;
    end if;

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context)
    values (
      'warehouse',
      v_wh,
      oi.item_id,
      v_key,
      -1 * v_delta,
      'order_fulfillment',
      jsonb_build_object(
        'order_id', p_order_id,
        'order_item_id', oi.id,
        'uom_used', coalesce(v_storage_unit, v_base_unit, 'each'),
        'storage_weight', v_storage_weight,
        'source_qty_units', oi.qty
      )
    );

    insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)
    values (v_order.outlet_id, oi.item_id, v_key, v_delta, 0)
    on conflict (outlet_id, item_id, variant_key)
    do update set sent_units = public.outlet_stock_balances.sent_units + excluded.sent_units,
                 variant_key = excluded.variant_key,
                 updated_at = now();
  end loop;
end;
$$;

create or replace function public.record_outlet_sale(
  p_outlet_id uuid,
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_key text default 'base'::text,
  p_is_production boolean default false,
  p_warehouse_id uuid default null::uuid,
  p_sold_at timestamptz default now(),
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
as $$
declare
  v_sale public.outlet_sales%rowtype;
  v_route record;
  v_deduct_outlet uuid;
  v_deduct_wh uuid;
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
  v_deduct_wh := coalesce(p_warehouse_id, v_route.warehouse_id);

  if v_deduct_wh is null then
    raise exception 'no warehouse mapping for outlet %, item %, variant_key %', p_outlet_id, p_item_id, v_variant_key;
  end if;

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

  insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context)
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
      'source_qty_units', p_qty_units
    ) || coalesce(p_context, '{}')
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
$$;

create or replace function public.record_outlet_sale(
  p_outlet_id uuid,
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_key text default 'base'::text,
  p_is_production boolean default false,
  p_warehouse_id uuid default null::uuid,
  p_sold_at timestamptz default now(),
  p_context jsonb default '{}'::jsonb
)
returns outlet_sales
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sale public.outlet_sales%rowtype;
  v_route record;
  v_deduct_outlet uuid;
  v_deduct_wh uuid;
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
      p_outlet_id, p_item_id, v_variant_key, p_qty_units, coalesce(p_is_production, false), p_warehouse_id, p_sold_at, auth.uid(), p_context
    ) returning * into v_sale;
    return v_sale;
  end if;

  v_deduct_outlet := coalesce(v_route.target_outlet_id, p_outlet_id);
  v_deduct_wh := coalesce(p_warehouse_id, v_route.warehouse_id);

  if v_deduct_wh is null then
    raise exception 'no warehouse mapping for outlet %, item %, variant_key %', p_outlet_id, p_item_id, v_variant_key;
  end if;

  select coalesce(ci.consumption_qty_per_base, 1), ci.consumption_unit, ci.base_unit
  into v_consumption_per_base, v_consumption_unit, v_base_unit
  from public.catalog_items ci
  where ci.id = p_item_id;

  v_effective_qty := p_qty_units * coalesce(v_consumption_per_base, 1);

  insert into public.outlet_sales(
    outlet_id, item_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context
  ) values (
    p_outlet_id, p_item_id, v_variant_key, p_qty_units, coalesce(p_is_production, false), v_deduct_wh, p_sold_at, auth.uid(), p_context
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
    context
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
      'source_qty_units', p_qty_units
    ) || coalesce(p_context, '{}')
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
$$;
