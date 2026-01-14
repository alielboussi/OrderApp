-- Step 4: Merge warehouse_defaults into outlet_item_routes (global fallback)
-- Requires step3 (variant_key-only) applied.

begin;

-- Add surrogate primary key and allow global rows
alter table public.outlet_item_routes add column if not exists id uuid default gen_random_uuid();
alter table public.outlet_item_routes drop constraint if exists outlet_item_routes_pkey;
alter table public.outlet_item_routes alter column outlet_id drop not null;
update public.outlet_item_routes set id = coalesce(id, gen_random_uuid());
alter table public.outlet_item_routes add primary key (id);

-- Uniqueness: outlet-specific routes and global routes (outlet_id null)
create unique index if not exists idx_outlet_item_routes_local_unique
  on public.outlet_item_routes(outlet_id, item_id, normalized_variant_key)
  where outlet_id is not null;

create unique index if not exists idx_outlet_item_routes_global_unique
  on public.outlet_item_routes(item_id, normalized_variant_key)
  where outlet_id is null;

-- Ensure stock balance uniqueness by key
create unique index if not exists idx_outlet_stock_balances_key
  on public.outlet_stock_balances(outlet_id, item_id, variant_key);

-- Backfill warehouse_defaults as global routes (outlet_id null)
insert into public.outlet_item_routes (
  outlet_id,
  item_id,
  variant_key,
  normalized_variant_key,
  warehouse_id,
  target_outlet_id,
  deduct_enabled,
  created_at,
  updated_at
)
select
  null::uuid as outlet_id,
  wd.item_id,
  coalesce(nullif(wd.variant_key, ''), 'base') as variant_key,
  coalesce(nullif(wd.variant_key, ''), 'base') as normalized_variant_key,
  wd.warehouse_id,
  null::uuid as target_outlet_id,
  null::boolean as deduct_enabled,
  coalesce(wd.created_at, now()),
  now()
from public.warehouse_defaults wd
where not exists (
  select 1 from public.outlet_item_routes r
  where r.outlet_id is null
    and r.item_id = wd.item_id
    and r.normalized_variant_key = coalesce(nullif(wd.variant_key, ''), 'base')
);

-- Update functions to use global routes instead of warehouse_defaults
create or replace function public.record_outlet_sale(
  p_outlet_id uuid,
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_id uuid default null,
  p_is_production boolean default false,
  p_warehouse_id uuid default null,
  p_sold_at timestamptz default now(),
  p_context jsonb default '{}'::jsonb,
  p_variant_key text default null
)
returns public.outlet_sales
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
  v_key text := public.normalize_variant_key(coalesce(p_variant_key, p_variant_id::text));
begin
  if p_outlet_id is null or p_item_id is null or p_qty_units is null or p_qty_units <= 0 then
    raise exception 'outlet, item, qty required';
  end if;

  select coalesce(deduct_on_pos_sale, true) into v_deduct_enabled
  from public.outlets where id = p_outlet_id;

  select warehouse_id, target_outlet_id, coalesce(deduct_enabled, true) as deduct_enabled
  into v_route
  from public.outlet_item_routes r
  where r.item_id = p_item_id
    and r.normalized_variant_key = v_key
    and (r.outlet_id = p_outlet_id or r.outlet_id is null)
  order by case when r.outlet_id = p_outlet_id then 0 else 1 end, r.updated_at desc nulls last
  limit 1;

  v_deduct_enabled := coalesce(v_route.deduct_enabled, v_deduct_enabled, true);

  if v_deduct_enabled = false then
    insert into public.outlet_sales(
      outlet_id, item_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context
    ) values (
      p_outlet_id, p_item_id, v_key, p_qty_units, coalesce(p_is_production, false), p_warehouse_id, p_sold_at, auth.uid(), p_context
    ) returning * into v_sale;
    return v_sale;
  end if;

  v_deduct_outlet := coalesce(v_route.target_outlet_id, p_outlet_id);
  v_deduct_wh := coalesce(
    p_warehouse_id,
    v_route.warehouse_id
  );

  if v_deduct_wh is null then
    raise exception 'no warehouse mapping for outlet %, item %, variant %', p_outlet_id, p_item_id, v_key;
  end if;

  insert into public.outlet_sales(
    outlet_id, item_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context
  ) values (
    p_outlet_id, p_item_id, v_key, p_qty_units, coalesce(p_is_production, false), v_deduct_wh, p_sold_at, auth.uid(), p_context
  ) returning * into v_sale;

  insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)
  values (p_outlet_id, p_item_id, v_key, 0, p_qty_units)
  on conflict (outlet_id, item_id, variant_key)
  do update set
    consumed_units = public.outlet_stock_balances.consumed_units + excluded.consumed_units,
    variant_key = excluded.variant_key,
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
    v_key,
    -1 * p_qty_units,
    'outlet_sale',
    jsonb_build_object('sale_id', v_sale.id, 'outlet_id', p_outlet_id) || coalesce(p_context, '{}')
  );

  perform public.apply_recipe_deductions(
    p_item_id,
    p_qty_units,
    v_deduct_wh,
    p_variant_id,
    jsonb_build_object(
      'source','outlet_sale',
      'outlet_id',p_outlet_id,
      'deduct_outlet_id',v_deduct_outlet,
      'warehouse_id',v_deduct_wh,
      'sale_id',v_sale.id,
      'variant_key', v_key
    ) || coalesce(p_context,'{}'),
    0,
    array[]::uuid[]
  );

  return v_sale;
end;
$$;

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
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  for oi in
    select oi.id, oi.order_id, oi.product_id as item_id, oi.variation_key as variant_key, oi.qty, oi.warehouse_id
    from public.order_items oi
    where oi.order_id = p_order_id and oi.qty > 0
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

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context)
    values ('warehouse', v_wh, oi.item_id, v_key, -1 * oi.qty, 'order_fulfillment', jsonb_build_object('order_id', p_order_id, 'order_item_id', oi.id));

    insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)
    values (v_order.outlet_id, oi.item_id, v_key, oi.qty, 0)
    on conflict (outlet_id, item_id, variant_key)
    do update set sent_units = public.outlet_stock_balances.sent_units + excluded.sent_units,
            variant_key = excluded.variant_key,
            updated_at = now();
  end loop;
end;
$$;

-- Drop warehouse_defaults now that routes handle fallback
DROP TABLE IF EXISTS public.warehouse_defaults CASCADE;

commit;
