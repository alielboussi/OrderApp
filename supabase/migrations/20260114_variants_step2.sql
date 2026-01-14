-- Step 2: Functions prefer variant_key with fallback; dual-write helper triggers
-- No drops yet. Safe to run after step1 is applied.

begin;

-- Convenience: normalized base key
create or replace function public.normalize_variant_key(p_variant_key text)
returns text
language sql as $$
  select coalesce(nullif($1, ''), 'base');
$$;

-- record_outlet_sale uses outlet_item_routes.variant_key and warehouse_defaults.variant_key
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
  from public.outlet_item_routes
  where outlet_id = p_outlet_id
    and item_id = p_item_id
    and normalized_variant_key = v_key
  limit 1;

  v_deduct_enabled := coalesce(v_route.deduct_enabled, v_deduct_enabled, true);

  if v_deduct_enabled = false then
    insert into public.outlet_sales(
      outlet_id, item_id, variant_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context
    ) values (
      p_outlet_id, p_item_id, p_variant_id, v_key, p_qty_units, coalesce(p_is_production, false), p_warehouse_id, p_sold_at, auth.uid(), p_context
    ) returning * into v_sale;
    return v_sale;
  end if;

  v_deduct_outlet := coalesce(v_route.target_outlet_id, p_outlet_id);
  v_deduct_wh := coalesce(
    p_warehouse_id,
    v_route.warehouse_id,
    (
      select wd.warehouse_id
      from public.warehouse_defaults wd
      where wd.item_id = p_item_id
        and wd.variant_key = v_key
      order by wd.variant_id nulls last
      limit 1
    )
  );

  if v_deduct_wh is null then
    raise exception 'no warehouse mapping for outlet %, item %, variant %', p_outlet_id, p_item_id, v_key;
  end if;

  insert into public.outlet_sales(
    outlet_id, item_id, variant_id, variant_key, qty_units, is_production, warehouse_id, sold_at, created_by, context
  ) values (
    p_outlet_id, p_item_id, p_variant_id, v_key, p_qty_units, coalesce(p_is_production, false), v_deduct_wh, p_sold_at, auth.uid(), p_context
  ) returning * into v_sale;

  insert into public.outlet_stock_balances(outlet_id, item_id, variant_id, variant_key, sent_units, consumed_units)
  values (p_outlet_id, p_item_id, p_variant_id, v_key, 0, p_qty_units)
  on conflict (outlet_id, item_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set
    consumed_units = public.outlet_stock_balances.consumed_units + excluded.consumed_units,
    variant_key = excluded.variant_key,
    updated_at = now();

  insert into public.stock_ledger(
    location_type,
    warehouse_id,
    item_id,
    variant_id,
    variant_key,
    delta_units,
    reason,
    context
  ) values (
    'warehouse',
    v_deduct_wh,
    p_item_id,
    p_variant_id,
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

-- record_order_fulfillment uses variant_key and fallback to warehouse_defaults by key
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
    select oi.id, oi.order_id, oi.product_id as item_id, oi.variation_id as variant_id, oi.variation_key as variant_key, oi.qty, oi.warehouse_id
    from public.order_items oi
    where oi.order_id = p_order_id and oi.qty > 0
  loop
    v_key := public.normalize_variant_key(coalesce(oi.variant_key, oi.variant_id::text));

    v_wh := coalesce(oi.warehouse_id, (
      select wd.warehouse_id from public.warehouse_defaults wd
      where wd.item_id = oi.item_id and wd.variant_key = v_key
      order by wd.variant_id nulls last limit 1
    ));

    if v_wh is null then
      raise exception 'no warehouse mapping for item %', oi.item_id;
    end if;

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_id, variant_key, delta_units, reason, context)
    values ('warehouse', v_wh, oi.item_id, oi.variant_id, v_key, -1 * oi.qty, 'order_fulfillment', jsonb_build_object('order_id', p_order_id, 'order_item_id', oi.id));

    insert into public.outlet_stock_balances(outlet_id, item_id, variant_id, variant_key, sent_units, consumed_units)
    values (v_order.outlet_id, oi.item_id, oi.variant_id, v_key, oi.qty, 0)
    on conflict (outlet_id, item_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set sent_units = public.outlet_stock_balances.sent_units + excluded.sent_units,
                  variant_key = excluded.variant_key,
                  updated_at = now();
  end loop;
end;
$$;

-- apply_recipe_deductions uses variant_key when present (recursive version)
drop function if exists public.apply_recipe_deductions(uuid, numeric, uuid, uuid, jsonb, integer, uuid[]);

create or replace function public.apply_recipe_deductions(
  p_item_id uuid,
  p_qty_units numeric,
  p_warehouse_id uuid,
  p_variant_id uuid default null,
  p_context jsonb default '{}'::jsonb,
  p_depth int default 0,
  p_seen uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  comp record;
  v_recipe record;
  v_yield numeric;
  v_key text := public.normalize_variant_key(coalesce(p_variant_id::text, (p_context->>'variant_key')));
begin
  if p_item_id is null or p_qty_units is null or p_qty_units <= 0 then
    raise exception 'item and qty required';
  end if;

  if p_depth > 10 or p_item_id = any(p_seen) then
    raise exception 'recipe recursion too deep or loop for %', p_item_id;
  end if;

  select ir.id, ir.finished_item_id, ir.finished_variant_id, ir.finished_variant_key, ir.yield_qty_units
  into v_recipe
  from public.item_recipes ir
  where ir.finished_item_id = p_item_id
    and public.normalize_variant_key(coalesce(ir.finished_variant_key, ir.finished_variant_id::text)) = v_key
    and ir.active
  limit 1;

  if not found then
    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_id, variant_key, delta_units, reason, context)
    values (
      'warehouse',
      p_warehouse_id,
      p_item_id,
      p_variant_id,
      v_key,
      -1 * p_qty_units,
      'recipe_consumption',
      jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units) || coalesce(p_context, '{}')
    );
    return;
  end if;

  v_yield := coalesce(nullif(v_recipe.yield_qty_units, 0), 1);

  for comp in
    (
      select iri.ingredient_item_id as item_id,
             iri.ingredient_variant_id as variant_id,
             iri.ingredient_variant_key as variant_key,
             iri.qty_units,
             iri.is_leaf as force_leaf
      from public.item_recipe_ingredients iri
      where iri.recipe_id = v_recipe.id
    )
  loop
    if comp.item_id is null or comp.qty_units is null or comp.qty_units <= 0 then
      raise exception 'recipe ingredient invalid';
    end if;

    perform public.apply_recipe_deductions(
      comp.item_id,
      (p_qty_units * comp.qty_units) / v_yield,
      p_warehouse_id,
      comp.variant_id,
      jsonb_build_object('variant_key', public.normalize_variant_key(coalesce(comp.variant_key, comp.variant_id::text))) || coalesce(p_context, '{}'),
      p_depth + 1,
      array_append(p_seen, p_item_id)
    );
  end loop;
end;
$$;

-- sync_pos_order passes variant_key to record_outlet_sale
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
    select catalog_item_id, catalog_variant_id, catalog_variant_key, warehouse_id
      into v_map
    from public.pos_item_map
    where outlet_id = v_outlet
      and pos_item_id = v_item->>'pos_item_id'
      and normalized_variant_key = public.normalize_variant_key(v_item->>'variant_key')
    limit 1;
    if not found then raise exception 'No mapping for pos_item_id % at outlet %', v_item->>'pos_item_id', v_outlet; end if;

    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'quantity required for item %', v_item->>'pos_item_id'; end if;

    perform public.record_outlet_sale(
      v_outlet,
      v_map.catalog_item_id,
      v_qty,
      v_map.catalog_variant_id,
      false,
      v_map.warehouse_id,
      (payload->>'occurred_at')::timestamptz,
      jsonb_build_object('pos_item_id', v_item->>'pos_item_id', 'source_event_id', v_source, 'order_id', v_order_id),
      v_map.catalog_variant_key
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

-- Dual-write trigger to keep variant_key in sync from variant_id for tables still receiving variant_id writes
create or replace function public.trg_variant_key_dualwrite()
returns trigger
language plpgsql
as $$
begin
  if new.variant_key is null or new.variant_key = '' then
    new.variant_key := coalesce(new.variant_id::text, 'base');
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(new.variant_id, old.variant_id) is not null and (new.variant_key is null or new.variant_key = 'base') then
    new.variant_key := coalesce(new.variant_id::text, old.variant_id::text, 'base');
  end if;
  return new;
end;
$$;

-- Attach dual-write trigger where variant_id still exists
create trigger outlet_sales_variant_key_dual before insert or update on public.outlet_sales
for each row execute function public.trg_variant_key_dualwrite();

create trigger stock_ledger_variant_key_dual before insert or update on public.stock_ledger
for each row execute function public.trg_variant_key_dualwrite();

create trigger outlet_stock_balances_variant_key_dual before insert or update on public.outlet_stock_balances
for each row execute function public.trg_variant_key_dualwrite();

create trigger warehouse_defaults_variant_key_dual before insert or update on public.warehouse_defaults
for each row execute function public.trg_variant_key_dualwrite();

create trigger warehouse_purchase_items_variant_key_dual before insert or update on public.warehouse_purchase_items
for each row execute function public.trg_variant_key_dualwrite();

create trigger warehouse_transfer_items_variant_key_dual before insert or update on public.warehouse_transfer_items
for each row execute function public.trg_variant_key_dualwrite();

create trigger item_transfer_profiles_variant_key_dual before insert or update on public.item_transfer_profiles
for each row execute function public.trg_variant_key_dualwrite();

create trigger item_warehouse_policies_variant_key_dual before insert or update on public.item_warehouse_handling_policies
for each row execute function public.trg_variant_key_dualwrite();

create trigger outlet_item_routes_variant_key_dual before insert or update on public.outlet_item_routes
for each row execute function public.trg_variant_key_dualwrite();

create trigger product_supplier_links_variant_key_dual before insert or update on public.product_supplier_links
for each row execute function public.trg_variant_key_dualwrite();

create trigger order_items_variant_key_dual before insert or update on public.order_items
for each row execute function public.trg_variant_key_dualwrite();

create trigger pos_item_map_variant_key_dual before insert or update on public.pos_item_map
for each row execute function public.trg_variant_key_dualwrite();

commit;
