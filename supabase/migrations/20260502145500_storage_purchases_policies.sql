insert into storage.buckets (id, name, public)
values ('Purchases', 'Purchases', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('Transfers', 'Transfers', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'storage_purchases_read'
  ) then
    create policy storage_purchases_read
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'Purchases');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'storage_purchases_insert'
  ) then
    create policy storage_purchases_insert
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'Purchases');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'storage_transfers_read'
  ) then
    create policy storage_transfers_read
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'Transfers');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'storage_transfers_insert'
  ) then
    create policy storage_transfers_insert
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'Transfers');
  end if;
end $$;
