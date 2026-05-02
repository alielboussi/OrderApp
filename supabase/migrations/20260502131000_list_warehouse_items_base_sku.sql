create or replace function public.list_warehouse_items(
  p_warehouse_id uuid,
  p_outlet_id uuid,
  p_search text default null::text
)
returns table(
  warehouse_id uuid,
  item_id uuid,
  item_name text,
  variant_key text,
  variant_name text,
  sku text,
  net_units numeric,
  unit_cost numeric,
  item_kind item_kind,
  image_url text,
  has_recipe boolean,
  consumption_uom text,
  purchase_pack_unit text,
  transfer_unit text,
  transfer_quantity numeric
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with storage_keys as (
    select
      ish.item_id,
      ish.normalized_variant_key
    from public.item_storage_homes ish
    where ish.storage_warehouse_id = p_warehouse_id
  ),
  items_in_warehouse as (
    select distinct item_id from storage_keys
  ),
  base_items as (
    select
      p_warehouse_id as warehouse_id,
      ci.id as item_id,
      ci.name as item_name,
      'base'::text as variant_key,
      null::text as variant_name,
      ci.sku as sku,
      0::numeric as net_units,
      coalesce(ci.cost, 0)::numeric as unit_cost,
      ci.item_kind as item_kind,
      ci.image_url,
      exists (
        select 1 from public.recipes r
        where r.active
          and r.finished_item_id = ci.id
          and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = 'base'
      ) as has_recipe,
      ci.consumption_uom as consumption_uom,
      ci.purchase_pack_unit as purchase_pack_unit,
      ci.transfer_unit as transfer_unit,
      ci.transfer_quantity as transfer_quantity
    from public.catalog_items ci
    where ci.id in (select item_id from items_in_warehouse)
  ),
  variant_items as (
    select
      p_warehouse_id as warehouse_id,
      cv.item_id,
      ci.name as item_name,
      public.normalize_variant_key(cv.id) as variant_key,
      cv.name as variant_name,
      cv.sku as sku,
      0::numeric as net_units,
      coalesce(ci.cost, 0)::numeric as unit_cost,
      cv.item_kind as item_kind,
      coalesce(cv.image_url, ci.image_url) as image_url,
      exists (
        select 1 from public.recipes r
        where r.active
          and r.finished_item_id = cv.item_id
          and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = public.normalize_variant_key(cv.id)
      ) as has_recipe,
      coalesce(cv.consumption_uom, ci.consumption_uom) as consumption_uom,
      coalesce(cv.purchase_pack_unit, ci.purchase_pack_unit) as purchase_pack_unit,
      coalesce(cv.transfer_unit, ci.transfer_unit) as transfer_unit,
      coalesce(cv.transfer_quantity, ci.transfer_quantity) as transfer_quantity
    from storage_keys sk
    join public.catalog_variants cv
      on cv.item_id = sk.item_id
      and public.normalize_variant_key(cv.id) = sk.normalized_variant_key
    join public.catalog_items ci on ci.id = cv.item_id
    where sk.normalized_variant_key <> 'base'
      and coalesce(cv.active, true)
  ),
  available_items as (
    select * from base_items
    union all
    select * from variant_items
  ),
  with_stock as (
    select
      wsi.warehouse_id,
      wsi.item_id,
      wsi.item_name,
      wsi.variant_key,
      cv.name as variant_name,
      cv.sku as sku,
      wsi.net_units,
      wsi.unit_cost,
      wsi.item_kind,
      coalesce(cv.image_url, ci.image_url, wsi.image_url) as image_url,
      wsi.has_recipe,
      coalesce(cv.consumption_uom, ci.consumption_uom) as consumption_uom,
      coalesce(cv.purchase_pack_unit, ci.purchase_pack_unit) as purchase_pack_unit,
      coalesce(cv.transfer_unit, ci.transfer_unit) as transfer_unit,
      coalesce(cv.transfer_quantity, ci.transfer_quantity) as transfer_quantity
    from public.warehouse_stock_items wsi
    join public.catalog_items ci on ci.id = wsi.item_id
    left join public.catalog_variants cv
      on cv.item_id = wsi.item_id
      and public.normalize_variant_key(cv.id) = public.normalize_variant_key(wsi.variant_key)
      and coalesce(cv.active, true)
    where wsi.warehouse_id = p_warehouse_id
  )
  select
    ai.warehouse_id,
    ai.item_id,
    ai.item_name,
    ai.variant_key,
    ai.variant_name,
    ai.sku,
    coalesce(ws.net_units, ai.net_units) as net_units,
    ai.unit_cost,
    ai.item_kind,
    ai.image_url,
    ai.has_recipe,
    ai.consumption_uom,
    ai.purchase_pack_unit,
    ai.transfer_unit,
    ai.transfer_quantity
  from available_items ai
  left join with_stock ws
    on ws.warehouse_id = ai.warehouse_id
    and ws.item_id = ai.item_id
    and public.normalize_variant_key(ws.variant_key) = public.normalize_variant_key(ai.variant_key)
  where (
    p_search is null
    or ai.item_name ilike ('%' || p_search || '%')
    or coalesce(ai.variant_name, '') ilike ('%' || p_search || '%')
    or coalesce(ai.sku, '') ilike ('%' || p_search || '%')
  )
  order by item_name asc, variant_key asc;
$function$;
