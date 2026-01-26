-- Warehouse Backoffice audit logs
create table if not exists public.warehouse_backoffice_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid null,
  user_email text null,
  action text not null,
  page text null,
  method text null,
  status integer null,
  details jsonb null
);

create index if not exists idx_wb_logs_created_at on public.warehouse_backoffice_logs (created_at desc);
create index if not exists idx_wb_logs_user_id on public.warehouse_backoffice_logs (user_id);
create index if not exists idx_wb_logs_action on public.warehouse_backoffice_logs (action);

alter table public.warehouse_backoffice_logs enable row level security;

-- Allow inserts from any authenticated user
drop policy if exists wb_logs_insert_auth on public.warehouse_backoffice_logs;
create policy wb_logs_insert_auth
  on public.warehouse_backoffice_logs
  for insert
  to authenticated
  with check (auth.uid() is not null);

-- Allow read for admins or backoffice role
drop policy if exists wb_logs_select_admin_backoffice on public.warehouse_backoffice_logs;
create policy wb_logs_select_admin_backoffice
  on public.warehouse_backoffice_logs
  for select
  to authenticated
  using (
    is_admin(auth.uid())
    or exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
    )
  );
