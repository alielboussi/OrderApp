create or replace function public.sync_item_storage_homes_from_item()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item_id uuid;
  v_ids uuid[];
  v_new jsonb;
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

  v_new := to_jsonb(new);

  v_ids := array(
    select distinct id_text::uuid
    from (
      select jsonb_array_elements_text(coalesce(v_new->'storage_home_ids', '[]'::jsonb)) as id_text
      union all
      select jsonb_array_elements_text(
        jsonb_build_array(
          v_new->>'storage_home_id',
          v_new->>'default_warehouse_id'
        )
      ) as id_text
    ) t
    where id_text is not null
      and id_text <> ''
      and id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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
$$;

create or replace function public.sync_item_storage_homes_from_variant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item_id uuid;
  v_variant_key text;
  v_ids uuid[];
  v_new jsonb;
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

  v_new := to_jsonb(new);

  v_ids := array(
    select distinct id_text::uuid
    from (
      select jsonb_array_elements_text(coalesce(v_new->'storage_home_ids', '[]'::jsonb)) as id_text
      union all
      select jsonb_array_elements_text(
        jsonb_build_array(
          v_new->>'storage_home_id',
          v_new->>'default_warehouse_id'
        )
      ) as id_text
    ) t
    where id_text is not null
      and id_text <> ''
      and id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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
$$;
