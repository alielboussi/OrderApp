-- Fix ambiguous variant_key reference in sync_variant_routes_from_base

create or replace function public.sync_variant_routes_from_base()
returns trigger
language plpgsql
as $$
declare
  v_variant_key text;
  route_row record;
begin
  if coalesce(new.active, true) is false then
    return new;
  end if;

  v_variant_key := public.normalize_variant_key(new.id);
  if v_variant_key = 'base' then
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
      v_variant_key,
      coalesce(route_row.deduct_enabled, true),
      route_row.target_outlet_id
    )
    on conflict (outlet_id, item_id, normalized_variant_key)
      do update set
        warehouse_id = excluded.warehouse_id,
        deduct_enabled = excluded.deduct_enabled,
        target_outlet_id = excluded.target_outlet_id;

    insert into outlet_products (outlet_id, item_id, variant_key, enabled)
    values (route_row.outlet_id, new.item_id, v_variant_key, true)
    on conflict (outlet_id, item_id, variant_key)
      do update set enabled = excluded.enabled;
  end loop;

  return new;
end;
$$;
