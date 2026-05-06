insert into public.item_storage_homes (item_id, variant_key, storage_warehouse_id)
select
  ci.id as item_id,
  'base' as variant_key,
  ci.default_warehouse_id as storage_warehouse_id
from public.catalog_items ci
where ci.default_warehouse_id is not null
on conflict do nothing;

insert into public.item_storage_homes (item_id, variant_key, storage_warehouse_id)
select
  cv.item_id as item_id,
  public.normalize_variant_key(cv.id) as variant_key,
  cv.default_warehouse_id as storage_warehouse_id
from public.catalog_variants cv
where cv.default_warehouse_id is not null
  and public.normalize_variant_key(cv.id) <> 'base'
on conflict do nothing;
