-- Stocktake: include ingredient items and variants even with no stock_ledger rows

create or replace function public.list_warehouse_items(
  p_warehouse_id uuid,
  p_outlet_id uuid,
  p_search text default null::text
)
returns setof public.warehouse_stock_items
language sql
stable
security definer
set search_path to 'public'
as $function$
  with base_items as (
    select *
    from public.warehouse_stock_items b
    where b.warehouse_id = p_warehouse_id
      and exists (
        select 1
        from public.outlet_products op
        where op.outlet_id = p_outlet_id
          and op.item_id = b.item_id
          and op.variant_key = coalesce(b.variant_key, 'base')
          and op.enabled
      )
      and (
        coalesce(b.variant_key, 'base') <> 'base'
        or b.item_kind = 'ingredient'
      )
      and (
        p_search is null
        or b.item_name ilike '%' || replace(p_search, '*', '%') || '%'
        or b.item_id::text ilike '%' || replace(p_search, '*', '%') || '%'
      )
  ),
  variant_catalog as (
    select
      p_warehouse_id as warehouse_id,
      ci.id as item_id,
      ci.name as item_name,
      vv.variant_key,
      null::numeric as net_units,
      ci.cost as unit_cost,
      case
        when vv.variant_item_kind in ('finished', 'ingredient', 'raw') then vv.variant_item_kind::public.item_kind
        else ci.item_kind
      end as item_kind,
      ci.image_url,
      exists (
        select 1
        from public.recipes r
        where r.active
          and r.finished_item_id = ci.id
          and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = vv.variant_key
      ) as has_recipe
    from public.catalog_items ci
    cross join lateral (
      select
        public.normalize_variant_key(coalesce(v->>'key', v->>'id', 'base')) as variant_key,
        v->>'item_kind' as variant_item_kind
      from jsonb_array_elements(coalesce(ci.variants, '[]'::jsonb)) v
    ) vv
    where vv.variant_key <> 'base'
      and exists (
        select 1
        from public.outlet_products op
        where op.outlet_id = p_outlet_id
          and op.item_id = ci.id
          and op.variant_key = vv.variant_key
          and op.enabled
      )
      and (
        p_search is null
        or ci.name ilike '%' || replace(p_search, '*', '%') || '%'
        or ci.id::text ilike '%' || replace(p_search, '*', '%') || '%'
      )
  ),
  ingredient_base as (
    select
      p_warehouse_id as warehouse_id,
      ci.id as item_id,
      ci.name as item_name,
      'base'::text as variant_key,
      null::numeric as net_units,
      ci.cost as unit_cost,
      ci.item_kind,
      ci.image_url,
      exists (
        select 1
        from public.recipes r
        where r.active
          and r.finished_item_id = ci.id
          and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = 'base'
      ) as has_recipe
    from public.catalog_items ci
    where ci.item_kind = 'ingredient'
      and exists (
        select 1
        from public.outlet_products op
        where op.outlet_id = p_outlet_id
          and op.item_id = ci.id
          and op.variant_key = 'base'
          and op.enabled
      )
      and (
        p_search is null
        or ci.name ilike '%' || replace(p_search, '*', '%') || '%'
        or ci.id::text ilike '%' || replace(p_search, '*', '%') || '%'
      )
  )
  select * from base_items
  union
  select * from variant_catalog
  union
  select * from ingredient_base;
$function$;
