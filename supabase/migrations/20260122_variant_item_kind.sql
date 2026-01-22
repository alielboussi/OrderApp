-- Add item_kind to variants JSON and expose variant kind + has_recipe in warehouse_stock_items

-- Backfill missing variant item_kind from base item_kind
update public.catalog_items ci
set variants = (
  select jsonb_agg(
    case
      when coalesce(v->>'item_kind','') = '' then
        jsonb_set(v, '{item_kind}', to_jsonb(ci.item_kind::text), true)
      else v
    end
    order by ord
  )
  from jsonb_array_elements(coalesce(ci.variants, '[]'::jsonb)) with ordinality as t(v, ord)
)
where ci.variants is not null
  and jsonb_typeof(ci.variants) = 'array';

create or replace view public.warehouse_stock_items as
with base as (
  select
    w.id as warehouse_id,
    ci.id as item_id,
    ci.name as item_name,
    coalesce(public.normalize_variant_key(sl.variant_key), 'base'::text) as variant_key,
    sum(sl.delta_units) as net_units,
    ci.cost as unit_cost,
    ci.item_kind as base_item_kind,
    ci.image_url,
    ci.variants
  from public.stock_ledger sl
  join public.warehouses w on w.id = sl.warehouse_id
  join public.catalog_items ci on ci.id = sl.item_id
  where sl.location_type = 'warehouse'
  group by
    w.id,
    ci.id,
    ci.name,
    ci.cost,
    ci.item_kind,
    ci.image_url,
    public.normalize_variant_key(sl.variant_key),
    ci.variants
), enriched as (
  select
    b.*,
    (
      select v->>'item_kind'
      from jsonb_array_elements(coalesce(b.variants, '[]'::jsonb)) v
      where public.normalize_variant_key(coalesce(v->>'key', v->>'id', 'base')) = b.variant_key
      limit 1
    ) as variant_item_kind,
    exists (
      select 1
      from public.recipes r
      where r.active
        and r.finished_item_id = b.item_id
        and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = b.variant_key
    ) as has_recipe
  from base b
)
select
  warehouse_id,
  item_id,
  item_name,
  variant_key,
  net_units,
  unit_cost,
  case
    when variant_item_kind in ('finished', 'ingredient', 'raw') then variant_item_kind::public.item_kind
    else base_item_kind
  end as item_kind,
  image_url,
  has_recipe
from enriched;
