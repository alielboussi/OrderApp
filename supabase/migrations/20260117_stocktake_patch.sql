-- Patch: stocktake behavior when no prior stock exists + stocktake numbers with AT prefix
-- If a period is started and warehouse_layer_stock has no rows, the first count entered
-- will seed an opening record for that item/variant equal to the entered qty.

-- Stocktake number generator: AT0000000001, AT0000000002, ...
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

-- Ensure stocktake number column exists and is populated
alter table if exists public.warehouse_stock_periods
  add column if not exists stocktake_number text unique;

alter table if exists public.warehouse_stock_periods
  alter column stocktake_number set default public.next_stocktake_number();

update public.warehouse_stock_periods
set stocktake_number = public.next_stocktake_number()
where stocktake_number is null;

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

  insert into public.warehouse_stock_periods(warehouse_id, outlet_id, status, opened_by, note, opening_snapshot, stocktake_number)
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

create or replace function public.record_stock_count(
  p_period_id uuid,
  p_item_id uuid,
  p_variant_key text default 'base',
  p_qty numeric,
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
