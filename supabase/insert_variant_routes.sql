-- Backfill non-base variants for outlet_products and outlet_item_routes
-- Uses catalog_items.variants JSON; only items already mapped to outlet (base).

-- 1) outlet_products
insert into outlet_products (outlet_id, item_id, variant_key, enabled)
select
  'a406fede-7aab-4473-8e9f-ff645267466f'::uuid as outlet_id,
  ci.id as item_id,
  coalesce(v.value->>'key', v.value->>'id') as variant_key,
  true as enabled
from catalog_items ci
join outlet_products op_base
  on op_base.item_id = ci.id
 and op_base.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'::uuid
 and lower(op_base.variant_key) = 'base'
cross join lateral jsonb_array_elements(coalesce(ci.variants, '[]'::jsonb)) as v(value)
where coalesce(v.value->>'key', v.value->>'id') is not null
  and lower(coalesce(v.value->>'key', v.value->>'id')) <> 'base'
on conflict do nothing;

-- 2) outlet_item_routes
insert into outlet_item_routes (outlet_id, warehouse_id, item_id, variant_key, normalized_variant_key, deduct_enabled)
select
  'a406fede-7aab-4473-8e9f-ff645267466f'::uuid as outlet_id,
  'c77376f7-1ede-4518-8180-b3efeecda128'::uuid as warehouse_id,
  ci.id as item_id,
  coalesce(v.value->>'key', v.value->>'id') as variant_key,
  public.normalize_variant_key(coalesce(v.value->>'key', v.value->>'id')) as normalized_variant_key,
  true as deduct_enabled
from catalog_items ci
join outlet_item_routes r_base
  on r_base.item_id = ci.id
 and r_base.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'::uuid
 and r_base.warehouse_id = 'c77376f7-1ede-4518-8180-b3efeecda128'::uuid
 and lower(r_base.variant_key) = 'base'
cross join lateral jsonb_array_elements(coalesce(ci.variants, '[]'::jsonb)) as v(value)
where coalesce(v.value->>'key', v.value->>'id') is not null
  and lower(coalesce(v.value->>'key', v.value->>'id')) <> 'base'
on conflict do nothing;
