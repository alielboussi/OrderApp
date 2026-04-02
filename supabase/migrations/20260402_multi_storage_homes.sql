-- Allow multiple storage homes per item + variant.
-- This keeps the existing structure but widens the key to include storage_warehouse_id.

alter table public.item_storage_homes
  drop constraint if exists item_storage_homes_pkey;

drop index if exists public.idx_item_storage_homes_item_variant;
drop index if exists public.item_storage_homes_pkey;

alter table public.item_storage_homes
  add constraint item_storage_homes_pkey
  primary key (item_id, normalized_variant_key, storage_warehouse_id);

create index if not exists idx_item_storage_homes_item_variant
  on public.item_storage_homes (item_id, normalized_variant_key);
