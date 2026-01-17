-- Full stocktake setup: tables, numbering, RLS, functions
-- Safe to run even if prior patch failed; creates missing objects and replaces functions

-- Number generator: AT0000000001, AT0000000002, ...
create or replace function public.next_stocktake_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
  v_scope uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into public.counter_values(counter_key, scope_id, last_value)
  values ('stocktake_number', v_scope, 1)
  on conflict (counter_key, scope_id)
  do update set last_value = public.counter_values.last_value + 1,
                updated_at = now()
  returning last_value into v_next;

  return 'AT' || lpad(v_next::text, 10, '0');
end;
$$;

-- Tables
create table if not exists public.warehouse_stock_periods (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  opened_by uuid not null references auth.users(id),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  note text,
  opening_snapshot jsonb,
  closing_snapshot jsonb,
  stocktake_number text unique default public.next_stocktake_number()
);

-- Only one open period per warehouse
create unique index if not exists idx_wsp_open_unique
  on public.warehouse_stock_periods(warehouse_id)
  where status = 'open';

create table if not exists public.warehouse_stock_counts (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.warehouse_stock_periods(id) on delete cascade,
  item_id uuid not null references public.catalog_items(id),
  variant_key text not null default 'base',
  counted_qty numeric not null check (counted_qty >= 0),
  kind text not null check (kind in ('opening','closing')),
  counted_at timestamptz not null default now(),
  counted_by uuid not null references auth.users(id),
  context jsonb default '{}'::jsonb
);

-- Ensure column exists if table pre-existed
alter table public.warehouse_stock_periods
  add column if not exists stocktake_number text unique;
alter table public.warehouse_stock_periods
  alter column stocktake_number set default public.next_stocktake_number();

-- Backfill missing numbers if any
update public.warehouse_stock_periods
set stocktake_number = public.next_stocktake_number()
where stocktake_number is null;

-- RLS
alter table public.warehouse_stock_periods enable row level security;
alter table public.warehouse_stock_counts enable row level security;

create or replace function public.is_stocktake_user(p_user uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user
      and ur.role_id = '95b6a75d-bd46-4764-b5ea-981b1608f1ca'
  );
$$;

-- Policies
drop policy if exists stocktake_periods_admin on public.warehouse_stock_periods;
create policy stocktake_periods_admin on public.warehouse_stock_periods
  for all using (auth.role() = 'service_role') with check (true);

drop policy if exists stocktake_periods_stocktakers on public.warehouse_stock_periods;
create policy stocktake_periods_stocktakers on public.warehouse_stock_periods
  for all using (public.is_stocktake_user(auth.uid())) with check (public.is_stocktake_user(auth.uid()));

drop policy if exists stocktake_counts_admin on public.warehouse_stock_counts;
create policy stocktake_counts_admin on public.warehouse_stock_counts
  for all using (auth.role() = 'service_role') with check (true);

drop policy if exists stocktake_counts_stocktakers on public.warehouse_stock_counts;
create policy stocktake_counts_stocktakers on public.warehouse_stock_counts
  for all using (public.is_stocktake_user(auth.uid())) with check (public.is_stocktake_user(auth.uid()));

-- Start period
create or replace function public.start_stock_period(p_warehouse_id uuid, p_note text default null)
returns public.warehouse_stock_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.warehouse_stock_periods%rowtype;
  v_outlet uuid;
begin
  if not public.is_stocktake_user(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_warehouse_id is null then
    raise exception 'warehouse required';
  end if;

  if exists (
    select 1 from public.warehouse_stock_periods wsp
    where wsp.warehouse_id = p_warehouse_id and wsp.status = 'open'
  ) then
    raise exception 'open stock period already exists for this warehouse';
  end if;

  select w.outlet_id into v_outlet from public.warehouses w where w.id = p_warehouse_id;
  if v_outlet is null then
    raise exception 'warehouse has no outlet mapping';
  end if;

  insert into public.warehouse_stock_periods(
    warehouse_id, outlet_id, status, opened_by, note, opening_snapshot, stocktake_number
  )
  values (
    p_warehouse_id,
    v_outlet,
    'open',
    auth.uid(),
    p_note,
    (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select item_id, variant_key, net_units as opening_qty
        from public.warehouse_layer_stock
        where warehouse_id = p_warehouse_id
      ) t
    ),
    public.next_stocktake_number()
  )
  returning * into v_row;

  -- Seed opening rows only if snapshot had data; otherwise leave empty and let first counts seed openings.
  if coalesce(jsonb_array_length(v_row.opening_snapshot), 0) > 0 then
    insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
    select v_row.id, s.item_id, s.variant_key, s.opening_qty, 'opening', auth.uid(), jsonb_build_object('snapshot', true)
    from jsonb_to_recordset(coalesce(v_row.opening_snapshot, '[]'::jsonb))
      as s(item_id uuid, variant_key text, opening_qty numeric);
  end if;

  return v_row;
end;
$$;

-- Record count (closing, or seeds opening if none exist)
create or replace function public.record_stock_count(
  p_period_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_variant_key text default 'base',
  p_kind text default 'closing',
  p_context jsonb default '{}'::jsonb
)
returns public.warehouse_stock_counts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.warehouse_stock_periods%rowtype;
  v_row public.warehouse_stock_counts%rowtype;
  v_has_opening boolean;
begin
  if not public.is_stocktake_user(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_qty is null or p_qty < 0 then
    raise exception 'qty must be >= 0';
  end if;

  select * into v_period from public.warehouse_stock_periods where id = p_period_id;
  if not found then
    raise exception 'stock period not found';
  end if;
  if v_period.status <> 'open' then
    raise exception 'stock period is not open';
  end if;

  select exists (
    select 1 from public.warehouse_stock_counts c
    where c.period_id = p_period_id and c.kind = 'opening'
  ) into v_has_opening;

  -- If no opening exists (fresh warehouse with no snapshot), seed opening = entered qty for this item
  if not v_has_opening then
    insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
    values (
      p_period_id,
      p_item_id,
      public.normalize_variant_key(p_variant_key),
      p_qty,
      'opening',
      auth.uid(),
      p_context || jsonb_build_object('seeded_opening', true)
    );
  end if;

  insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
  values (
    p_period_id,
    p_item_id,
    public.normalize_variant_key(p_variant_key),
    p_qty,
    p_kind,
    auth.uid(),
    p_context
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- Close period (simple; can be extended to cache closing snapshot)
create or replace function public.close_stock_period(p_period_id uuid)
returns public.warehouse_stock_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.warehouse_stock_periods%rowtype;
begin
  if not public.is_stocktake_user(auth.uid()) then
    raise exception 'not authorized';
  end if;

  update public.warehouse_stock_periods
  set status = 'closed',
      closed_at = now(),
      closed_by = auth.uid()
  where id = p_period_id and status = 'open'
  returning * into v_row;

  if not found then
    raise exception 'period not found or already closed';
  end if;

  return v_row;
end;
$$;

-- Variance view
create or replace view public.warehouse_stock_variances as
select
  wsp.id as period_id,
  wsp.warehouse_id,
  wsp.outlet_id,
  coalesce(close_counts.item_id, open_counts.item_id, mov.item_id) as item_id,
  coalesce(close_counts.variant_key, open_counts.variant_key, mov.variant_key, 'base') as variant_key,
  coalesce(open_counts.opening_qty, 0) as opening_qty,
  coalesce(mov.delta_units, 0) as movement_qty,
  coalesce(close_counts.closing_qty, 0) as closing_qty,
  (coalesce(open_counts.opening_qty, 0) + coalesce(mov.delta_units, 0)) as expected_qty,
  (coalesce(close_counts.closing_qty, 0) - (coalesce(open_counts.opening_qty, 0) + coalesce(mov.delta_units, 0))) as variance_qty
from public.warehouse_stock_periods wsp
left join lateral (
  select item_id, variant_key, counted_qty as opening_qty
  from public.warehouse_stock_counts c
  where c.period_id = wsp.id and c.kind = 'opening'
) open_counts on true
left join lateral (
  select item_id, variant_key, counted_qty as closing_qty
  from public.warehouse_stock_counts c
  where c.period_id = wsp.id and c.kind = 'closing'
) close_counts on true
left join lateral (
  select sl.item_id, sl.variant_key, sum(sl.delta_units) as delta_units
  from public.stock_ledger sl
  where sl.warehouse_id = wsp.warehouse_id
    and sl.occurred_at >= wsp.opened_at
    and (
      (wsp.closed_at is null and sl.occurred_at <= now()) or
      (wsp.closed_at is not null and sl.occurred_at <= wsp.closed_at)
    )
  group by sl.item_id, sl.variant_key
) mov on true;
