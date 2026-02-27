with params as (
  select
    '16161101661710'::text as barcode,
    regexp_replace(lower('16161101661710'), '[^0-9a-z]', '', 'g') as norm_barcode,
    '0c9ddd9e-d42c-475f-9232-5e9d649b0916'::uuid as warehouse_id
),
item_matches as (
  select
    i.id,
    i.name,
    i.active,
    i.sku,
    i.supplier_sku,
    i.default_warehouse_id
  from catalog_items i, params p
  where lower(i.sku) = lower(p.barcode)
     or lower(i.supplier_sku) = lower(p.barcode)
     or regexp_replace(lower(i.sku), '[^0-9a-z]', '', 'g') = p.norm_barcode
     or regexp_replace(lower(i.supplier_sku), '[^0-9a-z]', '', 'g') = p.norm_barcode
),
variant_matches as (
  select
    v.id,
    v.item_id,
    v.name,
    v.active,
    v.sku,
    v.supplier_sku,
    v.default_warehouse_id
  from catalog_variants v, params p
  where lower(v.sku) = lower(p.barcode)
     or lower(v.supplier_sku) = lower(p.barcode)
     or regexp_replace(lower(v.sku), '[^0-9a-z]', '', 'g') = p.norm_barcode
     or regexp_replace(lower(v.supplier_sku), '[^0-9a-z]', '', 'g') = p.norm_barcode
),
matched_items as (
  select id from item_matches
  union
  select item_id from variant_matches
)
select
  'item_matches' as section,
  id,
  null::uuid as item_id,
  name,
  active,
  sku,
  supplier_sku,
  default_warehouse_id
from item_matches
union all
select
  'variant_matches' as section,
  id::uuid,
  item_id::uuid,
  name,
  active,
  sku,
  supplier_sku,
  default_warehouse_id
from variant_matches
union all
select
  'eligible_in_warehouse' as section,
  mi.id,
  mi.id as item_id,
  i.name,
  i.active,
  null::text as sku,
  null::text as supplier_sku,
  i.default_warehouse_id
from matched_items mi
join catalog_items i on i.id = mi.id
left join warehouse_stock_items wsi
  on wsi.item_id = mi.id
  and wsi.warehouse_id = (select warehouse_id from params)
left join item_storage_homes ish
  on ish.item_id = mi.id
  and ish.storage_warehouse_id = (select warehouse_id from params)
where wsi.item_id is not null or ish.item_id is not null;
