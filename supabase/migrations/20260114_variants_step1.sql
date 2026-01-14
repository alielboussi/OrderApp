-- Step 1: Introduce variant_key columns and item-level variants JSON (no drops yet)
-- Safe to run multiple times; uses IF NOT EXISTS where possible.

begin;

-- 1) Add variants JSON on catalog_items and backfill from catalog_variants
alter table public.catalog_items
  add column if not exists variants jsonb default '[]'::jsonb;

update public.catalog_items ci
set variants = coalesce(
  (
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', v.id,
      'key', v.id::text,
      'name', v.name,
      'sku', v.sku,
      'cost', v.cost,
      'outlet_order_visible', v.outlet_order_visible,
      'default_warehouse_id', v.default_warehouse_id,
      'transfer_unit', v.transfer_unit,
      'transfer_quantity', v.transfer_quantity,
      'purchase_pack_unit', v.purchase_pack_unit,
      'units_per_purchase_pack', v.units_per_purchase_pack,
      'purchase_unit_mass', v.purchase_unit_mass,
      'purchase_unit_mass_uom', v.purchase_unit_mass_uom,
      'locked_from_warehouse_id', v.locked_from_warehouse_id
    )))
    from public.catalog_variants v
    where v.item_id = ci.id and v.active
  ),
  '[]'::jsonb
)
where ci.variants = '[]'::jsonb;

-- Helper expression for backfill
-- base if NULL, else variant_id::text

-- 2) Add variant_key columns alongside existing variant_id/variation_id (no drops yet)

-- Recipes
alter table public.item_recipes add column if not exists finished_variant_key text default 'base';
update public.item_recipes set finished_variant_key = coalesce(finished_variant_key, case when finished_variant_id is null then 'base' else finished_variant_id::text end);

alter table public.item_recipe_ingredients add column if not exists ingredient_variant_key text default 'base';
update public.item_recipe_ingredients set ingredient_variant_key = coalesce(ingredient_variant_key, case when ingredient_variant_id is null then 'base' else ingredient_variant_id::text end);

-- Transfer profiles
alter table public.item_transfer_profiles add column if not exists variant_key text default 'base';
update public.item_transfer_profiles set variant_key = coalesce(variant_key, case when variant_id is null then 'base' else variant_id::text end);

-- Warehouse handling policies
alter table public.item_warehouse_handling_policies add column if not exists variant_key text default 'base';
update public.item_warehouse_handling_policies set variant_key = coalesce(variant_key, case when variant_id is null then 'base' else variant_id::text end);

-- Outlet routes (will replace normalized_variant_id later)
alter table public.outlet_item_routes add column if not exists variant_key text default 'base';
alter table public.outlet_item_routes add column if not exists normalized_variant_key text default 'base';
update public.outlet_item_routes
set variant_key = coalesce(variant_key, case when variant_id is null then 'base' else variant_id::text end),
    normalized_variant_key = coalesce(normalized_variant_key, case when variant_id is null then 'base' else variant_id::text end);

-- Sales
alter table public.outlet_sales add column if not exists variant_key text default 'base';
update public.outlet_sales set variant_key = coalesce(variant_key, case when variant_id is null then 'base' else variant_id::text end);

-- Stock balances
alter table public.outlet_stock_balances add column if not exists variant_key text default 'base';
update public.outlet_stock_balances set variant_key = coalesce(variant_key, case when variant_id is null then 'base' else variant_id::text end);

-- Stocktakes
alter table public.outlet_stocktakes add column if not exists variant_key text default 'base';
update public.outlet_stocktakes set variant_key = coalesce(variant_key, case when variant_id is null then 'base' else variant_id::text end);

-- Supplier links
alter table public.product_supplier_links add column if not exists variant_key text default 'base';
update public.product_supplier_links set variant_key = coalesce(variant_key, case when variant_id is null then 'base' else variant_id::text end);

-- Stock ledger
alter table public.stock_ledger add column if not exists variant_key text default 'base';
update public.stock_ledger set variant_key = coalesce(variant_key, case when variant_id is null then 'base' else variant_id::text end);

-- Warehouse defaults (to be merged into routes later)
alter table public.warehouse_defaults add column if not exists variant_key text default 'base';
update public.warehouse_defaults set variant_key = coalesce(variant_key, case when variant_id is null then 'base' else variant_id::text end);

-- Purchase receipt lines
alter table public.warehouse_purchase_items add column if not exists variant_key text default 'base';
update public.warehouse_purchase_items set variant_key = coalesce(variant_key, case when variant_id is null then 'base' else variant_id::text end);

-- Transfer lines
alter table public.warehouse_transfer_items add column if not exists variant_key text default 'base';
update public.warehouse_transfer_items set variant_key = coalesce(variant_key, case when variant_id is null then 'base' else variant_id::text end);

-- Order items
alter table public.order_items add column if not exists variation_key text default 'base';
update public.order_items set variation_key = coalesce(variation_key, case when variation_id is null then 'base' else variation_id::text end);

-- POS item map
alter table public.pos_item_map add column if not exists catalog_variant_key text default 'base';
alter table public.pos_item_map add column if not exists normalized_variant_key text default 'base';
update public.pos_item_map
set catalog_variant_key = coalesce(catalog_variant_key, case when catalog_variant_id is null then 'base' else catalog_variant_id::text end),
    normalized_variant_key = coalesce(normalized_variant_key, case when catalog_variant_id is null then 'base' else catalog_variant_id::text end);

commit;
