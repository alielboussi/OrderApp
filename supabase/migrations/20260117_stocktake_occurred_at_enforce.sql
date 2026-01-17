-- Enforce occurred_at on stock_ledger using source business timestamps

create or replace function public.stock_ledger_set_occurred_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.occurred_at := coalesce(
    new.occurred_at,
    (new.context->>'sold_at')::timestamptz,
    (new.context->>'order_created_at')::timestamptz,
    (new.context->>'movement_created_at')::timestamptz,
    now()
  );
  return new;
end;
$$;

drop trigger if exists trg_stock_ledger_set_occurred_at on public.stock_ledger;
create trigger trg_stock_ledger_set_occurred_at
before insert on public.stock_ledger
for each row execute function public.stock_ledger_set_occurred_at();

-- Recreate order fulfillment to stamp occurred_at from order created_at
create or replace function public.record_order_fulfillment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
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

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)
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
        'source_qty_units', oi.qty,
        'order_created_at', v_order.created_at
      ),
      v_order.created_at
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

-- Recreate purchase receipt to stamp occurred_at from receipt created_at
create or replace function public.record_purchase_receipt(
  p_warehouse_id uuid,
  p_items jsonb,
  p_supplier_id uuid default null,
  p_reference_code text default null,
  p_note text default null,
  p_auto_whatsapp boolean default false
)
returns public.warehouse_purchase_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_receipt public.warehouse_purchase_receipts%rowtype;
  v_reference text;
  v_variant_key text;
  v_occurred_at timestamptz;
begin
  if p_warehouse_id is null then
    raise exception 'warehouse_id is required';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one purchase item is required';
  end if;

  v_reference := coalesce(nullif(p_reference_code, ''), public.next_purchase_receipt_reference());

  insert into public.warehouse_purchase_receipts(
    warehouse_id,
    supplier_id,
    reference_code,
    note,
    auto_whatsapp,
    context,
    recorded_by
  ) values (
    p_warehouse_id,
    p_supplier_id,
    v_reference,
    p_note,
    coalesce(p_auto_whatsapp, false),
    coalesce(p_items, '[]'::jsonb),
    auth.uid()
  ) returning * into v_receipt;

  v_occurred_at := coalesce(v_receipt.created_at, now());

  for rec in
    select
      (elem->>'product_id')::uuid as item_id,
      coalesce(nullif(elem->>'variant_key', ''), nullif(elem->>'variation_id', ''), 'base') as variant_key,
      (elem->>'qty')::numeric as qty_units,
      coalesce(nullif(elem->>'qty_input_mode', ''), 'units') as qty_input_mode,
      nullif(elem->>'unit_cost', '')::numeric as unit_cost
    from jsonb_array_elements(p_items) elem
  loop
    if rec.item_id is null or rec.qty_units is null or rec.qty_units <= 0 then
      raise exception 'each purchase line needs product_id and qty > 0';
    end if;

    v_variant_key := public.normalize_variant_key(rec.variant_key);

    insert into public.warehouse_purchase_items(
      receipt_id,
      item_id,
      variant_key,
      qty_units,
      qty_input_mode,
      unit_cost
    ) values (
      v_receipt.id,
      rec.item_id,
      v_variant_key,
      rec.qty_units,
      rec.qty_input_mode,
      rec.unit_cost
    );

    insert into public.stock_ledger(location_type, warehouse_id, item_id, variant_key, delta_units, reason, context, occurred_at)
    values (
      'warehouse',
      p_warehouse_id,
      rec.item_id,
      v_variant_key,
      rec.qty_units,
      'purchase_receipt',
      jsonb_build_object('receipt_id', v_receipt.id, 'reference_code', v_receipt.reference_code, 'supplier_id', p_supplier_id, 'receipt_created_at', v_occurred_at),
      v_occurred_at
    );
  end loop;

  return v_receipt;
end;
$$;

-- Recreate transfer to stamp occurred_at from transfer created_at
create or replace function public.transfer_units_between_warehouses(p_source uuid, p_destination uuid, p_items jsonb, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- Recreate outlet sale RPCs to set occurred_at = p_sold_at and stamp sold_at into context
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
set search_path = public
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
$$;

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
returns public.outlet_sales
language plpgsql
security definer
set search_path = public
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
$$;
