-- Enable RLS if it is not already enabled
alter table public.outlet_warehouses enable row level security;

-- Admin-only read/write policy
create policy "outlet_warehouses_admin_rw" on public.outlet_warehouses
for all
to authenticated
using (is_admin(auth.uid()))
with check (is_admin(auth.uid()));
