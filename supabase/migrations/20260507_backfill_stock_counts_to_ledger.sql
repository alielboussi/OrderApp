with latest_counts as (
  select
    wsc.period_id,
    wsc.item_id,
    public.normalize_variant_key(wsc.variant_key) as variant_key,
    max(case when wsc.kind = 'closing' then wsc.counted_qty end) as closing_qty,
    max(case when wsc.kind = 'opening' then wsc.counted_qty end) as opening_qty
  from public.warehouse_stock_counts wsc
  join public.warehouse_stock_periods wsp on wsp.id = wsc.period_id
  where wsp.status = 'open'
  group by wsc.period_id, wsc.item_id, public.normalize_variant_key(wsc.variant_key)
),
period_targets as (
  select
    lc.period_id,
    wsp.warehouse_id,
    lc.item_id,
    lc.variant_key,
    coalesce(lc.closing_qty, lc.opening_qty, 0) as desired_qty
  from latest_counts lc
  join public.warehouse_stock_periods wsp on wsp.id = lc.period_id
),
current_stock as (
  select
    sl.warehouse_id,
    sl.item_id,
    public.normalize_variant_key(sl.variant_key) as variant_key,
    coalesce(sum(sl.delta_units), 0) as current_qty
  from public.stock_ledger sl
  where sl.location_type = 'warehouse'
  group by sl.warehouse_id, sl.item_id, public.normalize_variant_key(sl.variant_key)
),
changes as (
  select
    pt.warehouse_id,
    pt.item_id,
    pt.variant_key,
    pt.desired_qty,
    coalesce(cs.current_qty, 0) as current_qty,
    pt.desired_qty - coalesce(cs.current_qty, 0) as delta_qty,
    pt.period_id
  from period_targets pt
  left join current_stock cs
    on cs.warehouse_id = pt.warehouse_id
   and cs.item_id = pt.item_id
   and cs.variant_key = pt.variant_key
)
insert into public.stock_ledger(
  location_type,
  warehouse_id,
  item_id,
  variant_key,
  delta_units,
  reason,
  context,
  occurred_at
)
select
  'warehouse',
  c.warehouse_id,
  c.item_id,
  c.variant_key,
  c.delta_qty,
  'opening_stock',
  jsonb_build_object('period_id', c.period_id::text, 'source', 'stock_count_backfill', 'kind', 'closing_or_opening'),
  now()
from changes c
where c.delta_qty <> 0;
