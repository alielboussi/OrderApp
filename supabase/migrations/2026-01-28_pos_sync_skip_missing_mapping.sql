CREATE OR REPLACE FUNCTION public.sync_pos_order(payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_outlet   uuid := (payload->>'outlet_id')::uuid;
  v_source   text := payload->>'source_event_id';
  v_order_id uuid;
  v_now      timestamptz := now();
  v_item     jsonb;
  v_map      record;
  v_qty      numeric;
  v_branch   integer := nullif(payload->>'branch_id','')::integer;
  v_sale     public.outlet_sales%rowtype;
begin
  if v_outlet is null or v_source is null then
    raise exception 'outlet_id and source_event_id are required';
  end if;

  select id into v_order_id from public.orders where source_event_id = v_source;
  if found then return; end if;

  insert into public.orders(
    outlet_id, source_event_id, pos_sale_id, status, locked, branch_id, pos_branch_id,
    order_type, bill_type, total_discount, total_discount_amount, total_gst,
    service_charges, delivery_charges, tip, pos_fee, price_type,
    customer_name, customer_phone, customer_email, payments, raw_payload, created_at, updated_at
  ) values (
    v_outlet, v_source, nullif(payload->>'sale_id',''), 'placed', false, v_branch, v_branch,
    payload->>'order_type', payload->>'bill_type',
    (payload->>'total_discount')::numeric, (payload->>'total_discount_amount')::numeric,
    (payload->>'total_gst')::numeric, (payload->>'service_charges')::numeric,
    (payload->>'delivery_charges')::numeric, (payload->>'tip')::numeric,
    (payload->>'pos_fee')::numeric, payload->>'price_type',
    payload#>>'{customer,name}', payload#>>'{customer,phone}', payload#>>'{customer,email}',
    payload->'payments', payload, v_now, v_now
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) loop
    select catalog_item_id, catalog_variant_key, warehouse_id
      into v_map
    from public.pos_item_map
    where outlet_id = v_outlet
      and pos_item_id = v_item->>'pos_item_id'
      and (pos_flavour_id is null or pos_flavour_id = nullif(v_item->>'flavour_id',''))
    order by case when pos_flavour_id is null then 1 else 0 end
    limit 1;

    if not found then
      -- Skip unmapped items without logging failures.
      continue;
    end if;

    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'quantity required for item %', v_item->>'pos_item_id';
    end if;

    select * into v_sale from public.record_outlet_sale(
      v_outlet,
      v_map.catalog_item_id,
      v_qty,
      v_map.catalog_variant_key,
      false,
      v_map.warehouse_id,
      (payload->>'occurred_at')::timestamptz,
      nullif(v_item->>'sale_price','')::numeric,
      nullif(v_item->>'vat_exc_price','')::numeric,
      coalesce(nullif(v_item->>'flavour_price','')::numeric, nullif(v_item->>'vat_exc_price','')::numeric),
      nullif(v_item->>'flavour_id',''),
      jsonb_build_object(
        'pos_item_id', v_item->>'pos_item_id',
        'source_event_id', v_source,
        'order_id', v_order_id,
        'sale_price', nullif(v_item->>'sale_price','')::numeric,
        'vat_exc_price', nullif(v_item->>'vat_exc_price','')::numeric,
        'flavour_id', nullif(v_item->>'flavour_id',''),
        'flavour_price', coalesce(nullif(v_item->>'flavour_price','')::numeric, nullif(v_item->>'vat_exc_price','')::numeric),
        'modifier_id', nullif(v_item->>'modifier_id','')
      )
    );

    if v_sale.id is not null then
      update public.outlet_sales
      set modifier_id = nullif(v_item->>'modifier_id','')
      where id = v_sale.id;
    end if;
  end loop;

  insert into public.pos_inventory_consumed(
    source_event_id, outlet_id, order_id, raw_item_id, quantity_consumed, remaining_quantity,
    occurred_at, pos_date, kdsid, typec, context, unassigned_branch_note
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
$function$;

CREATE OR REPLACE FUNCTION public.validate_pos_order(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_outlet uuid := (payload->>'outlet_id')::uuid;
  v_source text := payload->>'source_event_id';
  v_item jsonb;
  v_map record;
  v_qty numeric;
  v_errors jsonb := '[]'::jsonb;
  v_variant_key text;
  v_route record;
  v_deduct_outlet uuid;
  v_default_wh uuid;
  v_deduct_wh uuid;
  v_requires_open boolean;
  v_has_open boolean;
  v_fatal boolean := false;
  v_has_mapped boolean := false;
begin
  if v_outlet is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','missing_outlet','message','outlet_id is required'));
    v_fatal := true;
  end if;

  if v_source is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','missing_source','message','source_event_id is required'));
    v_fatal := true;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) loop
    v_qty := nullif(v_item->>'quantity','')::numeric;
    if v_qty is null or v_qty <= 0 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code','bad_quantity',
        'message','quantity must be > 0',
        'pos_item_id', v_item->>'pos_item_id',
        'flavour_id', v_item->>'flavour_id'
      ));
      v_fatal := true;
      continue;
    end if;

    select catalog_item_id, catalog_variant_key, warehouse_id
      into v_map
    from public.pos_item_map
    where outlet_id = v_outlet
      and pos_item_id = v_item->>'pos_item_id'
      and (pos_flavour_id is null or pos_flavour_id = nullif(v_item->>'flavour_id',''))
    order by case when pos_flavour_id is null then 1 else 0 end
    limit 1;

    if not found then
      continue; -- no validation errors for unmapped items
    end if;

    v_has_mapped := true;

    v_variant_key := public.normalize_variant_key(v_map.catalog_variant_key);

    select warehouse_id, target_outlet_id, coalesce(deduct_enabled, true) as deduct_enabled
    into v_route
    from public.outlet_item_routes
    where outlet_id = v_outlet
      and item_id = v_map.catalog_item_id
      and normalized_variant_key in (v_variant_key, 'base')
    order by (normalized_variant_key = v_variant_key) desc
    limit 1;

    v_deduct_outlet := coalesce(v_route.target_outlet_id, v_outlet);

    select w.id
    into v_default_wh
    from public.outlets o
    join public.warehouses w on w.outlet_id = o.id
    where o.id = v_deduct_outlet
      and coalesce(w.active, true)
    order by coalesce(w.name, ''), w.id
    limit 1;

    v_deduct_wh := coalesce(v_map.warehouse_id, v_route.warehouse_id, v_default_wh);

    if v_deduct_wh is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code','missing_warehouse',
        'message','no warehouse mapping for item/variant',
        'pos_item_id', v_item->>'pos_item_id',
        'catalog_item_id', v_map.catalog_item_id::text,
        'variant_key', v_variant_key
      ));
      v_fatal := true;
      continue;
    end if;

    select exists (
      select 1 from public.outlet_warehouses ow where ow.warehouse_id = v_deduct_wh
    ) into v_requires_open;

    if v_requires_open then
      select exists (
        select 1 from public.warehouse_stock_periods wsp
        where wsp.warehouse_id = v_deduct_wh
          and wsp.status = 'open'
      ) into v_has_open;

      if not v_has_open then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code','missing_open_stock_period',
          'message','open stock period required for warehouse',
          'warehouse_id', v_deduct_wh::text,
          'pos_item_id', v_item->>'pos_item_id'
        ));
        v_fatal := true;
      end if;
    end if;
  end loop;

  if not v_has_mapped then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code','no_mappable_items',
      'message','no items had a valid pos_item_map'
    ));
    v_fatal := true;
  end if;

  return jsonb_build_object(
    'ok', not v_fatal,
    'errors', v_errors
  );
end;
$function$;
