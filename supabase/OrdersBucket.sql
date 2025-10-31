-- Create 'orders' storage bucket for order PDFs
insert into storage.buckets (id, name, public)
values ('orders', 'orders', true)
on conflict (id) do nothing;

-- Public read access to order PDFs
drop policy if exists "Public read orders" on storage.objects;
create policy "Public read orders"
on storage.objects for select
using (
  bucket_id = 'orders'
);

-- Allow authenticated users to upload and manage their own order PDFs
-- If you want to restrict paths by user/outlet, add a path-based check.
-- Enforce outlet-scoped paths for write/update/delete
-- Requires the JWT to include an 'outlet_id' claim set at login
alter table if exists storage.objects enable row level security;

drop policy if exists "Outlet-scoped insert orders" on storage.objects;
create policy "Outlet-scoped insert orders"
on storage.objects for insert
with check (
  bucket_id = 'orders'
  and (name like (coalesce(auth.jwt() ->> 'outlet_id', '')) || '/%')
);

drop policy if exists "Outlet-scoped update orders" on storage.objects;
create policy "Outlet-scoped update orders"
on storage.objects for update
using (
  bucket_id = 'orders'
  and (name like (coalesce(auth.jwt() ->> 'outlet_id', '')) || '/%')
)
with check (
  bucket_id = 'orders'
  and (name like (coalesce(auth.jwt() ->> 'outlet_id', '')) || '/%')
);

drop policy if exists "Outlet-scoped delete orders" on storage.objects;
create policy "Outlet-scoped delete orders"
on storage.objects for delete
using (
  bucket_id = 'orders'
  and (name like (coalesce(auth.jwt() ->> 'outlet_id', '')) || '/%')
);

-- Note: If your JWT does not yet contain 'outlet_id', update the login RPC to mint a custom JWT
-- with that claim so these policies can enforce the outlet folder prefix.
