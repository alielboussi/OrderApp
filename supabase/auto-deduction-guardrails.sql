-- Guardrails to keep new outlets/items/variants deducting automatically.

-- 1) Backfill base routes for every outlet + item (uses outlet default sales warehouse).
insert into public.outlet_item_routes (
  outlet_id,
  item_id,
  warehouse_id,
  target_outlet_id,
  deduct_enabled,
  variant_key,
  normalized_variant_key
)
select o.id,
       ci.id,
       o.default_sales_warehouse_id,
       o.id,
       true,
       'base',
       'base'
from public.outlets o
cross join public.catalog_items ci
where o.default_sales_warehouse_id is not null
  and not exists (
    select 1
    from public.outlet_item_routes r
    where r.outlet_id = o.id
      and r.item_id = ci.id
      and r.normalized_variant_key = 'base'
  );

-- 2) When a new outlet is created (or default sales warehouse set), auto-seed base routes.
create or replace function public.seed_outlet_routes_on_outlet()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.default_sales_warehouse_id is null then
    return new;
  end if;

  insert into public.outlet_item_routes (
    outlet_id,
    item_id,
    warehouse_id,
    target_outlet_id,
    deduct_enabled,
    variant_key,
    normalized_variant_key
  )
  select new.id,
         ci.id,
         new.default_sales_warehouse_id,
         new.id,
         true,
         'base',
         'base'
  from public.catalog_items ci
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_seed_outlet_routes_on_outlet on public.outlets;
create trigger trg_seed_outlet_routes_on_outlet
after insert or update of default_sales_warehouse_id on public.outlets
for each row
execute function public.seed_outlet_routes_on_outlet();

-- 3) When a new catalog item is created, auto-seed base routes for every outlet.
create or replace function public.seed_outlet_routes_on_item()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.outlet_item_routes (
    outlet_id,
    item_id,
    warehouse_id,
    target_outlet_id,
    deduct_enabled,
    variant_key,
    normalized_variant_key
  )
  select o.id,
         new.id,
         o.default_sales_warehouse_id,
         o.id,
         true,
         'base',
         'base'
  from public.outlets o
  where o.default_sales_warehouse_id is not null
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_seed_outlet_routes_on_item on public.catalog_items;
create trigger trg_seed_outlet_routes_on_item
after insert on public.catalog_items
for each row
execute function public.seed_outlet_routes_on_item();
