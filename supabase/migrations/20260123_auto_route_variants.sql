-- Auto-propagate outlet routes + outlet_products for newly added variants
-- When catalog_items.variants changes, copy base route to all variant keys.

create or replace function public.sync_variant_routes_from_base()
returns trigger
language plpgsql
as $$
declare
  variant_keys text[];
  route_row record;
begin
  if coalesce(new.has_variations, false) is false or new.variants is null then
    return new;
  end if;

  select array_agg(distinct key) into variant_keys
  from (
    select
      coalesce(nullif(trim(elem->>'key'), ''), nullif(trim(elem->>'id'), '')) as key
    from jsonb_array_elements(new.variants) elem
  ) keys
  where key is not null and lower(key) <> 'base';

  if variant_keys is null or array_length(variant_keys, 1) is null then
    return new;
  end if;

  for route_row in
    select outlet_id, warehouse_id, deduct_enabled, target_outlet_id
    from outlet_item_routes
    where item_id = new.id and normalized_variant_key = 'base'
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
    select
      route_row.outlet_id,
      new.id,
      route_row.warehouse_id,
      key,
      key,
      coalesce(route_row.deduct_enabled, true),
      route_row.target_outlet_id
    from unnest(variant_keys) as key
    on conflict (outlet_id, item_id, normalized_variant_key)
      do update set
        warehouse_id = excluded.warehouse_id,
        deduct_enabled = excluded.deduct_enabled,
        target_outlet_id = excluded.target_outlet_id;

    insert into outlet_products (outlet_id, item_id, variant_key, enabled)
    select route_row.outlet_id, new.id, key, true
    from unnest(variant_keys) as key
    on conflict (outlet_id, item_id, variant_key)
      do update set enabled = excluded.enabled;
  end loop;

  return new;
end;
$$;

-- Fire only when variants or has_variations changes
create trigger trg_sync_variant_routes_from_base
after insert or update of variants, has_variations on public.catalog_items
for each row
execute function public.sync_variant_routes_from_base();
