-- Use admin privileges to manage Storage schema and policies
-- Run this in the Supabase SQL editor while connected as service_role/postgres.
-- If your workspace disallows SET ROLE, leave the next line commented.
-- set local role supabase_admin;

-- Create bucket (private)
insert into storage.buckets (id, name, public)
values ('invoices','invoices', false)
on conflict (id) do nothing;

-- Ensure RLS is enabled on storage.objects (it usually is by default in Supabase)
alter table storage.objects enable row level security;

-- Storage policies: authenticated users may read/write only within their own outlet folder
-- Safely recreate policies
drop policy if exists invoices_auth_read on storage.objects;
drop policy if exists invoices_auth_write on storage.objects;
drop policy if exists invoices_auth_update on storage.objects;

-- Helper to read the outlet_id claim
-- current_setting('request.jwt.claims', true) returns JSON with your JWT claims
-- We'll reuse it in each policy expression

create policy invoices_auth_read on storage.objects
for select to authenticated
using (
	bucket_id = 'invoices'
	and (current_setting('request.jwt.claims', true)::jsonb ->> 'outlet_id') is not null
	and name like (current_setting('request.jwt.claims', true)::jsonb ->> 'outlet_id') || '/%'
);

create policy invoices_auth_write on storage.objects
for insert to authenticated
with check (
	bucket_id = 'invoices'
	and name like (current_setting('request.jwt.claims', true)::jsonb ->> 'outlet_id') || '/%'
);

create policy invoices_auth_update on storage.objects
for update to authenticated
using (
	bucket_id = 'invoices'
	and name like (current_setting('request.jwt.claims', true)::jsonb ->> 'outlet_id') || '/%'
)
with check (
	bucket_id = 'invoices'
	and name like (current_setting('request.jwt.claims', true)::jsonb ->> 'outlet_id') || '/%'
);