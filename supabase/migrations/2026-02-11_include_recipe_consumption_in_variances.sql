create or replace view public.warehouse_stock_variances as
with opening as (
  select
    warehouse_stock_counts.period_id,
    warehouse_stock_counts.item_id,
    normalize_variant_key(warehouse_stock_counts.variant_key) as variant_key,
    max(warehouse_stock_counts.counted_qty) as opening_qty
  from warehouse_stock_counts
  where warehouse_stock_counts.kind = 'opening'
  group by
    warehouse_stock_counts.period_id,
    warehouse_stock_counts.item_id,
    normalize_variant_key(warehouse_stock_counts.variant_key)
),
closing as (
  select
    warehouse_stock_counts.period_id,
    warehouse_stock_counts.item_id,
    normalize_variant_key(warehouse_stock_counts.variant_key) as variant_key,
    max(warehouse_stock_counts.counted_qty) as closing_qty
  from warehouse_stock_counts
  where warehouse_stock_counts.kind = 'closing'
  group by
    warehouse_stock_counts.period_id,
    warehouse_stock_counts.item_id,
    normalize_variant_key(warehouse_stock_counts.variant_key)
),
movement as (
  select
    wsp_1.id as period_id,
    sl.item_id,
    normalize_variant_key(sl.variant_key) as variant_key,
    sum(sl.delta_units) as movement_qty
  from warehouse_stock_periods wsp_1
  left join stock_ledger sl
    on sl.warehouse_id = wsp_1.warehouse_id
   and sl.location_type = 'warehouse'
   and sl.item_id is not null
   and sl.occurred_at >= wsp_1.opened_at
   and (wsp_1.closed_at is null or sl.occurred_at <= coalesce(wsp_1.closed_at, now()))
   and sl.reason = any (array['warehouse_transfer'::stock_reason, 'outlet_sale'::stock_reason, 'damage'::stock_reason, 'recipe_consumption'::stock_reason])
  group by
    wsp_1.id,
    sl.item_id,
    normalize_variant_key(sl.variant_key)
),
keys as (
  select opening.period_id, opening.item_id, opening.variant_key from opening
  union
  select closing.period_id, closing.item_id, closing.variant_key from closing
  union
  select movement.period_id, movement.item_id, movement.variant_key from movement
)
select
  k.period_id,
  wsp.warehouse_id,
  wsp.outlet_id,
  k.item_id,
  k.variant_key,
  coalesce(o.opening_qty, 0::numeric) as opening_qty,
  coalesce(m.movement_qty, 0::numeric) as movement_qty,
  coalesce(c.closing_qty, 0::numeric) as closing_qty,
  (coalesce(o.opening_qty, 0::numeric) + coalesce(m.movement_qty, 0::numeric)) as expected_qty,
  (coalesce(c.closing_qty, 0::numeric) - (coalesce(o.opening_qty, 0::numeric) + coalesce(m.movement_qty, 0::numeric))) as variance_qty,
  ci.name as item_name,
  coalesce(ci.cost, 0::numeric) as unit_cost,
  ((coalesce(c.closing_qty, 0::numeric) - (coalesce(o.opening_qty, 0::numeric) + coalesce(m.movement_qty, 0::numeric))) * coalesce(ci.cost, 0::numeric)) as variance_cost
from keys k
join warehouse_stock_periods wsp on wsp.id = k.period_id
left join opening o on o.period_id = k.period_id and o.item_id = k.item_id and o.variant_key = k.variant_key
left join closing c on c.period_id = k.period_id and c.item_id = k.item_id and c.variant_key = k.variant_key
left join movement m on m.period_id = k.period_id and m.item_id = k.item_id and m.variant_key = k.variant_key
left join catalog_items ci on ci.id = k.item_id;
