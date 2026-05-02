insert into storage.buckets (id, name, public)
values ('Damages', 'Damages', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'storage_damages_read'
  ) then
    create policy storage_damages_read
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'Damages');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'storage_damages_insert'
  ) then
    create policy storage_damages_insert
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'Damages');
  end if;
end $$;
