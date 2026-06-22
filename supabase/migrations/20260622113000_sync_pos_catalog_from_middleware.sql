create or replace function public.sync_pos_catalog_from_middleware(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items_updated int := 0;
  v_variants_updated int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  with src as (
    select
      nullif(trim(item_sku), '') as item_sku,
      nullif(trim(item_name), '') as item_name,
      nullif(trim(variant_name), '') as variant_name,
      nullif(trim(variant_sku), '') as variant_sku
    from jsonb_to_recordset(p_rows) as r(
      item_sku text,
      item_name text,
      variant_name text,
      variant_sku text
    )
  ),
  upd as (
    update public.catalog_items ci
    set
      name = coalesce(src.item_name, ci.name),
      updated_at = now()
    from src
    where ci.item_kind = 'finished'
      and ci.sku = src.item_sku
      and src.item_sku is not null
      and src.item_name is not null
    returning 1
  )
  select count(*) into v_items_updated from upd;

  with src as (
    select
      nullif(trim(item_sku), '') as item_sku,
      nullif(trim(variant_name), '') as variant_name,
      nullif(trim(variant_sku), '') as variant_sku
    from jsonb_to_recordset(p_rows) as r(
      item_sku text,
      item_name text,
      variant_name text,
      variant_sku text
    )
  ),
  upd as (
    update public.catalog_variants cv
    set
      name = src.variant_name,
      sku = coalesce(src.variant_sku, cv.sku),
      updated_at = now()
    from src
    join public.catalog_items ci on ci.id = cv.item_id
    where ci.item_kind = 'finished'
      and ci.sku = src.item_sku
      and src.item_sku is not null
      and src.variant_name is not null
      and lower(trim(cv.name)) = lower(trim(src.variant_name))
    returning 1
  )
  select count(*) into v_variants_updated from upd;

  return jsonb_build_object(
    'ok', true,
    'items_updated', v_items_updated,
    'variants_updated', v_variants_updated
  );
end;
$$;

grant execute on function public.sync_pos_catalog_from_middleware(jsonb) to anon, authenticated, service_role;
