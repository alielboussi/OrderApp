-- Backfill outlet routing + outlet_products for Fruiticana (430mls) variants
-- Replace the values in the CONFIG CTE before running.

with config as (
  select
    'REPLACE_OUTLET_ID'::uuid as outlet_id,
    'REPLACE_WAREHOUSE_ID'::uuid as warehouse_id,
    'a029c3dc-4b03-4290-a579-c804367389a7'::uuid as item_id
),
variant_keys as (
  select * from (values
    ('c43f85a3-5782-4073-96a5-1d09936a6198'),
    ('5602aad7-41b2-4365-8ff8-c0b0ef10a2d5'),
    ('0a02770d-4be1-4ff0-8f25-bfda83011646'),
    ('e0802a1f-d148-4a4d-be86-1fd55776aa6e'),
    ('a357269e-9dd1-4632-8940-42126c4bd799'),
    ('9febe6fc-c34c-46d5-b509-d2db991b0f7c'),
    ('7f965602-2594-4c23-8af1-340a01ba0742'),
    ('04a25156-91c0-4f9d-abbb-668403c48b98')
  ) as v(variant_key)
)
insert into outlet_item_routes (outlet_id, item_id, warehouse_id, variant_key, normalized_variant_key, deduct_enabled)
select c.outlet_id, c.item_id, c.warehouse_id, v.variant_key, v.variant_key, true
from config c
cross join variant_keys v
on conflict (outlet_id, item_id, normalized_variant_key)
  do update set warehouse_id = excluded.warehouse_id, deduct_enabled = excluded.deduct_enabled;

insert into outlet_products (outlet_id, item_id, variant_key, enabled)
select c.outlet_id, c.item_id, v.variant_key, true
from config c
cross join variant_keys v
on conflict (outlet_id, item_id, variant_key)
  do update set enabled = excluded.enabled;
