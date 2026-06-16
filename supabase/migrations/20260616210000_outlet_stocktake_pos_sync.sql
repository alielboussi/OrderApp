-- Wire POS sync boundaries into stock period lifecycle; allow outlet operators via can_operate_outlet_warehouse_stocktake

CREATE OR REPLACE FUNCTION public.start_stock_period(p_warehouse_id uuid, p_note text DEFAULT NULL::text)
RETURNS warehouse_stock_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
declare
  v_row public.warehouse_stock_periods%rowtype;
  v_prev public.warehouse_stock_periods%rowtype;
  v_opening_snapshot jsonb := '[]'::jsonb;
begin
  if not public.can_operate_outlet_warehouse_stocktake(auth.uid(), p_warehouse_id) then
    raise exception 'not authorized';
  end if;

  if p_warehouse_id is null then
    raise exception 'warehouse required';
  end if;

  if not exists (
    select 1
    from public.warehouses w
    where w.id = p_warehouse_id
      and coalesce(w.active, true)
  ) then
    raise exception 'warehouse not found or inactive';
  end if;

  if exists (
    select 1
    from public.warehouse_stock_periods wsp
    where wsp.warehouse_id = p_warehouse_id
      and wsp.status = 'open'
  ) then
    raise exception 'open stock period already exists for this warehouse';
  end if;

  select * into v_prev
  from public.warehouse_stock_periods wsp
  where wsp.warehouse_id = p_warehouse_id
    and wsp.status = 'closed'
  order by wsp.closed_at desc nulls last, wsp.opened_at desc nulls last
  limit 1;

  if v_prev.id is not null then
    v_opening_snapshot := coalesce(
      v_prev.closing_snapshot,
      (
        select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
        from (
          select wsc.item_id, wsc.variant_key, wsc.counted_qty as closing_qty
          from public.warehouse_stock_counts wsc
          where wsc.period_id = v_prev.id
            and wsc.kind = 'closing'
          order by wsc.item_id, wsc.variant_key
        ) t
      )
    );
  end if;

  insert into public.warehouse_stock_periods(
    warehouse_id, outlet_id, status, opened_by, note, opening_snapshot, stocktake_number
  )
  values (
    p_warehouse_id,
    null,
    'open',
    auth.uid(),
    p_note,
    v_opening_snapshot,
    public.next_stocktake_number()
  )
  returning * into v_row;

  if coalesce(jsonb_array_length(v_row.opening_snapshot), 0) > 0 then
    insert into public.warehouse_stock_counts(
      period_id, item_id, variant_key, counted_qty, kind, counted_by, context
    )
    select v_row.id, s.item_id, s.variant_key, s.closing_qty, 'opening', auth.uid(),
           jsonb_build_object('snapshot', true, 'seeded_from', 'previous_closing')
    from jsonb_to_recordset(coalesce(v_row.opening_snapshot, '[]'::jsonb))
      as s(item_id uuid, variant_key text, closing_qty numeric);
  end if;

  perform public.set_pos_sync_opening_for_warehouse(v_row.warehouse_id, v_row.opened_at);

  return v_row;
end;
$$;

CREATE OR REPLACE FUNCTION public.close_stock_period(p_period_id uuid)
RETURNS warehouse_stock_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
declare
  v_row public.warehouse_stock_periods%rowtype;
  v_prev_id uuid;
  v_snapshot jsonb;
  v_has_closing boolean := false;
begin
  select * into v_row from public.warehouse_stock_periods where id = p_period_id for update;
  if not found then
    raise exception 'period not found or already closed';
  end if;

  if not public.can_operate_outlet_warehouse_stocktake(auth.uid(), v_row.warehouse_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status <> 'open' then
    raise exception 'period not found or already closed';
  end if;

  select exists (
    select 1 from public.warehouse_stock_counts wsc
    where wsc.period_id = p_period_id
      and wsc.kind = 'closing'
  ) into v_has_closing;

  if not v_has_closing then
    raise exception 'closing counts required before closing period';
  end if;

  select wsp.id
  into v_prev_id
  from public.warehouse_stock_periods wsp
  where wsp.warehouse_id = v_row.warehouse_id
    and wsp.status = 'closed'
    and wsp.id <> p_period_id
  order by wsp.closed_at desc nulls last, wsp.opened_at desc nulls last
  limit 1;

  with keys as (
    select distinct
      wli.item_id,
      public.normalize_variant_key(wli.variant_key) as variant_key
    from public.warehouse_live_items wli
    where wli.warehouse_id = v_row.warehouse_id
    union
    select wsc.item_id, public.normalize_variant_key(wsc.variant_key)
    from public.warehouse_stock_counts wsc
    where wsc.period_id = p_period_id
      and wsc.kind in ('opening', 'closing')
    union
    select wsc.item_id, public.normalize_variant_key(wsc.variant_key)
    from public.warehouse_stock_counts wsc
    where wsc.period_id = v_prev_id
      and wsc.kind = 'closing'
  )
  insert into public.warehouse_stock_counts(
    period_id, item_id, variant_key, counted_qty, kind, counted_by, context
  )
  select
    p_period_id,
    k.item_id,
    k.variant_key,
    0,
    'closing',
    auth.uid(),
    jsonb_build_object('auto_zero', true, 'reason', 'close_period')
  from keys k
  left join public.warehouse_stock_counts c
    on c.period_id = p_period_id
   and c.kind = 'closing'
   and c.item_id = k.item_id
   and public.normalize_variant_key(c.variant_key) = k.variant_key
  where c.id is null;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_snapshot
  from (
    select wsc.item_id,
           wsc.variant_key,
           wsc.counted_qty as closing_qty
    from public.warehouse_stock_counts wsc
    where wsc.period_id = p_period_id
      and wsc.kind = 'closing'
    order by wsc.item_id, wsc.variant_key
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

  perform public.set_pos_sync_cutoff_for_warehouse(v_row.warehouse_id, v_row.closed_at);
  perform public.start_stock_period(v_row.warehouse_id, 'Auto-open after close');

  return v_row;
end;
$$;

CREATE OR REPLACE FUNCTION public.record_stock_count(
  p_period_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_variant_key text DEFAULT 'base'::text,
  p_kind text DEFAULT NULL::text,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS warehouse_stock_counts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
declare
  v_period public.warehouse_stock_periods%rowtype;
  v_row public.warehouse_stock_counts%rowtype;
  v_item_kind item_kind;
  v_has_recipe boolean := false;
  v_variant text := public.normalize_variant_key(p_variant_key);
  v_has_opening boolean := false;
  v_kind text := lower(coalesce(p_kind, ''));
begin
  select * into v_period from public.warehouse_stock_periods where id = p_period_id;
  if not found then
    raise exception 'stock period not found';
  end if;

  if not public.can_operate_outlet_warehouse_stocktake(auth.uid(), v_period.warehouse_id) then
    raise exception 'not authorized';
  end if;

  if p_qty is null or p_qty < 0 then
    raise exception 'qty must be >= 0';
  end if;

  select ci.item_kind,
         exists (
           select 1 from public.recipes r
           where r.active and r.finished_item_id = p_item_id
         )
  into v_item_kind, v_has_recipe
  from public.catalog_items ci
  where ci.id = p_item_id;

  if v_item_kind is null then
    raise exception 'catalog item % not found for stock count', p_item_id;
  end if;

  if v_item_kind <> 'ingredient' and v_has_recipe then
    raise exception 'stock counts are restricted to ingredient items or non-recipe items';
  end if;

  if v_period.status <> 'open' then
    raise exception 'stock period is not open';
  end if;

  select exists (
    select 1 from public.warehouse_stock_counts wsc
    where wsc.period_id = p_period_id
      and wsc.item_id = p_item_id
      and public.normalize_variant_key(wsc.variant_key) = v_variant
      and wsc.kind = 'opening'
  ) into v_has_opening;

  if v_kind not in ('opening', 'closing') then
    v_kind := 'auto';
  end if;

  if v_kind = 'closing' and not v_has_opening then
    v_kind := 'opening';
  end if;

  if v_kind = 'auto' then
    v_kind := case when v_has_opening then 'closing' else 'opening' end;
  end if;

  if v_kind = 'opening' then
    insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
    values (p_period_id, p_item_id, v_variant, p_qty, 'opening', auth.uid(), coalesce(p_context, '{}'))
    on conflict (period_id, item_id, variant_key, kind)
    do update set
      counted_qty = excluded.counted_qty,
      counted_by = excluded.counted_by,
      counted_at = now(),
      context = excluded.context
    returning * into v_row;

    insert into public.outlet_stock_balances(outlet_id, item_id, variant_key, sent_units, consumed_units)
    select
      ow.outlet_id,
      p_item_id,
      v_variant,
      p_qty + coalesce(osb.consumed_units, 0),
      coalesce(osb.consumed_units, 0)
    from public.outlet_warehouses ow
    left join public.outlet_stock_balances osb
      on osb.outlet_id = ow.outlet_id
     and osb.item_id = p_item_id
     and osb.variant_key = v_variant
    where ow.warehouse_id = v_period.warehouse_id
      and coalesce(ow.show_in_stocktake, true)
    on conflict (outlet_id, item_id, variant_key)
    do update set
      sent_units = excluded.sent_units,
      updated_at = now();

    return v_row;
  end if;

  insert into public.warehouse_stock_counts(period_id, item_id, variant_key, counted_qty, kind, counted_by, context)
  values (p_period_id, p_item_id, v_variant, p_qty, v_kind, auth.uid(), coalesce(p_context, '{}'))
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
