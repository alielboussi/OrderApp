-- Stocktake improvements: include zero-stock ingredients, tighten stock counts, and add variance costing

-- 1) Show all active ingredient catalog items for every warehouse with their latest on-hand and unit cost
create or replace view public.warehouse_stock_items as
select
  w.id as warehouse_id,
  ci.id as item_id,
  ci.name as item_name,
  'base'::text as variant_key,
  coalesce(sum(sl.delta_units), 0)::numeric as net_units,
  ci.cost as unit_cost
from public.warehouses w
join public.catalog_items ci on ci.item_kind = 'ingredient' and ci.active
left join public.stock_ledger sl
  on sl.warehouse_id = w.id
 and sl.item_id = ci.id
 and sl.location_type = 'warehouse'
group by w.id, ci.id, ci.name, ci.cost;

-- 2) Prevent duplicate opening/closing rows for the same item+variant and allow upserted counts
create unique index if not exists idx_wsc_unique_kind
  on public.warehouse_stock_counts (period_id, item_id, variant_key, kind);

create or replace function public.record_stock_count(
  p_period_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_variant_key text default 'base',
  p_kind text default 'closing',
  p_context jsonb default '{}'::jsonb
) returns warehouse_stock_counts
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_period public.warehouse_stock_periods%rowtype;
  v_row public.warehouse_stock_counts%rowtype;
  v_item_kind item_kind;
  v_variant text := public.normalize_variant_key(p_variant_key);
begin
  if not public.is_stocktake_user(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_qty is null or p_qty < 0 then
    raise exception 'qty must be >= 0';
  end if;

  select ci.item_kind into v_item_kind
  from public.catalog_items ci
  where ci.id = p_item_id;

  if v_item_kind is null then
    raise exception 'catalog item % not found for stock count', p_item_id;
  end if;

  if v_item_kind <> 'ingredient' then
    raise exception 'stock counts are restricted to ingredient items (got %)', v_item_kind;
  end if;

  select * into v_period from public.warehouse_stock_periods where id = p_period_id;
  if not found then
    raise exception 'stock period not found';
  end if;
  if v_period.status <> 'open' then
    raise exception 'stock period is not open';
  end if;

  if lower(coalesce(p_kind, '')) = 'opening' then
    insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
    values (p_period_id, p_item_id, v_variant, p_qty, 'opening', auth.uid(), coalesce(p_context, '{}'))
    on conflict (period_id, item_id, variant_key, kind)
    do update set
      counted_qty = excluded.counted_qty,
      counted_by = excluded.counted_by,
      counted_at = now(),
      context = excluded.context
    returning * into v_row;
    return v_row;
  end if;

  -- Seed opening once if missing so expected_qty has a baseline
  insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
  values (p_period_id, p_item_id, v_variant, p_qty, 'opening', auth.uid(), coalesce(p_context, '{}') || jsonb_build_object('seeded_opening', true))
  on conflict (period_id, item_id, variant_key, kind) do nothing;

  insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
  values (p_period_id, p_item_id, v_variant, p_qty, p_kind, auth.uid(), coalesce(p_context, '{}'))
  on conflict (period_id, item_id, variant_key, kind)
  do update set
    counted_qty = excluded.counted_qty,
    counted_by = excluded.counted_by,
    counted_at = now(),
    context = excluded.context
  returning * into v_row;

  return v_row;
end;
$$;

-- 3) Variance view with cost math and de-duplicated keys
create or replace view public.warehouse_stock_variances as
with opening as (
  select
    period_id,
    item_id,
    public.normalize_variant_key(variant_key) as variant_key,
    max(counted_qty) as opening_qty
  from public.warehouse_stock_counts
  where kind = 'opening'
  group by period_id, item_id, public.normalize_variant_key(variant_key)
),
closing as (
  select
    period_id,
    item_id,
    public.normalize_variant_key(variant_key) as variant_key,
    max(counted_qty) as closing_qty
  from public.warehouse_stock_counts
  where kind = 'closing'
  group by period_id, item_id, public.normalize_variant_key(variant_key)
),
movement as (
  select
    wsp.id as period_id,
    sl.item_id,
    public.normalize_variant_key(sl.variant_key) as variant_key,
    sum(sl.delta_units) as movement_qty
  from public.warehouse_stock_periods wsp
  left join public.stock_ledger sl on sl.warehouse_id = wsp.warehouse_id
    and sl.location_type = 'warehouse'
    and sl.item_id is not null
    and sl.occurred_at >= wsp.opened_at
    and (wsp.closed_at is null or sl.occurred_at <= coalesce(wsp.closed_at, now()))
  group by wsp.id, sl.item_id, public.normalize_variant_key(sl.variant_key)
),
keys as (
  select period_id, item_id, variant_key from opening
  union
  select period_id, item_id, variant_key from closing
  union
  select period_id, item_id, variant_key from movement
)
select
  k.period_id,
  wsp.warehouse_id,
  wsp.outlet_id,
  k.item_id,
  k.variant_key,
  coalesce(o.opening_qty, 0)::numeric as opening_qty,
  coalesce(m.movement_qty, 0)::numeric as movement_qty,
  coalesce(c.closing_qty, 0)::numeric as closing_qty,
  coalesce(o.opening_qty, 0)::numeric + coalesce(m.movement_qty, 0)::numeric as expected_qty,
  coalesce(c.closing_qty, 0)::numeric - (coalesce(o.opening_qty, 0)::numeric + coalesce(m.movement_qty, 0)::numeric) as variance_qty,
  ci.name as item_name,
  coalesce(ci.cost, 0)::numeric as unit_cost,
  (coalesce(c.closing_qty, 0)::numeric - (coalesce(o.opening_qty, 0)::numeric + coalesce(m.movement_qty, 0)::numeric)) * coalesce(ci.cost, 0)::numeric as variance_cost
from keys k
join public.warehouse_stock_periods wsp on wsp.id = k.period_id
left join opening o on o.period_id = k.period_id and o.item_id = k.item_id and o.variant_key = k.variant_key
left join closing c on c.period_id = k.period_id and c.item_id = k.item_id and c.variant_key = k.variant_key
left join movement m on m.period_id = k.period_id and m.item_id = k.item_id and m.variant_key = k.variant_key
left join public.catalog_items ci on ci.id = k.item_id;
