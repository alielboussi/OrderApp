-- Auto-propagate outlet routes + outlet_products for variants and recipe ingredients

-- 1) When a base outlet route is saved, copy to all variant keys
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

  select array_agg(distinct key) into variant_keys
  from (
    select coalesce(nullif(trim(elem->>'key'), ''), nullif(trim(elem->>'id'), '')) as key
    from public.catalog_items ci
    cross join lateral jsonb_array_elements(ci.variants) elem
    where ci.id = new.item_id
  ) keys
  where key is not null and lower(key) <> 'base';

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
    key,
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

create trigger trg_sync_variant_routes_from_base_route
after insert or update of warehouse_id, deduct_enabled, target_outlet_id on public.outlet_item_routes
for each row
when (new.normalized_variant_key = 'base')
execute function public.sync_variant_routes_from_base_route();

-- 2) When a recipe ingredient is added/activated, ensure ingredient appears for the same outlets
create or replace function public.sync_recipe_ingredient_outlet_products()
returns trigger
language plpgsql
as $$
declare
  finished_id uuid;
  ingredient_id uuid;
  recipe_kind text;
  recipe_active boolean;
begin
  finished_id := coalesce(new.finished_item_id, old.finished_item_id);
  ingredient_id := coalesce(new.ingredient_item_id, old.ingredient_item_id);
  recipe_kind := coalesce(new.recipe_for_kind, old.recipe_for_kind);
  recipe_active := coalesce(new.active, old.active, false);

  if finished_id is null or ingredient_id is null then
    return coalesce(new, old);
  end if;

  if recipe_kind <> 'finished' or recipe_active = false then
    return coalesce(new, old);
  end if;

  insert into public.outlet_products (outlet_id, item_id, variant_key, enabled)
  select distinct r.outlet_id, ingredient_id, 'base', true
  from public.outlet_item_routes r
  where r.item_id = finished_id
    and r.normalized_variant_key = 'base'
  on conflict (outlet_id, item_id, variant_key)
    do update set enabled = excluded.enabled;

  return coalesce(new, old);
end;
$$;

create trigger trg_sync_recipe_ingredient_outlet_products
after insert or update of ingredient_item_id, finished_item_id, active, recipe_for_kind on public.recipes
for each row
execute function public.sync_recipe_ingredient_outlet_products();
