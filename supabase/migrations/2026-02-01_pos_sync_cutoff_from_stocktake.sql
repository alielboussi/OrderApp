create or replace function public.set_pos_sync_cutoff_for_warehouse(p_warehouse_id uuid, p_cutoff timestamptz)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cutoff_epoch bigint;
begin
  if not public.is_stocktake_user(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_warehouse_id is null then
    raise exception 'warehouse required';
  end if;

  if p_cutoff is null then
    raise exception 'cutoff required';
  end if;

  v_cutoff_epoch := floor(extract(epoch from p_cutoff));

  insert into public.counter_values(counter_key, scope_id, last_value)
  select 'pos_sync_cutoff', o.id, v_cutoff_epoch
  from public.outlets o
  where o.default_sales_warehouse_id = p_warehouse_id

  union

  select 'pos_sync_cutoff', ow.outlet_id, v_cutoff_epoch
  from public.outlet_warehouses ow
  where ow.warehouse_id = p_warehouse_id
    and coalesce(ow.show_in_stocktake, true)

  on conflict (counter_key, scope_id)
  do update
    set last_value = excluded.last_value,
        updated_at = now();
end;
$function$;
