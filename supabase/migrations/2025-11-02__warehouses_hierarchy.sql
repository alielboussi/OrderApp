-- Add hierarchy to warehouses for grouping coldrooms under a parent (e.g., Main Cold Room)
-- and supporting aggregated stock reporting at the parent level.

alter table public.warehouses
  add column if not exists parent_warehouse_id uuid references public.warehouses(id) on delete restrict;

-- Helpful index for ledger lookups
create index if not exists idx_stock_ledger_loc_prod_var
  on public.stock_ledger(location_type, location_id, product_id, variation_id);

-- View: aggregated stock for a parent warehouse including all its direct children
create or replace view public.warehouse_group_stock_current as
with child_stock as (
  select
    w.parent_warehouse_id as group_id,
    sl.product_id,
    sl.variation_id,
    sum(sl.qty_change) as qty
  from public.stock_ledger sl
  join public.warehouses w on w.id = sl.location_id
  where sl.location_type = 'warehouse'
    and w.parent_warehouse_id is not null
  group by 1,2,3
),
parent_self as (
  -- if a parent also holds stock directly, include it
  select
    w.id as group_id,
    sl.product_id,
    sl.variation_id,
    sum(sl.qty_change) as qty
  from public.stock_ledger sl
  join public.warehouses w on w.id = sl.location_id
  where sl.location_type = 'warehouse'
  group by 1,2,3
)
select group_id as warehouse_parent_id, product_id, variation_id, sum(qty) as qty
from (
  select * from child_stock
  union all
  select * from parent_self
) s
where group_id is not null
group by 1,2,3;
