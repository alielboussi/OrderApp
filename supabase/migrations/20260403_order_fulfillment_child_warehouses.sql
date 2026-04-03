-- Route order approvals from storage-home children (lowest stock), allow negatives, and log alerts.

create or replace function public.record_order_fulfillment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_sales_wh uuid;
  v_recv_wh uuid;
  v_sources uuid[];
  v_source uuid;
  v_items jsonb;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  select default_sales_warehouse_id, default_receiving_warehouse_id
    into v_sales_wh, v_recv_wh
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
      oi.qty,
      oi.warehouse_id
    from public.order_items oi
    where oi.order_id = p_order_id
  ),
  route_parent as (
    select
      bi.order_item_id,
      coalesce(bi.warehouse_id, r.warehouse_id, v_sales_wh) as parent_warehouse_id
    from base_items bi
    left join lateral (
      select r2.warehouse_id
      from public.outlet_order_routes r2
      where r2.outlet_id = v_order.outlet_id
        and r2.item_id = bi.product_id
        and r2.normalized_variant_key in (bi.variant_key, 'base')
      order by (r2.normalized_variant_key = bi.variant_key) desc
      limit 1
    ) r on true
  ),
  storage_parents as (
    select
      bi.order_item_id,
      bi.product_id,
      bi.variant_key,
      bi.qty,
      ish.storage_warehouse_id as parent_warehouse_id
    from base_items bi
    join public.item_storage_homes ish
      on ish.item_id = bi.product_id
     and ish.normalized_variant_key in (bi.variant_key, 'base')
  ),
  parents as (
    select * from storage_parents
    union all
    select
      bi.order_item_id,
      bi.product_id,
      bi.variant_key,
      bi.qty,
      rp.parent_warehouse_id
    from base_items bi
    join route_parent rp on rp.order_item_id = bi.order_item_id
    where not exists (
      select 1 from storage_parents sp where sp.order_item_id = bi.order_item_id
    )
  ),
  candidate_children as (
    select
      p.order_item_id,
      p.product_id,
      p.variant_key,
      p.qty,
      p.parent_warehouse_id,
      coalesce(wc.id, p.parent_warehouse_id) as source_warehouse_id,
      coalesce(wsi.net_units, 0) as net_units
    from parents p
    left join public.warehouses wc
      on wc.parent_warehouse_id = p.parent_warehouse_id
     and coalesce(wc.active, true)
    left join public.warehouse_stock_items wsi
      on wsi.warehouse_id = coalesce(wc.id, p.parent_warehouse_id)
     and wsi.item_id = p.product_id
     and wsi.variant_key = p.variant_key
  ),
  ranked as (
    select
      *,
      row_number() over (
        partition by order_item_id
        order by (net_units > 0) desc,
                 case when net_units > 0 then net_units end asc nulls last,
                 net_units asc
      ) as rn,
      bool_or(net_units > 0) over (partition by order_item_id) as has_positive
    from candidate_children
  )
  select
    order_item_id,
    product_id,
    variant_key,
    qty,
    parent_warehouse_id,
    source_warehouse_id,
    net_units,
    has_positive
  from ranked
  where rn = 1;

  if exists (select 1 from tmp_item_routes where source_warehouse_id is null) then
    raise exception 'source warehouse not set for order %', p_order_id;
  end if;

  select array_agg(distinct source_warehouse_id) into v_sources
  from tmp_item_routes
  where source_warehouse_id is not null;

  if v_sources is null or array_length(v_sources, 1) = 0 then
    return; -- nothing to move
  end if;

  insert into public.warehouse_backoffice_logs(
    user_id,
    user_email,
    action,
    page,
    method,
    status,
    details
  )
  select
    auth.uid(),
    current_setting('request.jwt.claim.email', true),
    'order_negative_balance',
    '/Warehouse_Backoffice',
    'rpc',
    200,
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', v_order.order_number,
      'outlet_id', v_order.outlet_id,
      'product_id', product_id,
      'variant_key', variant_key,
      'warehouse_id', source_warehouse_id,
      'parent_warehouse_id', parent_warehouse_id,
      'qty', qty,
      'available', net_units,
      'warehouse_name', (select w.name from public.warehouses w where w.id = source_warehouse_id),
      'item_name', (select ci.name from public.catalog_items ci where ci.id = product_id)
    )
  from tmp_item_routes
  where has_positive = false;

  foreach v_source in array v_sources loop
    with item_routes as (
      select
        product_id,
        variant_key,
        qty
      from tmp_item_routes
      where source_warehouse_id = v_source
        and qty is not null
        and qty <> 0
    )
    select jsonb_agg(
      jsonb_build_object('product_id', ir.product_id, 'variant_key', ir.variant_key, 'qty', ir.qty)
    )
    into v_items
    from item_routes ir;

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
