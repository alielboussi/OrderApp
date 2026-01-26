-- Verify Combat Energy Drink catalog row
select
  ci.id,
  ci.name,
  ci.sku,
  ci.item_kind,
  ci.has_variations,
  ci.has_recipe,
  ci.default_warehouse_id,
  ci.active,
  ci.variants,
  ci.consumption_uom,
  ci.stocktake_uom,
  ci.qty_decimal_places,
  ci.created_at,
  ci.updated_at
from public.catalog_items ci
where ci.id = '8d0c05e0-a939-4c24-9ea5-424baf37c2eb'
   or ci.sku = '364'
   or ci.name ilike '%combat energy drink%';

-- Storage home mapping (base)
select
  ish.item_id,
  ish.variant_key,
  ish.normalized_variant_key,
  ish.storage_warehouse_id,
  w.name as storage_warehouse_name
from public.item_storage_homes ish
left join public.warehouses w on w.id = ish.storage_warehouse_id
where ish.item_id = '8d0c05e0-a939-4c24-9ea5-424baf37c2eb';

-- Outlet routes for the base item
select
  r.outlet_id,
  o.name as outlet_name,
  r.item_id,
  r.variant_key,
  r.normalized_variant_key,
  r.warehouse_id,
  w.name as warehouse_name,
  r.deduct_enabled,
  r.target_outlet_id
from public.outlet_item_routes r
left join public.outlets o on o.id = r.outlet_id
left join public.warehouses w on w.id = r.warehouse_id
where r.item_id = '8d0c05e0-a939-4c24-9ea5-424baf37c2eb'
  and r.normalized_variant_key = 'base';

-- Outlet products visibility for base variant
select
  op.outlet_id,
  o.name as outlet_name,
  op.item_id,
  op.variant_key,
  op.enabled
from public.outlet_products op
left join public.outlets o on o.id = op.outlet_id
where op.item_id = '8d0c05e0-a939-4c24-9ea5-424baf37c2eb'
  and op.variant_key = 'base';

-- Warehouse stock items view (if present)
select
  wsi.warehouse_id,
  w.name as warehouse_name,
  wsi.item_id,
  wsi.item_name,
  wsi.variant_key,
  wsi.item_kind,
  wsi.net_units
from public.warehouse_stock_items wsi
left join public.warehouses w on w.id = wsi.warehouse_id
where wsi.item_id = '8d0c05e0-a939-4c24-9ea5-424baf37c2eb'
order by wsi.warehouse_id;
