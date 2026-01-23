-- Checks to confirm Fruiticana (430mls) will show in stocktake
-- Replace REPLACE_OUTLET_ID and REPLACE_WAREHOUSE_ID before running.

-- 1) Base item exists and is active
select id, name, item_kind, active, has_variations, has_recipe
from public.catalog_items
where id = 'a029c3dc-4b03-4290-a579-c804367389a7';

-- 2) Variants present on base item
select elem->>'key' as variant_key,
       elem->>'name' as variant_name
from public.catalog_items c
cross join jsonb_array_elements(c.variants) as elem
where c.id = 'a029c3dc-4b03-4290-a579-c804367389a7';

-- 3) Outlet routes (preferred)
select item_id, normalized_variant_key, warehouse_id
from public.outlet_item_routes
where item_id = 'a029c3dc-4b03-4290-a579-c804367389a7'
  and outlet_id = 'REPLACE_OUTLET_ID'
  and warehouse_id = 'REPLACE_WAREHOUSE_ID'
order by normalized_variant_key;

-- 4) Outlet products fallback
select item_id, variant_key, enabled
from public.outlet_products
where item_id = 'a029c3dc-4b03-4290-a579-c804367389a7'
  and outlet_id = 'REPLACE_OUTLET_ID'
  and enabled = true
order by variant_key;
