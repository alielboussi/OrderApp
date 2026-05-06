create or replace function public.close_stock_period(p_period_id uuid)
returns warehouse_stock_periods
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.warehouse_stock_periods%rowtype;
  v_prev_id uuid;
  v_snapshot jsonb;
begin
  if not public.is_stocktake_user(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select * into v_row from public.warehouse_stock_periods where id = p_period_id for update;
  if not found then
    raise exception 'period not found or already closed';
  end if;
  if v_row.status <> 'open' then
    raise exception 'period not found or already closed';
  end if;

  select wsp.id
  into v_prev_id
  from public.warehouse_stock_periods wsp
  where wsp.warehouse_id = v_row.warehouse_id
    and wsp.status = 'closed'
    and wsp.id <> p_period_id
  order by wsp.closed_at desc nulls last, wsp.opened_at desc nulls last
  limit 1;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_snapshot
  from (
    with closing as (
      select wsc.item_id, wsc.variant_key, wsc.counted_qty
      from public.warehouse_stock_counts wsc
      where wsc.period_id = p_period_id
        and wsc.kind = 'closing'
    ),
    opening as (
      select wsc.item_id, wsc.variant_key, wsc.counted_qty
      from public.warehouse_stock_counts wsc
      where wsc.period_id = p_period_id
        and wsc.kind = 'opening'
    ),
    prev_closing as (
      select wsc.item_id, wsc.variant_key, wsc.counted_qty
      from public.warehouse_stock_counts wsc
      where wsc.period_id = v_prev_id
        and wsc.kind = 'closing'
    ),
    keys as (
      select item_id, variant_key from closing
      union
      select item_id, variant_key from opening
      union
      select item_id, variant_key from prev_closing
    )
    select
      k.item_id,
      k.variant_key,
      coalesce(c.counted_qty, o.counted_qty, p.counted_qty, 0) as closing_qty
    from keys k
    left join closing c
      on c.item_id = k.item_id
     and public.normalize_variant_key(c.variant_key) = public.normalize_variant_key(k.variant_key)
    left join opening o
      on o.item_id = k.item_id
     and public.normalize_variant_key(o.variant_key) = public.normalize_variant_key(k.variant_key)
    left join prev_closing p
      on p.item_id = k.item_id
     and public.normalize_variant_key(p.variant_key) = public.normalize_variant_key(k.variant_key)
    order by k.item_id, k.variant_key
  ) t;

  if coalesce(jsonb_array_length(v_snapshot), 0) = 0 then
    raise exception 'closing counts required before closing period';
  end if;

  update public.warehouse_stock_periods
  set status = 'closed',
      closed_at = now(),
      closed_by = auth.uid(),
      closing_snapshot = v_snapshot
  where id = p_period_id and status = 'open'
  returning * into v_row;

  if not found then
    raise exception 'period not found or already closed';
  end if;

  perform public.start_stock_period(v_row.warehouse_id, 'Auto-open after close');

  return v_row;
end;
$function$;
