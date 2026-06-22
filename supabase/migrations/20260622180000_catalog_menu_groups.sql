create table if not exists public.catalog_menu_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pos_menu_group_id integer,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_catalog_menu_groups_name_lower
  on public.catalog_menu_groups (lower(btrim(name)));

alter table public.catalog_items
  add column if not exists menu_group_id uuid references public.catalog_menu_groups(id) on delete set null;

create index if not exists idx_catalog_items_menu_group_id
  on public.catalog_items (menu_group_id);

create table if not exists public.middleware_update_drafts (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);

alter table public.middleware_update_drafts
  drop constraint if exists middleware_update_drafts_entity_type_check;

alter table public.middleware_update_drafts
  add constraint middleware_update_drafts_entity_type_check
  check (entity_type in ('item', 'variant', 'menu_group'));

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'outlet_catalog_sync_events'
  ) then
    alter table public.outlet_catalog_sync_events
      drop constraint if exists outlet_catalog_sync_events_entity_type_check;

    alter table public.outlet_catalog_sync_events
      add constraint outlet_catalog_sync_events_entity_type_check
      check (entity_type in ('item', 'variant', 'delete', 'menu_group', 'sync_pos_catalog'));
  end if;
end $$;

create or replace function public.sync_pos_menu_groups_from_middleware(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_groups_upserted int := 0;
  v_items_linked int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  with src as (
    select distinct
      nullif(trim(grp_row ->> 'group_name'), '') as group_name,
      nullif((grp_row ->> 'pos_menu_group_id'), '')::integer as pos_menu_group_id
    from jsonb_array_elements(p_rows) as grp_row
    where nullif(trim(grp_row ->> 'group_name'), '') is not null
  ),
  updated as (
    update public.catalog_menu_groups g
    set
      pos_menu_group_id = coalesce(src.pos_menu_group_id, g.pos_menu_group_id),
      updated_at = now()
    from src
    where lower(trim(g.name)) = lower(trim(src.group_name))
    returning g.id
  ),
  inserted as (
    insert into public.catalog_menu_groups (name, pos_menu_group_id, updated_at)
    select src.group_name, src.pos_menu_group_id, now()
    from src
    where not exists (
      select 1
      from public.catalog_menu_groups g
      where lower(trim(g.name)) = lower(trim(src.group_name))
    )
    returning id
  )
  select (select count(*) from updated) + (select count(*) from inserted) into v_groups_upserted;

  with src as (
    select
      nullif(trim(grp_row ->> 'item_sku'), '') as item_sku,
      nullif(trim(grp_row ->> 'group_name'), '') as group_name,
      nullif((grp_row ->> 'pos_menu_group_id'), '')::integer as pos_menu_group_id
    from jsonb_array_elements(p_rows) as grp_row
  ),
  grp as (
    select
      src.item_sku,
      coalesce(
        g_by_id.id,
        g_by_name.id
      ) as menu_group_id
    from src
    left join public.catalog_menu_groups g_by_id
      on g_by_id.pos_menu_group_id = src.pos_menu_group_id
    left join public.catalog_menu_groups g_by_name
      on lower(trim(g_by_name.name)) = lower(trim(src.group_name))
    where src.item_sku is not null
      and (src.group_name is not null or src.pos_menu_group_id is not null)
  ),
  upd as (
    update public.catalog_items ci
    set
      menu_group_id = grp.menu_group_id,
      updated_at = now()
    from grp
    where ci.item_kind = 'finished'
      and ci.sku = grp.item_sku
      and grp.menu_group_id is not null
    returning 1
  )
  select count(*) into v_items_linked from upd;

  return jsonb_build_object(
    'ok', true,
    'groups_upserted', v_groups_upserted,
    'items_linked', v_items_linked
  );
end;
$$;

grant execute on function public.sync_pos_menu_groups_from_middleware(jsonb) to anon, authenticated, service_role;
