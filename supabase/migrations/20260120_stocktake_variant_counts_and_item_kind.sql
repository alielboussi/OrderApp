-- Stocktake: allow counting non-ingredient variants (when no recipe) and expose item kind in stock items view

-- 1) Enrich warehouse_stock_items with item_kind for UI filtering
create or replace view public.warehouse_stock_items as
with ingredients as (
  select
    w.id as warehouse_id,
    ci.id as item_id,
    ci.name as item_name,
    'base'::text as variant_key,
    coalesce(sum(sl.delta_units), 0)::numeric as net_units,
    ci.cost as unit_cost,
    ci.item_kind as item_kind,
    ci.image_url as image_url
  from public.warehouses w
  join public.catalog_items ci
    on ci.item_kind = 'ingredient'
   and ci.active
  left join public.stock_ledger sl
    on sl.warehouse_id = w.id
   and sl.location_type = 'warehouse'
   and sl.item_id = ci.id
  group by w.id, ci.id, ci.name, ci.cost, ci.item_kind, ci.image_url
),
variant_fallback as (
  -- Include product variants only when there is stock activity and no ingredient recipe exists.
  select
    sl.warehouse_id,
    sl.item_id,
    ci.name as item_name,
    public.normalize_variant_key(sl.variant_key) as variant_key,
    sum(sl.delta_units)::numeric as net_units,
    ci.cost as unit_cost,
    ci.item_kind as item_kind,
    ci.image_url as image_url
  from public.stock_ledger sl
  join public.warehouses w on w.id = sl.warehouse_id
  join public.catalog_items ci on ci.id = sl.item_id
  where sl.location_type = 'warehouse'
    and ci.item_kind <> 'ingredient'
    and public.normalize_variant_key(sl.variant_key) <> 'base'
    and not exists (
      select 1
      from public.recipes r
      where r.active
        and r.finished_item_id = ci.id
    )
  group by sl.warehouse_id, sl.item_id, ci.name, public.normalize_variant_key(sl.variant_key), ci.cost, ci.item_kind, ci.image_url
)
select * from ingredients
union all
select * from variant_fallback;

-- 2) Allow record_stock_count for ingredient items and non-ingredient items without active recipes
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
  v_has_recipe boolean := false;
  v_variant text := public.normalize_variant_key(p_variant_key);
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