insert into public.item_storage_homes (item_id, variant_key, storage_warehouse_id)
select
  ish.item_id,
  ish.variant_key,
  w.id as storage_warehouse_id
from public.item_storage_homes ish
join public.warehouses w
  on w.parent_warehouse_id = ish.storage_warehouse_id
where coalesce(w.active, true)
on conflict do nothing;
