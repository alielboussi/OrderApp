-- RLS for new consolidated tables

-- counter_values: service role only
alter table public.counter_values enable row level security;

create policy counter_values_service_all on public.counter_values
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- outlet_item_routes: allow outlet members to read, service role to write
alter table public.outlet_item_routes enable row level security;

create policy outlet_item_routes_select on public.outlet_item_routes
  for select
  using (
    auth.role() = 'service_role'
    or outlet_id = any(coalesce(public.member_outlet_ids(auth.uid()), array[]::uuid[]))
  );

create policy outlet_item_routes_write on public.outlet_item_routes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
