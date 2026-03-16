create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  number_plate text,
  driver_name text,
  photo_urls text[] not null default '{}',
  warehouse_id uuid references public.warehouses(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.vehicles is 'Fuel scanner vehicles list.';

create index if not exists vehicles_name_idx on public.vehicles (name);
create index if not exists vehicles_warehouse_idx on public.vehicles (warehouse_id);

alter table public.vehicles enable row level security;

create policy vehicles_admin_rw on public.vehicles
  for all to authenticated
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

create policy vehicles_select_backoffice on public.vehicles
  for select to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid
    )
  );

create policy vehicles_select_stocktake on public.vehicles
  for select to authenticated
  using (has_stocktake_role(auth.uid()) or is_admin(auth.uid()));
