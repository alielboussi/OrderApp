ALTER TABLE public.outlet_sales
ADD COLUMN IF NOT EXISTS modifier_id text;

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
      raise exception 'No mapping for pos_item_id % at outlet %', v_item->>'pos_item_id', v_outlet;
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
