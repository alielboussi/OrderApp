create or replace function public.record_order_fulfillment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_recv_wh uuid;
  v_default_sales_wh uuid;
  v_sources uuid[];
  v_source uuid;
  v_items jsonb;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  select default_receiving_warehouse_id, default_sales_warehouse_id
    into v_recv_wh, v_default_sales_wh
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
      coalesce(
        cv.storage_home_id,
        ci.storage_home_id,
        v_default_sales_wh
      ) as source_warehouse_id
    from base_items bi
    join public.catalog_items ci on ci.id = bi.product_id
    left join public.catalog_variants cv
      on cv.item_id = bi.product_id
     and public.normalize_variant_key(cv.id::text) = bi.variant_key
  )
  select * from sources;

  if exists (select 1 from tmp_item_routes where source_warehouse_id is null) then
    raise exception 'storage_home_id missing for one or more items in order %', p_order_id;
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
