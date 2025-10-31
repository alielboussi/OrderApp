-- Create a bucket to store product and variation images
-- Run this in Supabase SQL editor as the owner role (or via Dashboard > Storage).

-- 1) Public bucket so image_url can be a direct, cacheable URL
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict do nothing;

-- 2) Allow public read of objects in the products bucket (redundant when public=true but explicit)
drop policy if exists products_public_read on storage.objects;
create policy products_public_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'products');

-- 3) Allow authenticated users to upload/modify images in this bucket (optional)
drop policy if exists products_auth_write on storage.objects;
create policy products_auth_write on storage.objects
for insert to authenticated
with check (bucket_id = 'products');

drop policy if exists products_auth_update on storage.objects;
create policy products_auth_update on storage.objects
for update to authenticated
using (bucket_id = 'products')
with check (bucket_id = 'products');

-- 4) (Optional) Restrict delete to authenticated
drop policy if exists products_auth_delete on storage.objects;
create policy products_auth_delete on storage.objects
for delete to authenticated
using (bucket_id = 'products');

-- How to reference images in the app:
-- If you upload file at path `menu/<sku>.jpg` in bucket `products`,
-- set products.image_url to:
--   https://<your-project>.supabase.co/storage/v1/object/public/products/menu/<sku>.jpg
-- Variation images can be set similarly using product_variations.image_url.
