-- Stocktake: ensure warehouse lookup is resilient and only exposes countable items
-- - Enforce unique outlet/warehouse links for safe upserts
-- - Show ingredients for every warehouse (zero-stock included)
-- - Fallback to product variants when no ingredient recipe exists and variants carry stock

-- 1) Make outlet/warehouse links idempotent
create unique index if not exists outlet_warehouses_unique
  on public.outlet_warehouses (outlet_id, warehouse_id);

-- 2) Warehouse stock items for stocktake UI
create or replace view public.warehouse_stock_items as
with ingredients as (
  select
    w.id as warehouse_id,
    ci.id as item_id,
    ci.name as item_name,
    'base'::text as variant_key,
    coalesce(sum(sl.delta_units), 0)::numeric as net_units,
    ci.cost as unit_cost
  from public.warehouses w
  join public.catalog_items ci
    on ci.item_kind = 'ingredient'
   and ci.active
  left join public.stock_ledger sl
    on sl.warehouse_id = w.id
   and sl.location_type = 'warehouse'
   and sl.item_id = ci.id
  group by w.id, ci.id, ci.name, ci.cost
),
variant_fallback as (
  -- Include product variants only when there is stock activity and no ingredient recipe exists.
  select
    sl.warehouse_id,
    sl.item_id,
    ci.name as item_name,
    public.normalize_variant_key(sl.variant_key) as variant_key,
    sum(sl.delta_units)::numeric as net_units,
    ci.cost as unit_cost
  from public.stock_ledger sl
  join public.warehouses w on w.id = sl.warehouse_id
  join public.catalog_items ci on ci.id = sl.item_id
  where sl.location_type = 'warehouse'
    and ci.item_kind <> 'ingredient'
    and public.normalize_variant_key(sl.variant_key) <> 'base'
    and not exists (
      select 1
      from public.recipes r
      where r.active
        and r.finished_item_id = ci.id
    )
  group by sl.warehouse_id, sl.item_id, ci.name, public.normalize_variant_key(sl.variant_key), ci.cost
)
select * from ingredients
union all
select * from variant_fallback;
