-- Consolidation migration: routes, counters, pos meta, damage lines
-- Run inside a transaction so either all changes apply or none.
begin;

-- 1) Unified counters table
create table if not exists public.counter_values (
  counter_key text not null,
  scope_id uuid not null default '00000000-0000-0000-0000-000000000000',
  last_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (counter_key, scope_id)
);

-- Migrate existing counters into the unified table
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'outlet_order_counters') then
    insert into public.counter_values(counter_key, scope_id, last_value, updated_at)
    select 'order_number', outlet_id, last_value, updated_at from public.outlet_order_counters
    on conflict (counter_key, scope_id)
    do update set last_value = greatest(public.counter_values.last_value, excluded.last_value),
                  updated_at = excluded.updated_at;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'warehouse_purchase_receipt_counters') then
    insert into public.counter_values(counter_key, scope_id, last_value, updated_at)
    select 'purchase_receipt', '00000000-0000-0000-0000-000000000000', last_value, updated_at
    from public.warehouse_purchase_receipt_counters
    on conflict (counter_key, scope_id)
    do update set last_value = greatest(public.counter_values.last_value, excluded.last_value),
                  updated_at = excluded.updated_at;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'warehouse_transfer_counters') then
    insert into public.counter_values(counter_key, scope_id, last_value, updated_at)
    select 'transfer', '00000000-0000-0000-0000-000000000000', last_value, updated_at
    from public.warehouse_transfer_counters
    on conflict (counter_key, scope_id)
    do update set last_value = greatest(public.counter_values.last_value, excluded.last_value),
                  updated_at = excluded.updated_at;
  end if;
end;
$$;

-- 2) Unified outlet item routes table
create table if not exists public.outlet_item_routes (
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  item_id uuid not null references public.catalog_items(id) on delete cascade,
  variant_key text not null default 'base',
  normalized_variant_key text not null default 'base',
  warehouse_id uuid references public.warehouses(id) on delete cascade,
  target_outlet_id uuid references public.outlets(id) on delete cascade,
  deduct_enabled boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (outlet_id, item_id, normalized_variant_key)
);

-- Seed routes from existing mappings + deduction overrides
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='outlet_item_warehouse_map') then
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='outlet_deduction_mappings') then
      insert into public.outlet_item_routes(
        outlet_id, item_id, variant_key, normalized_variant_key,
        warehouse_id, target_outlet_id, deduct_enabled, created_at, updated_at
      )
      select
        m.outlet_id,
        m.item_id,
        coalesce(m.variant_id::text, 'base'),
        coalesce(m.variant_id::text, 'base'),
        coalesce(d.target_warehouse_id, m.warehouse_id),
        coalesce(m.target_outlet_id, d.target_outlet_id),
        null,
        greatest(m.created_at, coalesce(d.created_at, m.created_at)),
        greatest(m.updated_at, coalesce(d.updated_at, m.updated_at))
      from public.outlet_item_warehouse_map m
      left join public.outlet_deduction_mappings d on d.outlet_id = m.outlet_id
      on conflict (outlet_id, item_id, normalized_variant_key) do nothing;
    else
      insert into public.outlet_item_routes(
        outlet_id, item_id, variant_key, normalized_variant_key,
        warehouse_id, target_outlet_id, deduct_enabled, created_at, updated_at
      )
      select
        m.outlet_id,
        m.item_id,
        coalesce(m.variant_id::text, 'base'),
        coalesce(m.variant_id::text, 'base'),
        m.warehouse_id,
        m.target_outlet_id,
        null,
        m.created_at,
        m.updated_at
      from public.outlet_item_warehouse_map m
      on conflict (outlet_id, item_id, normalized_variant_key) do nothing;
    end if;
  end if;
end;
$$;

-- 3) Move POS meta columns onto orders
alter table public.orders
  add column if not exists order_type text,
  add column if not exists bill_type text,
  add column if not exists total_discount numeric,
  add column if not exists total_discount_amount numeric,
  add column if not exists total_gst numeric,
  add column if not exists service_charges numeric,
  add column if not exists delivery_charges numeric,
  add column if not exists tip numeric,
  add column if not exists pos_fee numeric,
  add column if not exists price_type text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists raw_payload jsonb default '{}'::jsonb,
  add column if not exists payments jsonb,
  add column if not exists pos_branch_id integer;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'pos_order_meta') then
    update public.orders o
    set
      order_type = coalesce(o.order_type, m.order_type),
      bill_type = coalesce(o.bill_type, m.bill_type),
      total_discount = coalesce(o.total_discount, m.total_discount),
      total_discount_amount = coalesce(o.total_discount_amount, m.total_discount_amount),
      total_gst = coalesce(o.total_gst, m.total_gst),
      service_charges = coalesce(o.service_charges, m.service_charges),
      delivery_charges = coalesce(o.delivery_charges, m.delivery_charges),
      tip = coalesce(o.tip, m.tip),
      pos_fee = coalesce(o.pos_fee, m.pos_fee),
      price_type = coalesce(o.price_type, m.price_type),
      customer_name = coalesce(o.customer_name, m.customer_name),
      customer_phone = coalesce(o.customer_phone, m.customer_phone),
      payments = coalesce(o.payments, m.payments),
      raw_payload = coalesce(nullif(o.raw_payload, '{}'::jsonb), m.raw_payload),
      pos_branch_id = coalesce(o.pos_branch_id, m.branch_id)
    from public.pos_order_meta m
    where m.order_id = o.id;
  end if;
end;
$$;

-- 4) Simplify damage storage (keep context JSON, drop line table later)
-- No schema change needed for warehouse_damages; keep context as the lines.

-- 5) Replace functions to use merged tables

create or replace function public.next_order_number(p_outlet_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prefix text;
  v_next bigint;
  v_scope uuid := coalesce(p_outlet_id, '00000000-0000-0000-0000-000000000000');
begin
  if p_outlet_id is null then
    raise exception 'outlet id required for numbering';
  end if;

  insert into public.counter_values(counter_key, scope_id, last_value)
  values ('order_number', v_scope, 1)
  on conflict (counter_key, scope_id)
  do update set last_value = public.counter_values.last_value + 1,
                updated_at = now()
  returning last_value into v_next;

  select coalesce(nullif(o.code, ''), substr(o.id::text, 1, 4)) into v_prefix
  from public.outlets o
  where o.id = p_outlet_id;

  v_prefix := coalesce(v_prefix, 'OUT');
  v_prefix := upper(regexp_replace(v_prefix, '[^A-Za-z0-9]', '', 'g'));
  return v_prefix || '-' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.next_purchase_receipt_reference()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_next bigint;
  v_scope uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into public.counter_values(counter_key, scope_id, last_value)
  values ('purchase_receipt', v_scope, 1)
  on conflict (counter_key, scope_id)
  do update set last_value = public.counter_values.last_value + 1,
                updated_at = now()
  returning last_value into v_next;

  return 'PR-' || lpad(v_next::text, 6, '0');
end;
$$;

create or replace function public.next_transfer_reference()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_next bigint;
  v_scope uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into public.counter_values(counter_key, scope_id, last_value)
  values ('transfer', v_scope, 1)
  on conflict (counter_key, scope_id)
  do update set last_value = public.counter_values.last_value + 1,
                updated_at = now()
  returning last_value into v_next;

  return 'WT-' || lpad(v_next::text, 6, '0');
end;
$$;

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
  v_variant_key text := coalesce(nullif(p_variant_key, ''), 'base');
begin
  if p_outlet_id is null or p_item_id is null or p_qty_units is null or p_qty_units <= 0 then
    raise exception 'outlet, item, qty required';
  end if;

  select coalesce(deduct_on_pos_sale, true) into v_deduct_enabled
  from public.outlets where id = p_outlet_id;

  -- Fetch the per-item routing override
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
  v_deduct_wh := coalesce(
    p_warehouse_id,
    v_route.warehouse_id
  );

  if v_deduct_wh is null then
    raise exception 'no warehouse mapping for outlet %, item %, variant_key %', p_outlet_id, p_item_id, v_variant_key;
  end if;

  insert into public.outlet_sales(
    outlet_id, item_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context
  ) values (
    p_outlet_id, p_item_id, v_variant_key, p_qty_units, coalesce(p_is_production, false), v_deduct_wh, p_sold_at, auth.uid(), p_context
  ) returning * into v_sale;

  insert into public.outlet_stock_balances(outlet_id, item_id, variant_id, sent_units, consumed_units)
  values (p_outlet_id, p_item_id, v_variant_key, 0, p_qty_units)
  on conflict (outlet_id, item_id, coalesce(variant_id, 'base'))
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
    -1 * p_qty_units,
    'outlet_sale',
    jsonb_build_object('sale_id', v_sale.id, 'outlet_id', p_outlet_id) || coalesce(p_context, '{}')
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

create or replace function public.record_damage(
  p_warehouse_id uuid,
  p_items jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  rec record;
  v_damage_id uuid;
  v_variant_key text;
begin
  if p_warehouse_id is null then
    raise exception 'warehouse_id is required';
  end if;

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

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_id, delta_units, reason, context)
    values (
      'warehouse',
      p_warehouse_id,
      rec.item_id,
      rec.variant_key,
      -1 * rec.qty_units,
      'damage',
      jsonb_build_object('damage_id', v_damage_id, 'note', coalesce(rec.line_note, p_note))
    );
  end loop;

  return v_damage_id;
end;
$$;

create or replace function public.sync_pos_order(payload jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_outlet   uuid := (payload->>'outlet_id')::uuid;
  v_source   text := payload->>'source_event_id';
  v_order_id uuid;
  v_now      timestamptz := now();
  v_item     jsonb;
  v_map      record;
  v_qty      numeric;
  v_branch   integer := nullif(payload->>'branch_id','')::integer;
begin
  if v_outlet is null or v_source is null then
    raise exception 'outlet_id and source_event_id are required';
  end if;

  select id into v_order_id from public.orders where source_event_id = v_source;
  if found then return; end if;

  insert into public.orders(
    outlet_id,
    source_event_id,
    status,
    locked,
    branch_id,
    pos_branch_id,
    order_type,
    bill_type,
    total_discount,
    total_discount_amount,
    total_gst,
    service_charges,
    delivery_charges,
    tip,
    pos_fee,
    price_type,
    customer_name,
    customer_phone,
    payments,
    raw_payload,
    created_at,
    updated_at
  ) values (
    v_outlet,
    v_source,
    'placed',
    false,
    v_branch,
    v_branch,
    payload->>'order_type',
    payload->>'bill_type',
    (payload->>'total_discount')::numeric,
    (payload->>'total_discount_amount')::numeric,
    (payload->>'total_gst')::numeric,
    (payload->>'service_charges')::numeric,
    (payload->>'delivery_charges')::numeric,
    (payload->>'tip')::numeric,
    (payload->>'pos_fee')::numeric,
    payload->>'price_type',
    payload#>>'{customer,name}',
    payload#>>'{customer,phone}',
    payload->'payments',
    payload,
    v_now,
    v_now
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) loop
    select catalog_item_id, catalog_variant_key, warehouse_id
      into v_map
    from public.pos_item_map
    where outlet_id = v_outlet
      and pos_item_id = v_item->>'pos_item_id';
    if not found then raise exception 'No mapping for pos_item_id % at outlet %', v_item->>'pos_item_id', v_outlet; end if;

    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'quantity required for item %', v_item->>'pos_item_id'; end if;

    perform public.record_outlet_sale(
      v_outlet,
      v_map.catalog_item_id,
      v_qty,
      v_map.catalog_variant_key,
      false,
      v_map.warehouse_id,
      (payload->>'occurred_at')::timestamptz,
      jsonb_build_object('pos_item_id', v_item->>'pos_item_id', 'source_event_id', v_source, 'order_id', v_order_id)
    );
  end loop;

  insert into public.pos_inventory_consumed(
    source_event_id,
    outlet_id,
    order_id,
    raw_item_id,
    quantity_consumed,
    remaining_quantity,
    occurred_at,
    pos_date,
    kdsid,
    typec,
    context,
    unassigned_branch_note
  )
  select
    v_source || '-ic-' || coalesce(nullif(ic->>'pos_id',''), md5(ic::text)),
    v_outlet,
    v_order_id,
    ic->>'raw_item_id',
    (ic->>'quantity_consumed')::numeric,
    nullif(ic->>'remaining_quantity','')::numeric,
    coalesce((ic->>'occurred_at')::timestamptz, (ic->>'pos_date')::timestamptz, v_now),
    coalesce((ic->>'pos_date')::date, v_now::date),
    ic->>'kdsid',
    ic->>'typec',
    ic,
    case
      when ic ? 'branch_missing_note' then ic->>'branch_missing_note'
      when coalesce(nullif(ic->>'branch_id',''),'') = '' then 'Branch missing on POS inventory row'
      else null
    end
  from jsonb_array_elements(coalesce(payload->'inventory_consumed','[]'::jsonb)) ic
  on conflict (source_event_id) do nothing;

end;
$$;

-- 6) Drop legacy tables after backfill
-- (order of drops chosen to respect dependencies)
drop table if exists public.pos_order_meta;
drop table if exists public.outlet_item_warehouse_map;
drop table if exists public.outlet_deduction_mappings;
drop table if exists public.outlet_order_counters;
drop table if exists public.warehouse_purchase_receipt_counters;
drop table if exists public.warehouse_transfer_counters;
drop table if exists public.warehouse_damage_items;

commit;
