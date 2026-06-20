-- Global schedule for catalog updates sent to outlet middlewares.
-- Apply this in Supabase SQL editor before using /Warehouse_Backoffice/middleware-updates.

create table if not exists public.middleware_catalog_schedule (
  id text primary key,
  scheduled_at timestamptz null,
  updated_at timestamptz not null default now()
);

insert into public.middleware_catalog_schedule (id, scheduled_at)
values ('global', null)
on conflict (id) do nothing;
