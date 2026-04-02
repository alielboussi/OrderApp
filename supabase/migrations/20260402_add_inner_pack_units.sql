-- Add inner pack weight/volume fields for items and variants.

alter table public.catalog_items
  add column if not exists inner_pack_unit_mass numeric,
  add column if not exists inner_pack_unit_mass_uom text;

alter table public.catalog_variants
  add column if not exists inner_pack_unit_mass numeric,
  add column if not exists inner_pack_unit_mass_uom text;
