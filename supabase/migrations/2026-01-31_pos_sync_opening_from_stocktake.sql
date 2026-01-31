create or replace function public.set_pos_sync_opening_for_warehouse(p_warehouse_id uuid, p_opened timestamptz)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_opened_epoch bigint;
begin
  if not public.is_stocktake_user(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_warehouse_id is null then
    raise exception 'warehouse required';
  end if;

  if p_opened is null then
    raise exception 'opened time required';
  end if;

  v_opened_epoch := floor(extract(epoch from p_opened));

  with scope_outlets as (
    select o.id as outlet_id
    from public.outlets o
    where o.default_sales_warehouse_id = p_warehouse_id

    union

    select ow.outlet_id
    from public.outlet_warehouses ow
    where ow.warehouse_id = p_warehouse_id
      and coalesce(ow.show_in_stocktake, true)
  )
  insert into public.counter_values(counter_key, scope_id, last_value)
  select 'pos_sync_opening', so.outlet_id, v_opened_epoch
  from scope_outlets so
  on conflict (counter_key, scope_id)
  do update
    set last_value = excluded.last_value,
        updated_at = now();

  update public.counter_values
  set last_value = 0,
      updated_at = now()
  where counter_key = 'pos_sync_cutoff'
    and scope_id in (select outlet_id from scope_outlets);
end;
$function$;
