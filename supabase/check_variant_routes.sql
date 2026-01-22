-- Check outlet_products variant rows (non-base)
select outlet_id, item_id, variant_key, enabled
from outlet_products
where outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
  and lower(variant_key) <> 'base'
order by item_id, variant_key;

-- Check outlet_item_routes variant rows (non-base) for warehouse
select id, item_id, variant_key, deduct_enabled
from outlet_item_routes
where outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
  and warehouse_id = 'c77376f7-1ede-4518-8180-b3efeecda128'
  and lower(variant_key) <> 'base'
order by item_id, variant_key;

-- Optional: list catalog variants for items mapped to the outlet (non-base)
select
  ci.id as item_id,
  (v.value->>'key') as variant_key,
  coalesce(v.value->>'name', v.value->>'label', v.value->>'title') as variant_name
from catalog_items ci
join outlet_products op_base
  on op_base.item_id = ci.id
 and op_base.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
 and lower(op_base.variant_key) = 'base'
cross join lateral jsonb_array_elements(coalesce(ci.variants, '[]'::jsonb)) as v(value)
where lower(coalesce(v.value->>'key', v.value->>'id', '')) <> 'base'
order by ci.id, variant_key;
