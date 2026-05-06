create or replace function public.sync_item_storage_homes_from_item()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item_id uuid;
  v_ids uuid[];
begin
  v_item_id := coalesce(new.id, old.id);
  if v_item_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    delete from public.item_storage_homes
    where item_id = v_item_id
      and normalized_variant_key = 'base';
    return old;
  end if;

  v_ids := array(
    select distinct id
    from (
      select unnest(coalesce(new.storage_home_ids, array[]::uuid[])) as id
      union all
      select unnest(array[ new.storage_home_id, new.default_warehouse_id ]::uuid[]) as id
    ) t
    where id is not null
  );

  delete from public.item_storage_homes
  where item_id = v_item_id
    and normalized_variant_key = 'base';

  if v_ids is not null and array_length(v_ids, 1) is not null then
    insert into public.item_storage_homes (item_id, variant_key, normalized_variant_key, storage_warehouse_id)
    select v_item_id, 'base', 'base', unnest(v_ids)
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

create or replace function public.sync_item_storage_homes_from_variant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item_id uuid;
  v_variant_key text;
  v_ids uuid[];
begin
  v_item_id := coalesce(new.item_id, old.item_id);
  v_variant_key := public.normalize_variant_key(coalesce(new.id, old.id));
  if v_item_id is null or v_variant_key is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    delete from public.item_storage_homes
    where item_id = v_item_id
      and normalized_variant_key = v_variant_key;
    return old;
  end if;

  v_ids := array(
    select distinct id
    from (
      select unnest(coalesce(new.storage_home_ids, array[]::uuid[])) as id
      union all
      select unnest(array[ new.storage_home_id, new.default_warehouse_id ]::uuid[]) as id
    ) t
    where id is not null
  );

  delete from public.item_storage_homes
  where item_id = v_item_id
    and normalized_variant_key = v_variant_key;

  if v_ids is not null and array_length(v_ids, 1) is not null then
    insert into public.item_storage_homes (item_id, variant_key, normalized_variant_key, storage_warehouse_id)
    select v_item_id, v_variant_key, v_variant_key, unnest(v_ids)
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

create trigger trg_sync_item_storage_homes_from_item
after insert or update or delete on public.catalog_items
for each row execute function public.sync_item_storage_homes_from_item();

create trigger trg_sync_item_storage_homes_from_variant
after insert or update or delete on public.catalog_variants
for each row execute function public.sync_item_storage_homes_from_variant();
