-- Sync opening stock counts to outlet balances for mapped outlets.
create or replace function public.record_stock_count(
  p_period_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_variant_key text default 'base'::text,
  p_kind text default 'closing'::text,
  p_context jsonb default '{}'::jsonb
)
returns public.warehouse_stock_counts
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_period public.warehouse_stock_periods%rowtype;
  v_row public.warehouse_stock_counts%rowtype;
  v_item_kind item_kind;
  v_has_recipe boolean := false;
  v_variant text := public.normalize_variant_key(p_variant_key);
  v_has_opening boolean := false;
begin
  if not public.is_stocktake_user(auth.uid()) then
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

  select exists (
    select 1 from public.warehouse_stock_counts wsc
    where wsc.period_id = p_period_id
      and wsc.item_id = p_item_id
      and wsc.variant_key = v_variant
      and wsc.kind = 'opening'
  ) into v_has_opening;

  if not v_has_opening then
    raise exception 'opening count required before closing';
  end if;

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
$function$;
