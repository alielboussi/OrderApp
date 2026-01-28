-- Create catalog_variants table and migrate JSON variants

create table if not exists public.catalog_variants (
  id text not null,
  item_id uuid not null references public.catalog_items(id) on delete cascade,
  name text not null,
  sku text,
  supplier_sku text,
  item_kind public.item_kind not null default 'finished',
  consumption_uom text not null default 'each',
  stocktake_uom text,
  purchase_pack_unit text not null default 'each',
  units_per_purchase_pack numeric not null default 1,
  purchase_unit_mass numeric,
  purchase_unit_mass_uom text,
  transfer_unit text not null default 'each',
  transfer_quantity numeric not null default 1,
  qty_decimal_places integer,
  cost numeric not null default 0,
  selling_price numeric,
  locked_from_warehouse_id uuid references public.warehouses(id),
  outlet_order_visible boolean not null default true,
  image_url text,
  default_warehouse_id uuid references public.warehouses(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_variants_item_key unique (item_id, id)
);

create index if not exists idx_catalog_variants_item_id on public.catalog_variants(item_id);

alter table public.catalog_variants enable row level security;

drop policy if exists catalog_variants_admin_rw on public.catalog_variants;
create policy catalog_variants_admin_rw on public.catalog_variants
  for all to public
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

drop policy if exists catalog_variants_read_kiosk_anon on public.catalog_variants;
create policy catalog_variants_read_kiosk_anon on public.catalog_variants
  for select to anon
  using (active = true);

drop policy if exists catalog_variants_select_active on public.catalog_variants;
create policy catalog_variants_select_active on public.catalog_variants
  for select to authenticated
  using ((auth.uid() is not null) and active);

drop policy if exists catalog_variants_select_any_auth on public.catalog_variants;
create policy catalog_variants_select_any_auth on public.catalog_variants
  for select to authenticated
  using (true);

insert into public.catalog_variants (
  id,
  item_id,
  name,
  sku,
  supplier_sku,
  item_kind,
  consumption_uom,
  stocktake_uom,
  purchase_pack_unit,
  units_per_purchase_pack,
  purchase_unit_mass,
  purchase_unit_mass_uom,
  transfer_unit,
  transfer_quantity,
  qty_decimal_places,
  cost,
  selling_price,
  locked_from_warehouse_id,
  outlet_order_visible,
  image_url,
  default_warehouse_id,
  active,
  created_at,
  updated_at
)
select
  coalesce(nullif(trim(elem->>'id'), ''), nullif(trim(elem->>'key'), '')) as id,
  ci.id as item_id,
  coalesce(nullif(elem->>'name', ''), 'Variant') as name,
  nullif(elem->>'sku', '') as sku,
  nullif(elem->>'supplier_sku', '') as supplier_sku,
  coalesce(nullif(elem->>'item_kind', ''), ci.item_kind::text)::public.item_kind as item_kind,
  coalesce(nullif(elem->>'consumption_uom', ''), nullif(elem->>'purchase_pack_unit', ''), 'each') as consumption_uom,
  nullif(elem->>'stocktake_uom', '') as stocktake_uom,
  coalesce(nullif(elem->>'purchase_pack_unit', ''), 'each') as purchase_pack_unit,
  coalesce(nullif(elem->>'units_per_purchase_pack', '')::numeric, 1) as units_per_purchase_pack,
  nullif(elem->>'purchase_unit_mass', '')::numeric as purchase_unit_mass,
  nullif(elem->>'purchase_unit_mass_uom', '') as purchase_unit_mass_uom,
  coalesce(nullif(elem->>'transfer_unit', ''), nullif(elem->>'purchase_pack_unit', ''), 'each') as transfer_unit,
  coalesce(nullif(elem->>'transfer_quantity', '')::numeric, 1) as transfer_quantity,
  nullif(elem->>'qty_decimal_places', '')::integer as qty_decimal_places,
  coalesce(nullif(elem->>'cost', '')::numeric, 0) as cost,
  nullif(elem->>'selling_price', '')::numeric as selling_price,
  nullif(elem->>'locked_from_warehouse_id', '')::uuid as locked_from_warehouse_id,
  coalesce((elem->>'outlet_order_visible')::boolean, true) as outlet_order_visible,
  nullif(elem->>'image_url', '') as image_url,
  nullif(elem->>'default_warehouse_id', '')::uuid as default_warehouse_id,
  coalesce((elem->>'active')::boolean, true) as active,
  now(),
  now()
from public.catalog_items ci
cross join lateral jsonb_array_elements(coalesce(ci.variants, '[]'::jsonb)) elem
where coalesce(nullif(trim(elem->>'id'), ''), nullif(trim(elem->>'key'), '')) is not null
on conflict (item_id, id) do update set
  name = excluded.name,
  sku = excluded.sku,
  supplier_sku = excluded.supplier_sku,
  item_kind = excluded.item_kind,
  consumption_uom = excluded.consumption_uom,
  stocktake_uom = excluded.stocktake_uom,
  purchase_pack_unit = excluded.purchase_pack_unit,
  units_per_purchase_pack = excluded.units_per_purchase_pack,
  purchase_unit_mass = excluded.purchase_unit_mass,
  purchase_unit_mass_uom = excluded.purchase_unit_mass_uom,
  transfer_unit = excluded.transfer_unit,
  transfer_quantity = excluded.transfer_quantity,
  qty_decimal_places = excluded.qty_decimal_places,
  cost = excluded.cost,
  selling_price = excluded.selling_price,
  locked_from_warehouse_id = excluded.locked_from_warehouse_id,
  outlet_order_visible = excluded.outlet_order_visible,
  image_url = excluded.image_url,
  default_warehouse_id = excluded.default_warehouse_id,
  active = excluded.active,
  updated_at = now();

create or replace function public.refresh_catalog_has_variations(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_item_id is null then
    return;
  end if;
  update public.catalog_items ci
  set has_variations = exists (
        select 1
        from public.catalog_variants cv
        where cv.item_id = p_item_id
          and coalesce(cv.active, true)
      ),
      updated_at = now()
  where ci.id = p_item_id;
end;
$$;

create or replace function public.refresh_catalog_has_variations_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.refresh_catalog_has_variations(coalesce(new.item_id, old.item_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_refresh_catalog_has_variations on public.catalog_variants;
create trigger trg_refresh_catalog_has_variations
after insert or update or delete on public.catalog_variants
for each row execute function public.refresh_catalog_has_variations_trigger();

create or replace function public.sync_variant_routes_from_base()
returns trigger
language plpgsql
as $$
declare
  variant_key text;
  route_row record;
begin
  if coalesce(new.active, true) is false then
    return new;
  end if;

  variant_key := public.normalize_variant_key(new.id);
  if variant_key = 'base' then
    return new;
  end if;

  for route_row in
    select outlet_id, warehouse_id, deduct_enabled, target_outlet_id
    from outlet_item_routes
    where item_id = new.item_id and normalized_variant_key = 'base'
  loop
    insert into outlet_item_routes (
      outlet_id,
      item_id,
      warehouse_id,
      variant_key,
      normalized_variant_key,
      deduct_enabled,
      target_outlet_id
    )
    values (
      route_row.outlet_id,
      new.item_id,
      route_row.warehouse_id,
      new.id,
      variant_key,
      coalesce(route_row.deduct_enabled, true),
      route_row.target_outlet_id
    )
    on conflict (outlet_id, item_id, normalized_variant_key)
      do update set
        warehouse_id = excluded.warehouse_id,
        deduct_enabled = excluded.deduct_enabled,
        target_outlet_id = excluded.target_outlet_id;

    insert into outlet_products (outlet_id, item_id, variant_key, enabled)
    values (route_row.outlet_id, new.item_id, variant_key, true)
    on conflict (outlet_id, item_id, variant_key)
      do update set enabled = excluded.enabled;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_sync_variant_routes_from_base on public.catalog_items;
create trigger trg_sync_variant_routes_from_base
after insert or update on public.catalog_variants
for each row execute function public.sync_variant_routes_from_base();

create or replace function public.sync_variant_routes_from_base_route()
returns trigger
language plpgsql
as $$
declare
  variant_keys text[];
begin
  if coalesce(new.normalized_variant_key, '') <> 'base' then
    return new;
  end if;

  select array_agg(distinct cv.id) into variant_keys
  from public.catalog_variants cv
  where cv.item_id = new.item_id
    and coalesce(cv.active, true)
    and public.normalize_variant_key(cv.id) <> 'base';

  if variant_keys is null or array_length(variant_keys, 1) is null then
    return new;
  end if;

  insert into public.outlet_item_routes (
    outlet_id,
    item_id,
    warehouse_id,
    variant_key,
    normalized_variant_key,
    deduct_enabled,
    target_outlet_id
  )
  select
    new.outlet_id,
    new.item_id,
    new.warehouse_id,
    key,
    public.normalize_variant_key(key),
    coalesce(new.deduct_enabled, true),
    new.target_outlet_id
  from unnest(variant_keys) as key
  on conflict (outlet_id, item_id, normalized_variant_key)
    do update set
      warehouse_id = excluded.warehouse_id,
      deduct_enabled = excluded.deduct_enabled,
      target_outlet_id = excluded.target_outlet_id;

  insert into public.outlet_products (outlet_id, item_id, variant_key, enabled)
  select new.outlet_id, new.item_id, key, true
  from unnest(variant_keys) as key
  on conflict (outlet_id, item_id, variant_key)
    do update set enabled = excluded.enabled;

  return new;
end;
$$;

create or replace view public.warehouse_stock_items as
with base as (
  select
    w.id as warehouse_id,
    ci.id as item_id,
    ci.name as item_name,
    coalesce(public.normalize_variant_key(sl.variant_key), 'base') as variant_key,
    sum(sl.delta_units) as net_units,
    ci.cost as unit_cost,
    ci.item_kind as base_item_kind,
    ci.image_url,
    cv.item_kind as variant_item_kind
  from public.stock_ledger sl
  join public.warehouses w on w.id = sl.warehouse_id
  join public.catalog_items ci on ci.id = sl.item_id
  left join public.catalog_variants cv
    on cv.item_id = ci.id
    and public.normalize_variant_key(cv.id) = public.normalize_variant_key(sl.variant_key)
    and coalesce(cv.active, true)
  where sl.location_type = 'warehouse'
  group by w.id, ci.id, ci.name, ci.cost, ci.item_kind, ci.image_url, public.normalize_variant_key(sl.variant_key), cv.item_kind
),
rich as (
  select
    b.warehouse_id,
    b.item_id,
    b.item_name,
    b.variant_key,
    b.net_units,
    b.unit_cost,
    b.base_item_kind,
    b.image_url,
    b.variant_item_kind,
    exists (
      select 1
      from public.recipes r
      where r.active
        and r.finished_item_id = b.item_id
        and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = b.variant_key
    ) as has_recipe
  from base b
)
select
  warehouse_id,
  item_id,
  item_name,
  variant_key,
  net_units,
  unit_cost,
  case
    when variant_item_kind in ('finished', 'ingredient', 'raw') then variant_item_kind::public.item_kind
    else base_item_kind
  end as item_kind,
  image_url,
  has_recipe
from rich;

create or replace function public.list_warehouse_items(p_warehouse_id uuid, p_outlet_id uuid, p_search text default null::text)
returns setof public.warehouse_stock_items
language sql
stable security definer
set search_path to 'public'
as $$
  with mapped_outlets as (
    select ow.outlet_id
    from public.outlet_warehouses ow
    where ow.warehouse_id = p_warehouse_id
      and coalesce(ow.show_in_stocktake, true)
  ),
  mapped_products as (
    select
      p_warehouse_id as warehouse_id,
      op.item_id,
      ci.name as item_name,
      public.normalize_variant_key(coalesce(op.variant_key, 'base')) as variant_key,
      0::numeric as net_units,
      coalesce(ci.cost, 0)::numeric as unit_cost,
      ci.image_url,
      ci.item_kind as base_item_kind,
      cv.item_kind as variant_item_kind,
      exists (
        select 1 from public.recipes r
        where r.active
          and r.finished_item_id = op.item_id
          and public.normalize_variant_key(coalesce(r.finished_variant_key, 'base')) = public.normalize_variant_key(coalesce(op.variant_key, 'base'))
      ) as has_recipe
    from public.outlet_products op
    join public.catalog_items ci on ci.id = op.item_id
    left join public.catalog_variants cv
      on cv.item_id = op.item_id
      and public.normalize_variant_key(cv.id) = public.normalize_variant_key(coalesce(op.variant_key, 'base'))
      and coalesce(cv.active, true)
    where op.outlet_id in (select outlet_id from mapped_outlets)
      and op.enabled = true
  ),
  mapped_enriched as (
    select
      mp.warehouse_id,
      mp.item_id,
      mp.item_name,
      mp.variant_key,
      mp.net_units,
      mp.unit_cost,
      mp.image_url,
      mp.has_recipe,
      case
        when mp.variant_item_kind in ('finished','ingredient','raw') then mp.variant_item_kind::public.item_kind
        else mp.base_item_kind
      end as item_kind
    from mapped_products mp
  )
  select
    wsi.warehouse_id,
    wsi.item_id,
    wsi.item_name,
    wsi.variant_key,
    wsi.net_units,
    wsi.unit_cost,
    wsi.item_kind,
    wsi.image_url,
    wsi.has_recipe
  from public.warehouse_stock_items wsi
  where wsi.warehouse_id = p_warehouse_id
    and (
      p_search is null
      or wsi.item_name ilike ('%' || p_search || '%')
    )

  union

  select
    me.warehouse_id,
    me.item_id,
    me.item_name,
    me.variant_key,
    me.net_units,
    me.unit_cost,
    me.item_kind,
    me.image_url,
    me.has_recipe
  from mapped_enriched me
  where (
      p_search is null
      or me.item_name ilike ('%' || p_search || '%')
    )

  order by item_name asc, variant_key asc;
$$;

update public.catalog_items ci
set has_variations = exists (
  select 1 from public.catalog_variants cv
  where cv.item_id = ci.id and coalesce(cv.active, true)
);

alter table public.catalog_items drop column if exists variants;
