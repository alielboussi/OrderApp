-- Policies for the 'orders' bucket using auth.uid() + outlet_users mapping (UUID outlet ids)
-- Assumes the bucket 'orders' already exists and storage.objects RLS is enabled.

-- Public read of order PDFs
drop policy if exists "Public read orders" on storage.objects;
create policy "Public read orders"
on storage.objects for select
using (bucket_id = 'orders');

-- INSERT allowed only into orders/<outlet_id>/* for the caller's mapped outlet
drop policy if exists "Outlet insert orders (auth.uid)" on storage.objects;
create policy "Outlet insert orders (auth.uid)"
on storage.objects for insert
with check (
  bucket_id = 'orders'
  and exists (
    select 1 from public.outlet_users ou
    where ou.user_id = auth.uid()
      and name like (ou.outlet_id::text || '/%')
  )
);

-- UPDATE allowed within the same outlet folder
drop policy if exists "Outlet update orders (auth.uid)" on storage.objects;
create policy "Outlet update orders (auth.uid)"
on storage.objects for update
using (
  bucket_id = 'orders'
  and exists (
    select 1 from public.outlet_users ou
    where ou.user_id = auth.uid()
      and name like (ou.outlet_id::text || '/%')
  )
)
with check (
  bucket_id = 'orders'
  and exists (
    select 1 from public.outlet_users ou
    where ou.user_id = auth.uid()
      and name like (ou.outlet_id::text || '/%')
  )
);

-- DELETE allowed within the outlet folder
drop policy if exists "Outlet delete orders (auth.uid)" on storage.objects;
create policy "Outlet delete orders (auth.uid)"
on storage.objects for delete
using (
  bucket_id = 'orders'
  and exists (
    select 1 from public.outlet_users ou
    where ou.user_id = auth.uid()
      and name like (ou.outlet_id::text || '/%')
  )
);
