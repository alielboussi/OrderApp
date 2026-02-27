with params as (
  select
    'variant'::text as target_type, -- item or variant
    'b7a03bbc-13f9-49f6-9139-10e17c9b7427'::uuid as item_id,
    '1754d7ec-c751-4519-9ea4-21532903b70d'::text as variant_id,
    '16161101661710'::text as barcode,
    '0c9ddd9e-d42c-475f-9232-5e9d649b0916'::uuid as warehouse_id
),
update_item as (
  update catalog_items
  set supplier_sku = (select barcode from params),
      active = true,
      default_warehouse_id = (select warehouse_id from params)
  where id = (select item_id from params)
    and (select target_type from params) = 'item'
  returning id
),
upsert_home as (
  insert into item_storage_homes (item_id, variant_key, storage_warehouse_id)
  select item_id, 'base', warehouse_id
  from params
  where target_type = 'item'
    and item_id is not null
  on conflict (item_id, normalized_variant_key)
  do update set storage_warehouse_id = excluded.storage_warehouse_id, updated_at = now()
  returning item_id
),
update_variant as (
  update catalog_variants
  set supplier_sku = (select barcode from params),
      active = true,
      default_warehouse_id = (select warehouse_id from params)
  where id = (select variant_id from params)
    and (select target_type from params) = 'variant'
  returning id
)
select
  (select count(*) from update_item) as item_updates,
  (select count(*) from upsert_home) as storage_home_upserts,
  (select count(*) from update_variant) as variant_updates;
