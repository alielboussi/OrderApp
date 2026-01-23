-- Unified checks for Fruiticana stocktake visibility (Quick Corner)

-- Base item exists and is active
select id, name, item_kind, active, has_variations, has_recipe
from public.catalog_items
where id = 'a029c3dc-4b03-4290-a579-c804367389a7';

-- Variants present on base item
select elem->>'key' as variant_key,
       elem->>'name' as variant_name
from public.catalog_items c
cross join jsonb_array_elements(c.variants) as elem
where c.id = 'a029c3dc-4b03-4290-a579-c804367389a7';

-- Outlet + warehouse exist and are active
select id, name, active, default_sales_warehouse_id
from public.outlets
where id = 'a406fede-7aab-4473-8e9f-ff645267466f';

select id, name, code, active, outlet_id
from public.warehouses
where id = 'c77376f7-1ede-4518-8180-b3efeecda128';

-- Outlet routes (preferred)
select item_id, normalized_variant_key, warehouse_id
from public.outlet_item_routes
where item_id = 'a029c3dc-4b03-4290-a579-c804367389a7'
  and outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
  and warehouse_id = 'c77376f7-1ede-4518-8180-b3efeecda128'
order by normalized_variant_key;

-- Outlet products fallback
select item_id, variant_key, enabled
from public.outlet_products
where item_id = 'a029c3dc-4b03-4290-a579-c804367389a7'
  and outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
  and enabled = true
order by variant_key;
