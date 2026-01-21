-- Preflight validation for POS sync payloads

create or replace function public.validate_pos_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_outlet uuid := (payload->>'outlet_id')::uuid;
  v_source text := payload->>'source_event_id';
  v_item jsonb;
  v_map record;
  v_qty numeric;
  v_errors jsonb := '[]'::jsonb;
  v_variant_key text;
  v_deduct_enabled boolean;
  v_route record;
  v_deduct_outlet uuid;
  v_default_wh uuid;
  v_deduct_wh uuid;
  v_requires_open boolean;
  v_has_open boolean;
begin
  if v_outlet is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','missing_outlet','message','outlet_id is required'));
  end if;

  if v_source is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','missing_source','message','source_event_id is required'));
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
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code','missing_mapping',
        'message','pos_item_map missing for item',
        'pos_item_id', v_item->>'pos_item_id',
        'flavour_id', v_item->>'flavour_id'
      ));
      continue;
    end if;

    v_variant_key := public.normalize_variant_key(v_map.catalog_variant_key);

    select coalesce(deduct_on_pos_sale, true) into v_deduct_enabled
    from public.outlets where id = v_outlet;

    select warehouse_id, target_outlet_id, coalesce(deduct_enabled, true) as deduct_enabled
    into v_route
    from public.outlet_item_routes
    where outlet_id = v_outlet
      and item_id = v_map.catalog_item_id
      and normalized_variant_key = v_variant_key
    limit 1;

    v_deduct_enabled := coalesce(v_route.deduct_enabled, v_deduct_enabled, true);
    if v_deduct_enabled = false then
      continue;
    end if;

    v_deduct_outlet := coalesce(v_route.target_outlet_id, v_outlet);

    select ow.warehouse_id
    into v_default_wh
    from public.outlet_warehouses ow
    join public.warehouses w on w.id = ow.warehouse_id
    where ow.outlet_id = v_deduct_outlet
      and coalesce(w.active, true)
    order by coalesce(w.name, ''), ow.warehouse_id
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
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', coalesce(jsonb_array_length(v_errors), 0) = 0,
    'errors', v_errors
  );
end;
$function$;
