create or replace function public.sync_opening_stock_to_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item_id uuid;
  v_variant text;
  v_period_id uuid;
  v_warehouse_id uuid;
  v_desired numeric := 0;
  v_current numeric := 0;
  v_delta numeric := 0;
  v_kind text;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  v_kind := lower(coalesce(new.kind, ''));
  if v_kind not in ('opening', 'closing') then
    return new;
  end if;

  v_item_id := new.item_id;
  v_variant := public.normalize_variant_key(new.variant_key);
  v_period_id := new.period_id;
  v_desired := coalesce(new.counted_qty, 0);

  select wsp.warehouse_id
    into v_warehouse_id
  from public.warehouse_stock_periods wsp
  where wsp.id = v_period_id
  limit 1;

  if v_warehouse_id is null then
    return new;
  end if;

  select coalesce(sum(sl.delta_units), 0)
    into v_current
  from public.stock_ledger sl
  where sl.location_type = 'warehouse'
    and sl.warehouse_id = v_warehouse_id
    and sl.item_id = v_item_id
    and public.normalize_variant_key(sl.variant_key) = v_variant;

  v_delta := v_desired - coalesce(v_current, 0);
  if v_delta = 0 then
    return new;
  end if;

  insert into public.stock_ledger(
    location_type,
    warehouse_id,
    item_id,
    variant_key,
    delta_units,
    reason,
    context,
    occurred_at
  ) values (
    'warehouse',
    v_warehouse_id,
    v_item_id,
    v_variant,
    v_delta,
    'opening_stock',
    jsonb_build_object('period_id', v_period_id::text, 'source', 'stock_count', 'kind', v_kind),
    now()
  );

  return new;
end;
$function$;

drop trigger if exists trg_opening_stock_to_ledger on public.warehouse_stock_counts;
create trigger trg_opening_stock_to_ledger
after insert or update on public.warehouse_stock_counts
for each row execute function public.sync_opening_stock_to_ledger();
